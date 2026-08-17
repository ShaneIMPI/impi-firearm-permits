// ============================================================
// IMPI Digital Firearm Permit System — app logic
// ============================================================

window.supabase = window.supabase.createClient(
  window.IMPI_CONFIG.SUPABASE_URL,
  window.IMPI_CONFIG.SUPABASE_ANON_KEY
);

let currentIssuer = null;
let officersCache = [];
let firearmsCache = [];

// ---------- Auth ----------
async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const msgEl = document.getElementById("loginMsg");
  msgEl.innerHTML = "";

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    msgEl.innerHTML = `<div class="msg err">${error.message}</div>`;
    return;
  }

  // find or create matching issuer record
  let { data: issuerRow } = await supabase
    .from("issuers")
    .select("*")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (!issuerRow) {
    const { data: created } = await supabase
      .from("issuers")
      .insert({ full_name: email, auth_user_id: data.user.id })
      .select()
      .single();
    issuerRow = created;
  }

  currentIssuer = issuerRow;
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("issuerLabel").textContent =
    `Logged in as ${currentIssuer.full_name}`;

  await loadAll();
}

async function doLogout() {
  await supabase.auth.signOut();
  currentIssuer = null;
  document.getElementById("app").style.display = "none";
  document.getElementById("loginScreen").style.display = "block";
}

// ---------- Tabs ----------
function showTab(name) {
  document.querySelectorAll(".tab-panel").forEach(el => el.style.display = "none");
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  document.getElementById("tab-" + name).style.display = "block";
  document.querySelector(`.tab-btn[data-tab="${name}"]`).classList.add("active");
  if (name === "active") renderActivePermits();
  if (name === "register") renderRegister();
}

// ---------- Load data ----------
async function loadAll() {
  const { data: officers } = await supabase.from("officers").select("*").eq("active", true).order("full_name");
  officersCache = officers || [];

  const { data: firearms } = await supabase.from("firearms").select("*").order("make");
  firearmsCache = firearms || [];

  renderOfficerSelect();
  renderFirearmSelect();
  renderOfficersTable();
  renderFirearmsTable();
}

function renderOfficerSelect() {
  const sel = document.getElementById("issueOfficer");
  sel.innerHTML = officersCache.map(o =>
    `<option value="${o.id}">${o.full_name} — ${o.id_number}</option>`).join("");
}

function renderFirearmSelect() {
  const sel = document.getElementById("issueFirearm");
  const available = firearmsCache.filter(f => f.status === "in_store");
  sel.innerHTML = available.map(f =>
    `<option value="${f.id}">${f.make} ${f.model} — ${f.serial_number}</option>`).join("");
}

function renderOfficersTable() {
  const tb = document.querySelector("#officersTable tbody");
  tb.innerHTML = officersCache.map(o => `
    <tr>
      <td>${o.full_name}</td>
      <td>${o.id_number}</td>
      <td>${o.competency_number}</td>
      <td>${o.competency_expiry || "—"}</td>
    </tr>`).join("");
}

function renderFirearmsTable() {
  const tb = document.querySelector("#firearmsTable tbody");
  tb.innerHTML = firearmsCache.map(f => `
    <tr>
      <td>${f.make} ${f.model}</td>
      <td>${f.calibre}</td>
      <td>${f.serial_number}</td>
      <td><span class="badge ${f.status === 'issued' ? 'active' : 'returned'}">${f.status}</span></td>
    </tr>`).join("");
}

// ---------- Add officer / firearm ----------
async function addOfficer() {
  const payload = {
    full_name: document.getElementById("offName").value.trim(),
    id_number: document.getElementById("offId").value.trim(),
    psira_number: document.getElementById("offPsira").value.trim(),
    competency_number: document.getElementById("offCompNo").value.trim(),
    competency_expiry: document.getElementById("offCompExp").value || null,
    phone_number: document.getElementById("offPhone").value.trim(),
  };
  const msgEl = document.getElementById("officerMsg");
  if (!payload.full_name || !payload.id_number || !payload.competency_number || !payload.phone_number) {
    msgEl.innerHTML = `<div class="msg err">Name, ID number, competency number and phone are required.</div>`;
    return;
  }
  const { error } = await supabase.from("officers").insert(payload);
  if (error) { msgEl.innerHTML = `<div class="msg err">${error.message}</div>`; return; }
  msgEl.innerHTML = `<div class="msg ok">Officer added.</div>`;
  ["offName","offId","offPsira","offCompNo","offCompExp","offPhone"].forEach(id => document.getElementById(id).value = "");
  await loadAll();
}

async function addFirearm() {
  const payload = {
    make: document.getElementById("fMake").value.trim(),
    model: document.getElementById("fModel").value.trim(),
    calibre: document.getElementById("fCalibre").value.trim(),
    serial_number: document.getElementById("fSerial").value.trim(),
    licence_reference: document.getElementById("fLicenceRef").value.trim(),
  };
  const msgEl = document.getElementById("firearmMsg");
  if (!payload.make || !payload.serial_number) {
    msgEl.innerHTML = `<div class="msg err">Make and serial number are required.</div>`;
    return;
  }
  const { error } = await supabase.from("firearms").insert(payload);
  if (error) { msgEl.innerHTML = `<div class="msg err">${error.message}</div>`; return; }
  msgEl.innerHTML = `<div class="msg ok">Firearm added.</div>`;
  ["fMake","fModel","fCalibre","fSerial","fLicenceRef"].forEach(id => document.getElementById(id).value = "");
  await loadAll();
}

// ---------- Issue permit ----------
function generateToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `IMPI-${code}`;
}

async function issuePermit() {
  const msgEl = document.getElementById("issueMsg");
  msgEl.innerHTML = "";

  const officerId = document.getElementById("issueOfficer").value;
  const firearmId = document.getElementById("issueFirearm").value;
  const ammo = parseInt(document.getElementById("issueAmmo").value || "0", 10);
  const location = document.getElementById("issueLocation").value.trim();
  const purpose = document.getElementById("issuePurpose").value.trim();
  const validUntil = document.getElementById("issueValidUntil").value;

  if (!officerId || !firearmId || !validUntil) {
    msgEl.innerHTML = `<div class="msg err">Officer, firearm and valid-until date/time are required.</div>`;
    return;
  }

  const token = generateToken();

  const { data: permit, error } = await supabase.from("permits").insert({
    token,
    officer_id: officerId,
    firearm_id: firearmId,
    issuer_id: currentIssuer.id,
    ammunition_qty: ammo,
    duty_location: location,
    purpose: purpose,
    valid_until: new Date(validUntil).toISOString(),
    status: "active",
  }).select().single();

  if (error) { msgEl.innerHTML = `<div class="msg err">${error.message}</div>`; return; }

  await supabase.from("firearms").update({ status: "issued" }).eq("id", firearmId);

  // Send via WhatsApp using Netlify function (Twilio WhatsApp API)
  const officer = officersCache.find(o => o.id === officerId);
  const firearm = firearmsCache.find(f => f.id === firearmId);
  const verifyUrl = `${window.location.origin}/verify.html?token=${token}`;

  try {
    const resp = await fetch("/.netlify/functions/send-permit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: officer.phone_number,
        officerName: officer.full_name,
        idNumber: officer.id_number,
        competencyNumber: officer.competency_number,
        firearm: `${firearm.make} ${firearm.model} (${firearm.serial_number})`,
        ammo,
        location,
        validUntil,
        issuerName: currentIssuer.full_name,
        verifyUrl,
      }),
    });
    const result = await resp.json();
    if (result.ok) {
      await supabase.from("permits").update({ whatsapp_sent: true }).eq("id", permit.id);
      msgEl.innerHTML = `<div class="msg ok">Permit ${token} issued and sent via WhatsApp to ${officer.full_name}.</div>`;
    } else {
      msgEl.innerHTML = `<div class="msg err">Permit ${token} saved, but WhatsApp send failed: ${result.error || "unknown error"}. Verification link: ${verifyUrl}</div>`;
    }
  } catch (e) {
    msgEl.innerHTML = `<div class="msg err">Permit ${token} saved, but WhatsApp send failed. Verification link: ${verifyUrl}</div>`;
  }

  document.getElementById("issueAmmo").value = "0";
  document.getElementById("issueLocation").value = "";
  document.getElementById("issuePurpose").value = "";
  document.getElementById("issueValidUntil").value = "";
  await loadAll();
}

// ---------- Active permits / book-in ----------
async function renderActivePermits() {
  const { data: permits } = await supabase
    .from("permits")
    .select("*, officers(full_name), firearms(make, model, serial_number)")
    .eq("status", "active")
    .order("issued_at", { ascending: false });

  const tb = document.querySelector("#activeTable tbody");
  const now = new Date();

  tb.innerHTML = (permits || []).map(p => {
    const expired = new Date(p.valid_until) < now;
    const statusLabel = expired ? "expired" : "active";
    return `
      <tr>
        <td>${p.officers?.full_name || "—"}</td>
        <td>${p.firearms?.make || ""} ${p.firearms?.model || ""} (${p.firearms?.serial_number || ""})</td>
        <td>${new Date(p.valid_until).toLocaleString("en-ZA")}</td>
        <td><span class="badge ${statusLabel}">${statusLabel}</span></td>
        <td><button class="secondary" onclick="bookIn('${p.id}', '${p.firearm_id}')">Book In</button></td>
      </tr>`;
  }).join("") || `<tr><td colspan="5">No active permits.</td></tr>`;
}

async function bookIn(permitId, firearmId) {
  const notes = prompt("Return notes (condition, ammo returned, etc.) — optional:") || "";
  const { error } = await supabase.from("permits").update({
    status: "returned",
    returned_at: new Date().toISOString(),
    return_notes: notes,
  }).eq("id", permitId);

  if (!error) {
    await supabase.from("firearms").update({ status: "in_store" }).eq("id", firearmId);
    await loadAll();
    renderActivePermits();
  } else {
    alert("Error booking in: " + error.message);
  }
}

// ---------- Full register ----------
let registerCache = [];

async function renderRegister() {
  const { data: permits } = await supabase
    .from("permits")
    .select("*, officers(full_name), firearms(make, model, serial_number), issuers(full_name)")
    .order("issued_at", { ascending: false });

  registerCache = permits || [];
  const tb = document.querySelector("#registerTable tbody");
  const now = new Date();

  tb.innerHTML = registerCache.map(p => {
    let status = p.status;
    if (status === "active" && new Date(p.valid_until) < now) status = "expired";
    return `
      <tr>
        <td>${p.officers?.full_name || "—"}</td>
        <td>${p.firearms?.make || ""} ${p.firearms?.model || ""} (${p.firearms?.serial_number || ""})</td>
        <td>${p.issuers?.full_name || "—"}</td>
        <td>${new Date(p.issued_at).toLocaleString("en-ZA")}</td>
        <td>${new Date(p.valid_until).toLocaleString("en-ZA")}</td>
        <td>${p.returned_at ? new Date(p.returned_at).toLocaleString("en-ZA") : "—"}</td>
        <td><span class="badge ${status}">${status}</span></td>
      </tr>`;
  }).join("");
}

function exportRegisterCSV() {
  const rows = [["Token","Officer","ID Number","Competency No.","Firearm","Serial","Issuer","Issued At","Valid Until","Returned At","Ammo Out","Ammo Returned","Duty Location","Purpose","Status"]];
  registerCache.forEach(p => {
    rows.push([
      p.token,
      p.officers?.full_name || "",
      "", // ID number not joined here; pull from officersCache if needed
      "",
      `${p.firearms?.make || ""} ${p.firearms?.model || ""}`,
      p.firearms?.serial_number || "",
      p.issuers?.full_name || "",
      p.issued_at,
      p.valid_until,
      p.returned_at || "",
      p.ammunition_qty,
      p.return_ammunition_qty || "",
      p.duty_location || "",
      (p.purpose || "").replace(/,/g, ";"),
      p.status,
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `IMPI-Firearm-Permit-Register-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ---------- Session check on load ----------
(async () => {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    document.getElementById("loginEmail").value = "";
    // Re-trigger login flow to populate issuer + data
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      let { data: issuerRow } = await supabase
        .from("issuers").select("*").eq("auth_user_id", userData.user.id).maybeSingle();
      if (issuerRow) {
        currentIssuer = issuerRow;
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("app").style.display = "block";
        document.getElementById("issuerLabel").textContent = `Logged in as ${currentIssuer.full_name}`;
        await loadAll();
      }
    }
  }
})();
