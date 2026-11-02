// ============================================================
// IMPI Firearm Permit Register — main application
// ============================================================
(function () {
  'use strict';

  const CFG = window.IMPI_CONFIG || {};
  const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const D = window.IMPI_DOCKET;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = { user: null, issuer: null, officers: [], firearms: [], permits: [] };

  // ---------------- small UI helpers ----------------
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    $('toastHost').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  function notice(id, msg, kind) {
    $(id).innerHTML = msg ? `<div class="notice ${kind || 'err'}">${msg}</div>` : '';
  }
  function modal(html, opts) {
    closeModal();
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    bg.addEventListener('click', (e) => { if (e.target === bg && !(opts && opts.sticky)) closeModal(); });
    $('modalHost').appendChild(bg);
    return bg.firstChild;
  }
  function closeModal() { $('modalHost').innerHTML = ''; }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.l = btn.textContent; btn.disabled = true; btn.textContent = label || 'Please wait…'; }
    else { btn.disabled = false; btn.textContent = btn.dataset.l || btn.textContent; }
  }
  const errText = (e) => (e && (e.message || e.error_description)) || 'Something went wrong';

  // ---------------- helpers ----------------
  function genToken() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters
    const buf = new Uint32Array(6);
    crypto.getRandomValues(buf);
    return 'IMPI-' + Array.from(buf, (n) => abc[n % abc.length]).join('');
  }
  function normPhone(p) {
    let s = String(p || '').replace(/[^\d+]/g, '');
    if (s.startsWith('+')) s = s.slice(1);
    if (s.startsWith('00')) s = s.slice(2);
    if (s.startsWith('0')) s = '27' + s.slice(1);
    return s;
  }
  function verifyUrl(token) {
    return new URL('verify.html?token=' + encodeURIComponent(token), location.href).href;
  }
  function pStatus(p) {
    if (p.status === 'returned') return 'returned';
    if (p.status === 'revoked') return 'revoked';
    if (p.status === 'active' && new Date(p.valid_until) < new Date()) return 'expired';
    return p.status;
  }
  const STATUS_LABEL = { active: 'Active', expired: 'Expired – not booked in', returned: 'Returned', revoked: 'Revoked' };
  function localInput(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function compStatus(o) {
    if (!o.competency_expiry) return { cls: 'muted', txt: 'No expiry on file', block: false };
    const days = Math.floor((new Date(o.competency_expiry + 'T23:59:59') - new Date()) / 864e5);
    if (days < 0) return { cls: 'bad', txt: 'Competency EXPIRED', block: true };
    if (days <= 30) return { cls: 'warn', txt: `Expires in ${days + 1} day(s)`, block: false };
    return { cls: 'ok', txt: 'Valid', block: false };
  }

  // ---------------- auth ----------------
  async function init() {
    wire();
    const { data } = await db.auth.getSession();
    if (data && data.session) await enter(data.session.user);
    db.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') showLogin(); });
  }
  function showLogin() {
    $('app').hidden = true; $('loginScreen').hidden = false;
  }
  async function enter(user) {
    state.user = user;
    $('loginScreen').hidden = true; $('app').hidden = false;
    try {
      await loadIssuer();
      await loadAll();
    } catch (e) { toast(errText(e), 'err'); }
  }
  async function doLogin(ev) {
    ev.preventDefault();
    notice('loginMsg', '');
    busy($('loginBtn'), true, 'Signing in…');
    const { data, error } = await db.auth.signInWithPassword({
      email: $('loginEmail').value.trim(), password: $('loginPassword').value,
    });
    busy($('loginBtn'), false);
    if (error) return notice('loginMsg', 'Login failed: ' + esc(error.message));
    $('loginPassword').value = '';
    await enter(data.user);
  }
  async function doLogout() { await db.auth.signOut(); showLogin(); }

  async function loadIssuer() {
    const { data, error } = await db.from('issuers').select('*').eq('auth_user_id', state.user.id).maybeSingle();
    if (error) throw error;
    state.issuer = data;
    $('issuerLabel').textContent = data ? data.full_name : state.user.email;
    if (!data || !data.id_number) profileModal(!data);
  }

  function profileModal(isNew) {
    const i = state.issuer || {};
    const m = modal(`
      <h3>${isNew ? 'Set up your issuer details' : 'My issuer details'}</h3>
      <p class="muted-p">These details are printed on every permit you issue.</p>
      <div id="profMsg"></div>
      <div class="field"><label>Full name</label><input id="pfName" value="${esc(i.full_name || '')}"></div>
      <div class="field"><label>ID number</label><input id="pfId" value="${esc(i.id_number || '')}" inputmode="numeric"></div>
      <div class="field"><label>Designation</label><input id="pfRole" value="${esc(i.role || 'Senior Operations Manager')}"></div>
      <div class="btn-row"><button class="btn" id="pfSave">Save</button><button class="btn ghost" id="pfCancel">Later</button></div>`, { sticky: isNew });
    m.querySelector('#pfCancel').onclick = closeModal;
    m.querySelector('#pfSave').onclick = async () => {
      const row = {
        full_name: m.querySelector('#pfName').value.trim(),
        id_number: m.querySelector('#pfId').value.trim(),
        role: m.querySelector('#pfRole').value.trim(),
      };
      if (!row.full_name) return (m.querySelector('#profMsg').innerHTML = '<div class="notice err">Name is required.</div>');
      let res;
      if (state.issuer) res = await db.from('issuers').update(row).eq('id', state.issuer.id).select().single();
      else res = await db.from('issuers').insert({ ...row, auth_user_id: state.user.id, active: true }).select().single();
      if (res.error) return (m.querySelector('#profMsg').innerHTML = `<div class="notice err">${esc(res.error.message)}</div>`);
      state.issuer = res.data;
      $('issuerLabel').textContent = res.data.full_name;
      closeModal(); toast('Details saved', 'ok');
    };
  }

  // ---------------- data ----------------
  async function loadAll() {
    const [o, f, p] = await Promise.all([
      db.from('officers').select('*').eq('active', true).order('full_name'),
      db.from('firearms').select('*').order('make'),
      db.from('permits').select('*, officer:officers(*), firearm:firearms(*), issuer:issuers(*)').order('issued_at', { ascending: false }).limit(1000),
    ]);
    const err = o.error || f.error || p.error;
    if (err) { toast(errText(err), 'err'); return; }
    state.officers = o.data || []; state.firearms = f.data || []; state.permits = p.data || [];
    renderAll();
  }
  function renderAll() {
    renderStats(); renderIssueSelects(); renderActive(); renderRegister(); renderOfficers(); renderFirearms();
  }

  // ---------------- renderers ----------------
  function renderStats() {
    const out = state.permits.filter((p) => p.status === 'active');
    const expired = out.filter((p) => new Date(p.valid_until) < new Date());
    const today = state.permits.filter((p) => new Date(p.issued_at).toDateString() === new Date().toDateString());
    const inStore = state.firearms.filter((f) => f.status === 'in_store').length;
    const cards = [
      ['Firearms out', out.length - expired.length, ''],
      ['Overdue / expired', expired.length, expired.length ? 'bad' : ''],
      ['Issued today', today.length, ''],
      ['In the safe', inStore, 'ok'],
    ];
    $('stats').innerHTML = cards.map((c) => `<div class="stat ${c[2]}"><div class="stat-num">${c[1]}</div><div class="stat-label">${c[0]}</div></div>`).join('');
    $('activeCount').textContent = out.length;
  }

  function renderIssueSelects() {
    const so = $('issueOfficer').value, sf = $('issueFirearm').value;
    $('issueOfficer').innerHTML = '<option value="">Select officer…</option>' +
      state.officers.map((o) => `<option value="${o.id}">${esc(o.full_name)}</option>`).join('');
    const avail = state.firearms.filter((f) => f.status === 'in_store');
    $('issueFirearm').innerHTML = '<option value="">Select firearm…</option>' +
      avail.map((f) => `<option value="${f.id}">${esc(f.make)} ${esc(f.model)} — ${esc(f.serial_number)}</option>`).join('');
    if (so) $('issueOfficer').value = so;
    if (sf) $('issueFirearm').value = sf;
    hints();
  }
  function hints() {
    const o = state.officers.find((x) => x.id === $('issueOfficer').value);
    if (o) {
      const c = compStatus(o);
      $('officerHint').innerHTML = `Competency ${esc(o.competency_number)} · <span class="badge ${c.cls}">${c.txt}</span>`;
    } else $('officerHint').textContent = '';
    const f = state.firearms.find((x) => x.id === $('issueFirearm').value);
    $('firearmHint').textContent = f ? `${f.calibre} · Licence ref: ${f.licence_reference || '—'}` : '';
    const n = state.firearms.filter((x) => x.status === 'in_store').length;
    if (!f && !n) $('firearmHint').textContent = 'No firearms are currently in the safe.';
  }

  function docketBtn(p) { return `<button class="btn ghost small" data-act="docket" data-id="${p.id}">Docket</button>`; }

  function renderActive() {
    const rows = state.permits.filter((p) => p.status === 'active');
    $('activeTable').querySelector('tbody').innerHTML = rows.length ? rows.map((p) => {
      const st = pStatus(p);
      return `<tr class="${st === 'expired' ? 'row-bad' : ''}">
        <td data-label="Officer"><b>${esc(p.officer?.full_name)}</b><br><span class="mono">${esc(p.token)}</span></td>
        <td data-label="Firearm">${esc(p.firearm?.make)} ${esc(p.firearm?.model)}<br><span class="mono">${esc(p.firearm?.serial_number)}</span></td>
        <td data-label="Duty">${esc(p.duty_location || '—')}<br><span class="muted">${p.ammunition_qty ?? 0} rounds</span></td>
        <td data-label="Valid until">${esc(D.fmtDT(p.valid_until))}</td>
        <td data-label="Status"><span class="badge ${st}">${STATUS_LABEL[st]}</span></td>
        <td data-label=""><div class="row-actions">${docketBtn(p)}<button class="btn green small" data-act="bookin" data-id="${p.id}">Book in</button></div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">No firearms are currently booked out.</td></tr>';
  }

  function filteredRegister() {
    const q = $('regSearch').value.trim().toLowerCase(), s = $('regStatus').value;
    return state.permits.filter((p) => {
      if (s && pStatus(p) !== s) return false;
      if (!q) return true;
      return [p.token, p.officer?.full_name, p.firearm?.make, p.firearm?.model, p.firearm?.serial_number, p.duty_location]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }
  function renderRegister() {
    const rows = filteredRegister();
    $('registerTable').querySelector('tbody').innerHTML = rows.length ? rows.map((p) => {
      const st = pStatus(p);
      return `<tr class="${st === 'expired' ? 'row-bad' : ''}">
        <td data-label="Permit"><span class="mono">${esc(p.token)}</span></td>
        <td data-label="Officer">${esc(p.officer?.full_name)}</td>
        <td data-label="Firearm">${esc(p.firearm?.make)} ${esc(p.firearm?.model)}<br><span class="mono">${esc(p.firearm?.serial_number)}</span></td>
        <td data-label="Issued">${esc(D.fmtDT(p.issued_at))}</td>
        <td data-label="Valid until">${esc(D.fmtDT(p.valid_until))}</td>
        <td data-label="Returned">${esc(D.fmtDT(p.returned_at))}${p.return_ammunition_qty != null ? `<br><span class="muted">${p.return_ammunition_qty} rds back</span>` : ''}</td>
        <td data-label="Status"><span class="badge ${st}">${STATUS_LABEL[st] || st}</span></td>
        <td data-label=""><div class="row-actions">${docketBtn(p)}</div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="empty">No permits match.</td></tr>';
  }

  function renderOfficers() {
    $('officersTable').querySelector('tbody').innerHTML = state.officers.length ? state.officers.map((o) => {
      const c = compStatus(o);
      return `<tr>
        <td data-label="Name"><b>${esc(o.full_name)}</b></td>
        <td data-label="ID number" class="mono">${esc(o.id_number)}</td>
        <td data-label="Competency no." class="mono">${esc(o.competency_number)}</td>
        <td data-label="Expiry">${esc(D.fmtD(o.competency_expiry))}<br><span class="badge ${c.cls}">${c.txt}</span></td>
        <td data-label="WhatsApp">${esc(D.phoneDisplay(o.phone_number))}</td>
        <td data-label=""></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">No officers added yet.</td></tr>';
  }
  function renderFirearms() {
    const L = { in_store: 'In the safe', issued: 'Issued', maintenance: 'Maintenance', decommissioned: 'Decommissioned' };
    $('firearmsTable').querySelector('tbody').innerHTML = state.firearms.length ? state.firearms.map((f) => `<tr>
      <td data-label="Make / model"><b>${esc(f.make)} ${esc(f.model)}</b></td>
      <td data-label="Calibre">${esc(f.calibre)}</td>
      <td data-label="Serial" class="mono">${esc(f.serial_number)}</td>
      <td data-label="Licence ref.">${esc(f.licence_reference || '—')}</td>
      <td data-label="Status"><span class="badge ${f.status}">${L[f.status] || esc(f.status)}</span></td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">No firearms added yet.</td></tr>';
  }

  // ---------------- issue permit ----------------
  async function issuePermit(ev) {
    ev.preventDefault();
    notice('issueMsg', '');
    const o = state.officers.find((x) => x.id === $('issueOfficer').value);
    const f = state.firearms.find((x) => x.id === $('issueFirearm').value);
    if (!o || !f) return notice('issueMsg', 'Select an officer and a firearm.');
    if (!state.issuer) return profileModal(true);
    if (compStatus(o).block) return notice('issueMsg', `${esc(o.full_name)}'s firearm competency certificate has expired. A permit cannot be issued.`);
    const until = new Date($('issueValidUntil').value);
    if (isNaN(until) || until <= new Date()) return notice('issueMsg', 'Valid-until must be in the future.');
    const ammo = parseInt($('issueAmmo').value, 10) || 0;

    const btn = $('issueBtn'); busy(btn, true, 'Issuing…');
    // re-check the firearm is still in the safe
    const chk = await db.from('firearms').select('status').eq('id', f.id).single();
    if (chk.error || chk.data.status !== 'in_store') {
      busy(btn, false); await loadAll();
      return notice('issueMsg', 'That firearm is no longer in the safe. The list has been refreshed.');
    }
    const row = {
      token: genToken(), officer_id: o.id, firearm_id: f.id, issuer_id: state.issuer.id,
      ammunition_qty: ammo, duty_location: $('issueLocation').value.trim() || null,
      purpose: $('issuePurpose').value.trim() || null,
      valid_until: until.toISOString(), status: 'active', whatsapp_sent: false,
    };
    const ins = await db.from('permits').insert(row).select('*, officer:officers(*), firearm:firearms(*), issuer:issuers(*)').single();
    if (ins.error) { busy(btn, false); return notice('issueMsg', esc(errText(ins.error))); }
    const up = await db.from('firearms').update({ status: 'issued' }).eq('id', f.id);
    busy(btn, false);
    if (up.error) toast('Permit saved, but firearm status failed to update: ' + errText(up.error), 'err');
    $('issueForm').reset(); setValid(12);
    await loadAll();
    docketModal(ins.data, true);
  }
  function setValid(h) { $('issueValidUntil').value = localInput(new Date(Date.now() + h * 36e5)); }

  // ---------------- docket / WhatsApp ----------------
  function docketData(p) {
    return {
      token: p.token, verifyUrl: verifyUrl(p.token), ammo: p.ammunition_qty, location: p.duty_location,
      purpose: p.purpose, issued_at: p.issued_at, valid_until: p.valid_until,
      officer: p.officer, firearm: p.firearm, issuer: p.issuer,
    };
  }
  function waText(p) {
    return `*IMPI Protection Agency (Pty) Ltd*\nFirearm issue permit *${p.token}*\n\nOfficer: ${p.officer.full_name}\nFirearm: ${p.firearm.make} ${p.firearm.model} (${p.firearm.serial_number})\nValid until: ${D.fmtDT(p.valid_until)}\n\nThe PDF permit is attached. Carry it, your competency certificate and your ID at all times.\nVerify live: ${verifyUrl(p.token)}`;
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function markSent(p) {
    await db.from('permits').update({ whatsapp_sent: true }).eq('id', p.id);
    p.whatsapp_sent = true;
  }

  function docketModal(p, fresh) {
    const m = modal(`
      <h3>${fresh ? 'Permit issued' : 'Permit docket'}</h3>
      <div class="docket-ref">${esc(p.token)}</div>
      <p class="muted-p">${esc(p.officer.full_name)} · ${esc(p.firearm.make)} ${esc(p.firearm.model)}<br>Valid until ${esc(D.fmtDT(p.valid_until))}</p>
      <div id="dkMsg"></div>
      <div class="stack">
        <button class="btn green block" id="dkSend">Send PDF on WhatsApp</button>
        <button class="btn ghost block" id="dkDl">Download PDF</button>
        <button class="btn ghost block" id="dkCopy">Copy verification link</button>
        <button class="btn ghost block" id="dkClose">Close</button>
      </div>
      <p class="hint" style="margin-top:12px">On a phone, “Send PDF on WhatsApp” opens the share sheet — choose WhatsApp and the officer's chat. On a computer the PDF is downloaded and WhatsApp opens so you can attach it.</p>`);
    const msg = (t, k) => (m.querySelector('#dkMsg').innerHTML = t ? `<div class="notice ${k || 'err'}">${t}</div>` : '');
    m.querySelector('#dkClose').onclick = closeModal;
    m.querySelector('#dkCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(verifyUrl(p.token)); toast('Link copied', 'ok'); }
      catch { msg(esc(verifyUrl(p.token)), 'warn'); }
    };
    m.querySelector('#dkDl').onclick = async (e) => {
      busy(e.target, true, 'Building PDF…');
      try { const r = await D.build(docketData(p)); download(r.blob, r.filename); }
      catch (er) { msg('Could not build PDF: ' + esc(errText(er))); }
      busy(e.target, false);
    };
    m.querySelector('#dkSend').onclick = async (e) => {
      busy(e.target, true, 'Preparing PDF…');
      msg('');
      try {
        const r = await D.build(docketData(p));
        const file = new File([r.blob], r.filename, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text: waText(p), title: 'Firearm permit ' + p.token });
            await markSent(p); renderAll();
            msg('Shared. Confirm the message went to the correct officer.', 'ok');
          } catch (er) {
            if (er && er.name === 'AbortError') msg('Sharing cancelled.', 'warn');
            else throw er;
          }
        } else {
          download(r.blob, r.filename);
          const num = normPhone(p.officer.phone_number);
          window.open(`https://wa.me/${num}?text=${encodeURIComponent(waText(p))}`, '_blank');
          await markSent(p); renderAll();
          msg('PDF downloaded and WhatsApp opened. Tap the paperclip in the chat and attach the downloaded PDF.', 'ok');
        }
      } catch (er) { msg('Could not send: ' + esc(errText(er))); }
      busy(e.target, false);
    };
  }

  // ---------------- book in ----------------
  function bookInModal(p) {
    const m = modal(`
      <h3>Book firearm in</h3>
      <p class="muted-p"><b>${esc(p.officer.full_name)}</b> · ${esc(p.firearm.make)} ${esc(p.firearm.model)} (${esc(p.firearm.serial_number)})<br>
      Issued with <b>${p.ammunition_qty ?? 0}</b> rounds · Permit <span class="mono">${esc(p.token)}</span></p>
      <div id="biMsg"></div>
      <div class="field"><label>Rounds returned</label><input type="number" id="biAmmo" min="0" value="${p.ammunition_qty ?? 0}" inputmode="numeric"></div>
      <div class="field"><label>Notes (condition, discrepancies)</label><textarea id="biNotes" rows="2"></textarea></div>
      <div class="btn-row"><button class="btn green" id="biOk">Confirm book-in</button><button class="btn ghost" id="biNo">Cancel</button></div>`);
    m.querySelector('#biNo').onclick = closeModal;
    m.querySelector('#biOk').onclick = async (e) => {
      const back = parseInt(m.querySelector('#biAmmo').value, 10);
      if (isNaN(back) || back < 0) return (m.querySelector('#biMsg').innerHTML = '<div class="notice err">Enter the rounds returned.</div>');
      busy(e.target, true, 'Saving…');
      const r1 = await db.from('permits').update({
        status: 'returned', returned_at: new Date().toISOString(),
        return_ammunition_qty: back, return_notes: m.querySelector('#biNotes').value.trim() || null,
      }).eq('id', p.id);
      if (r1.error) { busy(e.target, false); return (m.querySelector('#biMsg').innerHTML = `<div class="notice err">${esc(errText(r1.error))}</div>`); }
      await db.from('firearms').update({ status: 'in_store' }).eq('id', p.firearm_id);
      closeModal(); await loadAll();
      toast(back < (p.ammunition_qty ?? 0) ? `Booked in — ${(p.ammunition_qty ?? 0) - back} round(s) unaccounted for` : 'Booked in', back < (p.ammunition_qty ?? 0) ? 'err' : 'ok');
    };
  }

  // ---------------- officers & firearms ----------------
  async function addOfficer(ev) {
    ev.preventDefault(); notice('officerMsg', '');
    const phone = normPhone($('offPhone').value);
    if (phone.length < 10) return notice('officerMsg', 'Enter a valid WhatsApp number.');
    const row = {
      full_name: $('offName').value.trim(), id_number: $('offId').value.trim(),
      psira_number: $('offPsira').value.trim() || null, competency_number: $('offCompNo').value.trim(),
      competency_expiry: $('offCompExp').value || null, phone_number: phone, active: true,
    };
    const { error } = await db.from('officers').insert(row);
    if (error) return notice('officerMsg', esc(errText(error)));
    $('officerForm').reset(); toast('Officer added', 'ok'); await loadAll();
  }
  async function addFirearm(ev) {
    ev.preventDefault(); notice('firearmMsg', '');
    const row = {
      make: $('fMake').value.trim(), model: $('fModel').value.trim(), calibre: $('fCalibre').value.trim(),
      serial_number: $('fSerial').value.trim(), licence_reference: $('fLicenceRef').value.trim() || null, status: 'in_store',
    };
    const { error } = await db.from('firearms').insert(row);
    if (error) return notice('firearmMsg', /duplicate|unique/i.test(error.message) ? 'A firearm with that serial number already exists.' : esc(errText(error)));
    $('firearmForm').reset(); toast('Firearm added', 'ok'); await loadAll();
  }

  // ---------------- CSV ----------------
  function exportCsv() {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const head = ['Permit', 'Officer', 'ID number', 'Competency no.', 'Firearm', 'Calibre', 'Serial', 'Rounds issued', 'Duty location', 'Purpose', 'Issued by', 'Issued', 'Valid until', 'Returned', 'Rounds returned', 'Return notes', 'Status'];
    const lines = [head.map(q).join(',')];
    filteredRegister().forEach((p) => lines.push([
      p.token, p.officer?.full_name, p.officer?.id_number, p.officer?.competency_number,
      `${p.firearm?.make || ''} ${p.firearm?.model || ''}`.trim(), p.firearm?.calibre, p.firearm?.serial_number,
      p.ammunition_qty, p.duty_location, p.purpose, p.issuer?.full_name,
      D.fmtDT(p.issued_at), D.fmtDT(p.valid_until), p.returned_at ? D.fmtDT(p.returned_at) : '',
      p.return_ammunition_qty ?? '', p.return_notes, STATUS_LABEL[pStatus(p)] || pStatus(p),
    ].map(q).join(',')));
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
      `IMPI-Permit-Register-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  // ---------------- wiring ----------------
  function setTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== 'tab-' + name));
  }
  function wire() {
    $('loginForm').addEventListener('submit', doLogin);
    $('logoutBtn').addEventListener('click', doLogout);
    $('profileBtn').addEventListener('click', () => profileModal(false));
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
    $('issueForm').addEventListener('submit', issuePermit);
    $('issueOfficer').addEventListener('change', hints);
    $('issueFirearm').addEventListener('change', hints);
    document.querySelectorAll('.chip[data-hours]').forEach((c) => c.addEventListener('click', () => setValid(+c.dataset.hours)));
    setValid(12);
    $('officerForm').addEventListener('submit', addOfficer);
    $('firearmForm').addEventListener('submit', addFirearm);
    $('csvBtn').addEventListener('click', exportCsv);
    $('regSearch').addEventListener('input', renderRegister);
    $('regStatus').addEventListener('change', renderRegister);
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const p = state.permits.find((x) => x.id === b.dataset.id);
      if (!p) return;
      if (b.dataset.act === 'bookin') bookInModal(p);
      if (b.dataset.act === 'docket') docketModal(p, false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    setInterval(() => { if (state.user) { renderStats(); renderActive(); } }, 60000);
  }

  init();
})();
