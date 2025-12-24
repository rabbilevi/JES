// ======== Config you’ll customize for your friend ========
const ORG = {
  name: "JES",
  ein: "18-770613",
  meta: "Your address · City, ST · (###) ###-####",
  email: "office@example.org",
  signatureName: "Rabbi Shmuly Hurwitz",
  signatureTitle: "Sole Director, Chabad of Cooper City",
  receiptDate: new Date() // shown on the receipt
};

// ======== Data model ========
// donation = { name, company, dateISO, memo, method, amountNumber }
let donations = [];
let donors = []; // computed grouped list
let activeDonorIndex = 0;

// ======== DOM ========
const $ = (id) => document.getElementById(id);

const tabs = document.querySelectorAll(".tab");
tabs.forEach(btn => btn.addEventListener("click", () => {
  tabs.forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const tab = btn.dataset.tab;
  $("tab-manual").classList.toggle("hidden", tab !== "manual");
  $("tab-import").classList.toggle("hidden", tab !== "import");
}));

// Fill stationery/receipt static fields
function renderOrg() {
  $("orgName").textContent = ORG.name;
  $("orgMeta").textContent = ORG.meta;
  $("orgEmail").textContent = ORG.email;
  $("orgEin").textContent = ORG.ein;

  $("rOrgNameInline").textContent = ORG.name;
  $("rOrgNameInline2").textContent = ORG.name;
  $("sigName").textContent = ORG.signatureName;
  $("sigTitle").textContent = ORG.signatureTitle;

  $("rReceiptDate").textContent = formatDateLong(ORG.receiptDate);
}
renderOrg();

// Manual entry
$("donationForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("fName").value.trim();
  const company = $("fCompany").value.trim();
  const dateISO = $("fDate").value; // yyyy-mm-dd
  const memo = $("fMemo").value.trim();
  const method = $("fMethod").value.trim();
  const amountNumber = parseAmount($("fAmount").value);

  if (!name) return alert("Name is required.");
  if (!dateISO) return alert("Date is required.");
  if (!isFinite(amountNumber) || amountNumber <= 0) return alert("Amount must be a positive number.");

  donations.push({ name, company, dateISO, memo, method, amountNumber });
  e.target.reset();
  recomputeAndRender();
});

// CSV import
$("btnImportCsv").addEventListener("click", async () => {
  const file = $("csvFile").files[0];
  if (!file) return alert("Choose a CSV file first.");

  const text = await file.text();
  try {
    const imported = parseCsvToDonations(text);
    donations = donations.concat(imported);
    $("importStatus").textContent = `Imported ${imported.length} rows. Total donations in session: ${donations.length}`;
    recomputeAndRender();
  } catch (err) {
    $("importStatus").textContent = `Import error: ${err.message}`;
  }
});

$("btnLoadSample").addEventListener("click", () => {
  donations = [
    { name: "John Doe", company: "", dateISO: "2025-01-12", memo: "Building Fund", method: "Check", amountNumber: 180 },
    { name: "John Doe", company: "", dateISO: "2025-03-05", memo: "", method: "Credit Card", amountNumber: 54 },
    { name: "Jane Smith", company: "Acme Inc", dateISO: "2025-06-10", memo: "Gala", method: "Zelle", amountNumber: 500 },
  ];
  recomputeAndRender();
});

// Donor selection + navigation
$("donorSelect").addEventListener("change", () => {
  activeDonorIndex = $("donorSelect").selectedIndex;
  renderReceipt();
});

$("searchDonor").addEventListener("input", () => {
  renderDonorSelect($("searchDonor").value.trim());
});

$("btnPrev").addEventListener("click", () => {
  if (donors.length === 0) return;
  activeDonorIndex = Math.max(0, activeDonorIndex - 1);
  $("donorSelect").selectedIndex = activeDonorIndex;
  renderReceipt();
});

$("btnNext").addEventListener("click", () => {
  if (donors.length === 0) return;
  activeDonorIndex = Math.min(donors.length - 1, activeDonorIndex + 1);
  $("donorSelect").selectedIndex = activeDonorIndex;
  renderReceipt();
});

$("btnPrint").addEventListener("click", () => {
  if (donors.length === 0) return alert("No donor selected.");
  window.print();
});

$("btnDeleteDonor").addEventListener("click", () => {
  if (donors.length === 0) return;
  const donor = donors[activeDonorIndex];
  const ok = confirm(`Delete ALL donations for:\n${donor.name}${donor.company ? " / " + donor.company : ""} ?`);
  if (!ok) return;

  const key = donor.key;
  donations = donations.filter(d => donorKey(d.name, d.company) !== key);
  activeDonorIndex = 0;
  recomputeAndRender();
});

// Local storage helpers
$("btnSaveLocal").addEventListener("click", () => {
  localStorage.setItem("receiptGen_donations", JSON.stringify(donations));
  alert("Saved to this browser.");
});
$("btnLoadLocal").addEventListener("click", () => {
  const raw = localStorage.getItem("receiptGen_donations");
  if (!raw) return alert("Nothing saved in this browser.");
  donations = JSON.parse(raw);
  recomputeAndRender();
});
$("btnClearAll").addEventListener("click", () => {
  const ok = confirm("Clear all donations in this session?");
  if (!ok) return;
  donations = [];
  donors = [];
  activeDonorIndex = 0;
  recomputeAndRender();
});

// ======== Core logic ========
function recomputeAndRender() {
  donors = groupByDonor(donations);
  renderDonorSelect($("searchDonor").value.trim());
  activeDonorIndex = Math.min(activeDonorIndex, Math.max(0, donors.length - 1));
  $("donorSelect").selectedIndex = activeDonorIndex;
  renderReceipt();
}

function groupByDonor(rows) {
  const map = new Map();
  for (const d of rows) {
    const key = donorKey(d.name, d.company);
    if (!map.has(key)) {
      map.set(key, { key, name: d.name.trim(), company: (d.company || "").trim(), donations: [] });
    }
    map.get(key).donations.push(d);
  }

  const grouped = Array.from(map.values());
  for (const g of grouped) {
    g.donations.sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));
    g.total = g.donations.reduce((s, x) => s + (Number(x.amountNumber) || 0), 0);
  }

  // Sort donors by name then company
  grouped.sort((a, b) => (a.name + "|" + a.company).localeCompare(b.name + "|" + b.company));
  return grouped;
}

function renderDonorSelect(filterText) {
  const select = $("donorSelect");
  select.innerHTML = "";

  const filtered = filterText
    ? donors.filter(d => (d.name + " " + d.company).toLowerCase().includes(filterText.toLowerCase()))
    : donors;

  // If filtering, keep activeDonorIndex aligned to filtered list by resetting
  if (filterText) activeDonorIndex = 0;

  for (const d of filtered) {
    const opt = document.createElement("option");
    opt.textContent = `${d.name}${d.company ? " — " + d.company : ""}  (${formatCurrency(d.total)})`;
    opt.value = d.key;
    select.appendChild(opt);
  }

  // When filtered, we need a mapping from select index -> donor
  // Simplest approach: store filtered list on the element
  select._filteredDonors = filtered;

  if (filtered.length === 0) {
    renderEmptyReceipt();
    return;
  }
}

function renderReceipt() {
  const select = $("donorSelect");
  const list = select._filteredDonors || donors;
  if (!list || list.length === 0) return renderEmptyReceipt();

  const donor = list[select.selectedIndex] || list[0];
  if (!donor) return renderEmptyReceipt();

  $("rDonorName").textContent = donor.name;
  const companyLine = donor.company ? donor.company : "";
  $("rDonorCompany").textContent = companyLine;
  $("rDonorCompany").style.display = companyLine ? "block" : "none";

  $("rDonorFirst").textContent = donor.name.split(/\s+/)[0] || donor.name;

  // Table
  const tbody = $("rTableBody");
  tbody.innerHTML = "";
  for (const d of donor.donations) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(formatDateShort(d.dateISO))}</td>
      <td>${escapeHtml(formatCurrency(d.amountNumber))}</td>
      <td>${escapeHtml(d.method || "")}</td>
      <td>${escapeHtml(d.memo || "")}</td>
    `;
    tbody.appendChild(tr);
  }

  $("rTotal").textContent = formatCurrency(donor.total);
}

function renderEmptyReceipt() {
  $("rDonorName").textContent = "";
  $("rDonorCompany").textContent = "";
  $("rDonorCompany").style.display = "none";
  $("rDonorFirst").textContent = "";
  $("rTableBody").innerHTML = "";
  $("rTotal").textContent = formatCurrency(0);
}

// ======== CSV parsing (simple but robust for typical Sheets exports) ========
function parseCsvToDonations(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  const header = rows[0].map(h => (h || "").trim().toLowerCase());
  const idx = (name) => {
    const i = header.indexOf(name.toLowerCase());
    if (i === -1) throw new Error(`Missing header: ${name}`);
    return i;
  };

  const I = {
    name: idx("name"),
    company: idx("company"),
    date: idx("date"),
    memo: idx("donation memo"),
    method: idx("payment method"),
    amount: idx("amount")
  };

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = (row[I.name] || "").trim();
    if (!name) continue;

    const company = (row[I.company] || "").trim();
    const dateISO = normalizeDateToISO(row[I.date]);
    const memo = (row[I.memo] || "").trim();
    const method = (row[I.method] || "").trim();
    const amountNumber = parseAmount(row[I.amount]);

    if (!dateISO) continue; // skip bad dates
    if (!isFinite(amountNumber) || amountNumber <= 0) continue;

    out.push({ name, company, dateISO, memo, method, amountNumber });
  }
  return out;
}

function parseCsv(text) {
  // Basic CSV parser that handles quoted fields with commas/newlines
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"' && inQuotes && next === '"') { // escaped quote
      cur += '"';
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && next === "\n") i++; // CRLF
      row.push(cur);
      cur = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }
    cur += c;
  }

  // last cell
  row.push(cur);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

// ======== Utilities ========
function donorKey(name, company) {
  return (name || "").trim().toLowerCase() + "|" + (company || "").trim().toLowerCase();
}

function parseAmount(v) {
  const cleaned = String(v ?? "").replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return isFinite(n) ? n : NaN;
}

function normalizeDateToISO(v) {
  // Accepts:
  // - yyyy-mm-dd
  // - mm/dd/yyyy (common from CSV)
  // - other Date-ish strings (best effort)
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // mm/dd/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }

  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatCurrency(n) {
  const amt = Number(n) || 0;
  return amt.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDateLong(d) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateShort(dateISO) {
  if (!dateISO) return "";
  const d = new Date(dateISO + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Initial render
recomputeAndRender();
