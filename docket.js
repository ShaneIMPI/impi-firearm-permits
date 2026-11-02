// ============================================================
// IMPI Firearm Permit — PDF docket generator (runs in the browser)
// Needs: jsPDF 2.5.x (window.jspdf) and qrcode 1.4.4 (window.QRCode)
// ============================================================
(function () {
  'use strict';

  const CO = {
    name: 'IMPI Protection Agency (Pty) Ltd',
    reg: '2019/083651/07',
    vat: '4920285758',
    psira: '2939801',
    addr: '10 Kosmos Crescent, Rynoue AH, Roodeplaat, Pretoria',
    tel: '012 543 0640 / 012 543 2004',
    email: 'info@impi-secure.co.za',
    web: 'www.impi-secure.co.za',
    directors: 'Jaco Van Dyk, Charné de Jager',
  };
  const C = {
    dark: [35, 31, 32], red: [222, 24, 25], gold: [184, 148, 46],
    grey: [110, 110, 116], line: [214, 214, 220], soft: [246, 246, 248],
  };
  const TZ = 'Africa/Johannesburg';

  // ---------- formatting helpers (also used by app.js) ----------
  function fmtDT(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleString('en-ZA', {
      timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }
  function fmtD(v) {
    if (!v) return '—';
    const d = new Date(String(v).length <= 10 ? v + 'T12:00:00' : v);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-ZA', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
  }
  function phoneDisplay(p) {
    const s = String(p || '').replace(/\D/g, '');
    if (s.length === 11 && s.startsWith('27')) return `+27 ${s.slice(2, 4)} ${s.slice(4, 7)} ${s.slice(7)}`;
    return p || '—';
  }

  // ---------- logo ----------
  let logoCache = null;
  async function loadLogo() {
    if (logoCache) return logoCache;
    const r = await fetch('assets/impi-logo.png');
    if (!r.ok) throw new Error('logo');
    const b = await r.blob();
    logoCache = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(b);
    });
    return logoCache;
  }

  // ---------- drawing helpers ----------
  const W = 210, M = 14;

  function sectionBar(doc, title, y) {
    doc.setFillColor(...C.dark); doc.rect(M, y, W - 2 * M, 6.2, 'F');
    doc.setFillColor(...C.red); doc.rect(M, y, 1.6, 6.2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), M + 4.5, y + 4.3, { charSpace: 0.4 });
    return y + 6.2;
  }

  function cell(doc, x, y, w, c) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.6); doc.setTextColor(...C.grey);
    doc.text(String(c.l).toUpperCase(), x + 3, y + 3.9, { charSpace: 0.25 });
    doc.setFont(c.mono ? 'courier' : 'helvetica', 'bold'); doc.setFontSize(c.mono ? 10.5 : 10);
    doc.setTextColor(...(c.color || C.dark));
    const lines = doc.splitTextToSize(String(c.v || '—'), w - 6).slice(0, c.maxLines || 1);
    lines.forEach((t, i) => doc.text(t, x + 3, y + 8.5 + i * 4.2));
    return lines.length;
  }

  function hline(doc, y) {
    doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(M, y, W - M, y);
  }

  function row2(doc, y, a, b) {
    const h = 10.8;
    cell(doc, M, y, 91, a);
    if (b) cell(doc, 105, y, 91, b);
    doc.setDrawColor(...C.line); doc.setLineWidth(0.2);
    doc.line(105, y + 1.5, 105, y + h - 1.5);
    hline(doc, y + h);
    return y + h;
  }

  function rowFull(doc, y, c) {
    const n = Math.min(c.maxLines || 1, doc.splitTextToSize(String(c.v || '—'), 176).length);
    const h = 6.6 + n * 4.2 + 0.8;
    cell(doc, M, y, 182, c);
    hline(doc, y + h);
    return y + h;
  }

  // ---------- main builder ----------
  // d = { token, verifyUrl, ammo, location, purpose, issued_at, valid_until,
  //       officer:{full_name,id_number,psira_number,competency_number,competency_expiry,phone_number},
  //       firearm:{make,model,calibre,serial_number,licence_reference},
  //       issuer:{full_name,role,id_number} }
  async function build(d) {
    if (!window.jspdf) throw new Error('PDF library not loaded');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({
      title: `Firearm Issue Permit ${d.token}`,
      subject: 'Firearm issue permit', author: CO.name, creator: CO.name,
    });
    const o = d.officer || {}, f = d.firearm || {}, i = d.issuer || {};

    // ----- letterhead -----
    try {
      const logo = await loadLogo();
      doc.addImage(logo, 'PNG', M, 9, 46, 23.3);
    } catch (e) { /* logo optional */ }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...C.dark);
    doc.text(CO.name, W - M, 13, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...C.grey);
    [
      `Co. Reg. No. ${CO.reg}  ·  VAT Reg. No. ${CO.vat}  ·  PSIRA No. ${CO.psira}`,
      CO.addr,
      `Tel. ${CO.tel}`,
      `${CO.email}  ·  ${CO.web}`,
    ].forEach((t, k) => doc.text(t, W - M, 18.2 + k * 4.1, { align: 'right' }));
    doc.setFillColor(...C.red); doc.rect(M, 36, W - 2 * M, 1.1, 'F');
    doc.setFillColor(...C.gold); doc.rect(M, 37.4, W - 2 * M, 0.4, 'F');

    // ----- title -----
    doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.setTextColor(...C.dark);
    doc.text('FIREARM ISSUE PERMIT', M, 51);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.grey);
    doc.text(
      doc.splitTextToSize('Issued under the Firearms Control Act 60 of 2000. Valid only for the officer, firearm and period stated below.', 112),
      M, 56
    );
    doc.setFillColor(...C.soft); doc.setDrawColor(...C.line); doc.setLineWidth(0.3);
    doc.roundedRect(138, 42.5, 58, 17, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...C.grey);
    doc.text('PERMIT NO.', 141.5, 47.6, { charSpace: 0.4 });
    doc.setFont('courier', 'bold'); doc.setFontSize(14.5); doc.setTextColor(...C.red);
    doc.text(d.token, 141.5, 55.4);

    // ----- 1. officer -----
    let y = 66;
    y = sectionBar(doc, '1.  Authorised officer', y);
    y = row2(doc, y, { l: 'Full name', v: o.full_name }, { l: 'Identity number', v: o.id_number, mono: true });
    y = row2(doc, y, { l: 'Firearm competency certificate no.', v: o.competency_number, mono: true }, { l: 'Competency expiry date', v: fmtD(o.competency_expiry) });
    y = row2(doc, y, { l: 'PSIRA registration no.', v: o.psira_number || '—' }, { l: 'Contact number', v: phoneDisplay(o.phone_number) });
    y += 3.5;

    // ----- 2. firearm -----
    y = sectionBar(doc, '2.  Firearm & ammunition', y);
    y = row2(doc, y, { l: 'Make & model', v: `${f.make || ''} ${f.model || ''}`.trim() }, { l: 'Calibre', v: f.calibre });
    y = row2(doc, y, { l: 'Serial number', v: f.serial_number, mono: true }, { l: 'Firearm licence reference', v: f.licence_reference || '—' });
    y = row2(doc, y, { l: 'Ammunition issued (rounds)', v: String(d.ammo ?? 0) }, { l: 'Duty location', v: d.location || '—' });
    y += 3.5;

    // ----- 3. authorisation -----
    y = sectionBar(doc, '3.  Authorisation', y);
    y = row2(doc, y, { l: 'Issued', v: fmtDT(d.issued_at) }, { l: 'Valid until', v: fmtDT(d.valid_until), color: C.red });
    y = rowFull(doc, y, { l: 'Purpose of possession', v: d.purpose || '—', maxLines: 2 });
    y = row2(doc, y,
      { l: 'Issued by', v: i.full_name },
      { l: 'Designation / ID no.', v: `${i.role || 'Authorised issuer'}${i.id_number ? '  ·  ' + i.id_number : ''}` });

    // ----- acknowledgement + QR -----
    y += 4.5;
    const bandTop = y;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); doc.setTextColor(...C.dark);
    doc.text('ACKNOWLEDGEMENT BY OFFICER', M, y + 2.5, { charSpace: 0.35 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...C.grey);
    doc.text(doc.splitTextToSize(
      'I acknowledge receipt of the firearm and ammunition described above. While on duty I will carry this permit, my original firearm competency certificate and my identity document, use the firearm only for the stated purpose, and return it with all unused ammunition when I am booked in.',
      124), M, y + 7);
    const sy = y + 29;
    doc.setDrawColor(...C.dark); doc.setLineWidth(0.3);
    doc.line(M, sy, M + 58, sy); doc.line(M + 66, sy, M + 124, sy);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...C.grey);
    doc.text('Officer signature & date', M, sy + 3.6);
    doc.text('Issuing person signature & date', M + 66, sy + 3.6);

    try {
      const qr = await window.QRCode.toDataURL(d.verifyUrl, {
        margin: 1, width: 360, errorCorrectionLevel: 'M',
        color: { dark: '#231F20', light: '#FFFFFF' },
      });
      doc.setDrawColor(...C.line); doc.setLineWidth(0.3);
      doc.roundedRect(150, bandTop - 1, 46, 49, 2, 2, 'D');
      doc.addImage(qr, 'PNG', 153, bandTop + 1, 40, 40);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.dark);
      doc.text('SCAN TO VERIFY LIVE', 173, bandTop + 44.2, { align: 'center', charSpace: 0.3 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4); doc.setTextColor(...C.grey);
      doc.text('Status, validity & booking-in', 173, bandTop + 47.2, { align: 'center' });
    } catch (e) { /* QR optional */ }

    // ----- 4. book-in -----
    y = bandTop + 52;
    y = sectionBar(doc, '4.  Book-in  (completed when the firearm is returned)', y);
    const cols = [
      { x: M, w: 62, l: 'Date & time returned' },
      { x: M + 62, w: 44, l: 'Rounds returned' },
      { x: M + 106, w: 76, l: 'Received by (name & signature)' },
    ];
    cols.forEach((c) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.6); doc.setTextColor(...C.grey);
      doc.text(c.l.toUpperCase(), c.x + 3, y + 3.9, { charSpace: 0.25 });
      doc.setDrawColor(...C.line); doc.setLineWidth(0.3);
      doc.line(c.x + 3, y + 11, c.x + c.w - 4, y + 11);
    });
    hline(doc, y + 13);

    // ----- footer -----
    const fy = 277;
    doc.setDrawColor(...C.gold); doc.setLineWidth(0.4); doc.line(M, fy - 3, W - M, fy - 3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(...C.grey);
    doc.text(doc.splitTextToSize(
      "This permit is valid only for the named officer, firearm and period stated. It does not replace the officer's original firearm competency certificate, which must be carried at all times while on duty.",
      W - 2 * M), M, fy);
    doc.text(`Verify authenticity: ${d.verifyUrl}`, M, fy + 6);
    doc.text(`Directors: ${CO.directors}   ·   Generated ${fmtDT(new Date())} (SAST)`, M, fy + 9.2);

    return {
      doc,
      blob: doc.output('blob'),
      filename: `IMPI-Firearm-Permit-${d.token}.pdf`,
    };
  }

  window.IMPI_DOCKET = { build, fmtDT, fmtD, phoneDisplay, CO };
})();
