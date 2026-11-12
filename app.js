/* Factory Network Monitor Dashboard */
const SHEET_ID = "1IE8NU185d9s1s18GriMDA1bAiGOjJpT4XIu0oUC-S4E";
const CSV_URL = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/export?format=csv&gid=1477935364";
function sheetUrl(name) {
  return "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(name);
}

const SNAPSHOT = {
  generated: "2026-11-10 16:46:29",
  devices: { total: 254, up: 235, down: 19, unknown: 0 },
  downtimeMonth: { period: "2026-11-01 to 2026-11-10", incidents: 1559, devicesAffected: 159, hours: 266.8, minutes: 16008 },
  downtimeAll: { incidents: 1559, hours: 266.8, minutes: 16008 },
  itAssets: { total: 1, available: 1 },
  items: { total: 14821, sumRates: 293780.94 },
  itMaintenance: { total: 15 },
  itConsumption: { total: 37, totalCost: 270011.45 },
  users: { total: 4 },
  accessRequests: { total: 2, pending: 0, approved: 1, rejected: 1 },
  activity: { total: 4978 }
};

function parseCSV(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === "") continue;
    const fields = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { fields.push(cur); cur = ""; }
        else cur += c;
      }
    }
    fields.push(cur);
    rows.push(fields.map(f => f.trim()));
  }
  return rows;
}

function toNum(v) {
  if (v == null) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? v : n;
}

function numOr(v, fallback) {
  if (v == null || String(v).trim() === "") return fallback;
  return toNum(v);
}

function parseDurationToMinutes(s) {
  if (!s) return 0;
  let m = 0;
  const h = String(s).match(/(\d+)\s*h/i); if (h) m += parseInt(h[1], 10) * 60;
  const mn = String(s).match(/(\d+)\s*m(?!s)/i); if (mn) m += parseInt(mn[1], 10);
  const sec = String(s).match(/(\d+)\s*s/i); if (sec) m += parseInt(sec[1], 10) / 60;
  if (m === 0) {
    const n = Number(String(s).replace(/[^0-9.]/g, ""));
    if (!isNaN(n)) m = n;
  }
  return m;
}

function buildData(rows) {
  const get = (section, metric) => {
    const r = rows.find(x => x.length >= 3 && x[0] === section && x[1] === metric);
    return r ? r[2] : null;
  };
  const d = {
    generated: get("", "Generated") || SNAPSHOT.generated,
    devices: {
      total: numOr(get("Devices", "Total devices"), SNAPSHOT.devices.total),
      up: numOr(get("Devices", "Up"), SNAPSHOT.devices.up),
      down: numOr(get("Devices", "Down"), SNAPSHOT.devices.down),
      unknown: numOr(get("Devices", "Unknown / not checked"), SNAPSHOT.devices.unknown)
    },
    downtimeMonth: {
      period: get("Downtime (running month)", "Period") || SNAPSHOT.downtimeMonth.period,
      incidents: numOr(get("Downtime (running month)", "Incidents"), SNAPSHOT.downtimeMonth.incidents),
      devicesAffected: numOr(get("Downtime (running month)", "Devices affected"), SNAPSHOT.downtimeMonth.devicesAffected),
      hours: numOr(get("Downtime (running month)", "Total downtime (hours)"), SNAPSHOT.downtimeMonth.hours),
      minutes: numOr(get("Downtime (running month)", "Total downtime (min)"), SNAPSHOT.downtimeMonth.minutes)
    },
    downtimeAll: {
      incidents: numOr(get("Downtime (all history)", "Incidents"), SNAPSHOT.downtimeAll.incidents),
      hours: numOr(get("Downtime (all history)", "Total downtime (hours)"), SNAPSHOT.downtimeAll.hours),
      minutes: numOr(get("Downtime (all history)", "Total downtime (min)"), SNAPSHOT.downtimeAll.minutes)
    },
    itAssets: {
      total: numOr(get("IT Assets", "Total assets"), SNAPSHOT.itAssets.total),
      available: numOr(get("IT Assets", "Status: Available"), SNAPSHOT.itAssets.available)
    },
    items: {
      total: numOr(get("Item List", "Total items"), SNAPSHOT.items.total),
      sumRates: numOr(get("Item List", "Sum of rates (BDT)"), SNAPSHOT.items.sumRates)
    },
    itMaintenance: { total: numOr(get("IT Maintenance", "Total records"), SNAPSHOT.itMaintenance.total) },
    itConsumption: {
      total: numOr(get("IT Consumption", "Total records"), SNAPSHOT.itConsumption.total),
      totalCost: numOr(get("IT Consumption", "Total cost (BDT)"), SNAPSHOT.itConsumption.totalCost)
    },
    users: { total: numOr(get("Users", "Total users"), SNAPSHOT.users.total) },
    accessRequests: {
      total: numOr(get("Access Requests", "Total"), SNAPSHOT.accessRequests.total),
      pending: numOr(get("Access Requests", "Pending"), SNAPSHOT.accessRequests.pending),
      approved: numOr(get("Access Requests", "Approved"), SNAPSHOT.accessRequests.approved),
      rejected: numOr(get("Access Requests", "Rejected"), SNAPSHOT.accessRequests.rejected)
    },
    activity: { total: numOr(get("Activity Log", "Total events (stored)"), SNAPSHOT.activity.total) }
  };
  const genRow = rows.find(x => x.length >= 3 && x[1] === "Generated");
  if (genRow) d.generated = genRow[2];
  return d;
}

let DATA = SNAPSHOT;
let charts = {};
let INCIDENTS = [];
let DATE_INCIDENTS = [];
let DEVICE_DOWNTIME = [];
let CONSUMPTION = [];
let ASSETS = [];
let ITEMS = [];
let incidentFilters = { from: "", to: "", device: "", type: "", state: "", location: "" };
let incidentPage = 1;
let consumptionFilters = { from: "", to: "", item: "", warehouse: "", mill: "" };
let consumptionPage = 1;
let assetsFilters = { search: "", status: "", category: "", brand: "", plant: "" };
let assetsPage = 1;
let itemsFilters = { search: "", category: "", warehouse: "" };
let itemsPage = 1;
const PAGE_SIZE = 50;

function fmt(n) {
  if (typeof n !== "number") return n;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function money(n) { return "BDT " + fmt(n); }

function renderKPIs(d) {
  document.getElementById("kpi-devices-total").textContent = fmt(d.devices.total);
  document.getElementById("kpi-devices-up").textContent = fmt(d.devices.up);
  document.getElementById("kpi-devices-down").textContent = fmt(d.devices.down);
  document.getElementById("kpi-devices-unknown").textContent = fmt(d.devices.unknown);

  document.getElementById("kpi-dm-incidents").textContent = fmt(d.downtimeMonth.incidents);
  document.getElementById("kpi-dm-devices").textContent = fmt(d.downtimeMonth.devicesAffected);
  document.getElementById("kpi-dm-hours").textContent = fmt(d.downtimeMonth.hours);
  document.getElementById("kpi-dm-minutes").textContent = fmt(d.downtimeMonth.minutes);
  document.getElementById("dm-period").textContent = d.downtimeMonth.period;

  document.getElementById("kpi-da-incidents").textContent = fmt(d.downtimeAll.incidents);
  document.getElementById("kpi-da-hours").textContent = fmt(d.downtimeAll.hours);
  document.getElementById("kpi-da-minutes").textContent = fmt(d.downtimeAll.minutes);

  document.getElementById("kpi-assets-total").textContent = fmt(d.itAssets.total);
  document.getElementById("kpi-assets-avail").textContent = fmt(d.itAssets.available);
  document.getElementById("kpi-items-total").textContent = fmt(d.items.total);
  document.getElementById("kpi-items-sum").textContent = money(d.items.sumRates);
  document.getElementById("kpi-maint").textContent = fmt(d.itMaintenance.total);
  document.getElementById("kpi-cons-records").textContent = fmt(d.itConsumption.total);
  document.getElementById("kpi-cons-cost").textContent = money(d.itConsumption.totalCost);

  document.getElementById("kpi-users").textContent = fmt(d.users.total);
  document.getElementById("kpi-ar-total").textContent = fmt(d.accessRequests.total);
  document.getElementById("kpi-ar-pending").textContent = fmt(d.accessRequests.pending);
  document.getElementById("kpi-ar-approved").textContent = fmt(d.accessRequests.approved);
  document.getElementById("kpi-ar-rejected").textContent = fmt(d.accessRequests.rejected);
  document.getElementById("kpi-activity").textContent = fmt(d.activity.total);

  document.getElementById("generated-at").textContent = "Generated: " + d.generated;
}

function renderCharts(d) {
  const ctx1 = document.getElementById("chart-devices");
  if (charts.devices) charts.devices.destroy();
  charts.devices = new Chart(ctx1, {
    type: "doughnut",
    data: {
      labels: ["Up", "Down", "Unknown"],
      datasets: [{
        data: [d.devices.up, d.devices.down, d.devices.unknown],
        backgroundColor: ["#16a34a", "#dc2626", "#94a3b8"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" }, title: { display: true, text: "Device Status" } }
    }
  });

  const ctx2 = document.getElementById("chart-access");
  if (charts.access) charts.access.destroy();
  charts.access = new Chart(ctx2, {
    type: "doughnut",
    data: {
      labels: ["Approved", "Pending", "Rejected"],
      datasets: [{
        data: [d.accessRequests.approved, d.accessRequests.pending, d.accessRequests.rejected],
        backgroundColor: ["#16a34a", "#d97706", "#dc2626"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" }, title: { display: true, text: "Access Requests" } }
    }
  });

  const ctx3 = document.getElementById("chart-downtime");
  if (charts.downtime) charts.downtime.destroy();
  charts.downtime = new Chart(ctx3, {
    type: "bar",
    data: {
      labels: ["Incidents", "Devices Affected"],
      datasets: [
        { label: "Running month", data: [d.downtimeMonth.incidents, d.downtimeMonth.devicesAffected], backgroundColor: "#2563eb" },
        { label: "All history", data: [d.downtimeAll.incidents, d.downtimeAll.devicesAffected], backgroundColor: "#7c3aed" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" }, title: { display: true, text: "Downtime Comparison" } },
      scales: { y: { beginAtZero: true } }
    }
  });

  const ctx4 = document.getElementById("chart-it");
  if (charts.it) charts.it.destroy();
  charts.it = new Chart(ctx4, {
    type: "bar",
    data: {
      labels: ["Assets", "Maintenance", "Consumption", "Users"],
      datasets: [{
        label: "Records",
        data: [d.itAssets.total, d.itMaintenance.total, d.itConsumption.total, d.users.total],
        backgroundColor: ["#0891b2", "#d97706", "#dc2626", "#7c3aed"]
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, title: { display: true, text: "IT Overview" } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderAll(d) {
  DATA = d;
  renderKPIs(d);
  renderCharts(d);
  renderIncidentKPIs(getFilteredIncidents());
  renderIncidentsTable();
  renderDateIncidents();
  renderDeviceDowntime();
  renderConsumptionTable();
  renderAssetsTable();
  renderItemsTable();
  const badge = document.getElementById("status-badge");
  badge.textContent = "Live data";
  badge.className = "badge ok";
}

function parseIncidents(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  // find header
  let start = 0;
  if (rows[0] && /device/i.test(rows[0][0])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const device = (r[0] || "").trim();
    if (!device) continue;
    const ip = (r[1] || "").trim();
    const type = (r[2] || "").trim();
    const location = (r[3] || "").trim();
    const downFrom = (r[4] || "").trim();
    const backUp = (r[5] || "").trim();
    const duration = (r[6] || "").trim();
    const state = (r[7] || "").trim();
    out.push({
      device, ip, type, location, downFrom, backUp, duration, state,
      downDate: downFrom ? new Date(downFrom.replace(" ", "T")) : null,
      minutes: parseDurationToMinutes(duration)
    });
  }
  return out;
}

function parseDateIncidents(rows) {
  // Downtime by Day
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /date/i.test(rows[0][0])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const date = (r[0] || "").trim();
    if (!date) continue;
    const device = (r[1] || "").trim();
    const type = (r[2] || "").trim();
    const incidents = numOr(r[3], 0);
    const downtime = (r[4] || "").trim();
    const minutes = numOr(r[5], 0);
    out.push({ date, device, type, incidents, downtime, minutes });
  }
  return out;
}

function parseDeviceDowntime(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /no|device/i.test(rows[0][0] + rows[0][1])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const device = (r[1] || "").trim();
    if (!device) continue;
    out.push({
      no: (r[0] || "").trim(),
      device,
      ip: (r[2] || "").trim(),
      type: (r[3] || "").trim(),
      location: (r[4] || "").trim(),
      downTimes: (r[5] || "").trim(),
      upTimes: (r[6] || "").trim(),
      totalDowntime: (r[7] || "").trim(),
      hours: (r[8] || "").trim(),
      minutes: numOr(r[9], 0),
      longest: (r[10] || "").trim(),
      firstDown: (r[11] || "").trim(),
      lastDown: (r[12] || "").trim(),
      now: (r[13] || "").trim()
    });
  }
  return out;
}

function parseConsumption(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /no|date/i.test(rows[0][0] + rows[0][1])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const no = (r[0] || "").trim();
    const date = (r[1] || "").trim();
    if (!date && !no) continue;
    out.push({
      no, date,
      irNo: (r[2] || "").trim(),
      itemCode: (r[3] || "").trim(),
      itemName: (r[4] || "").trim(),
      warehouse: (r[5] || "").trim(),
      mill: (r[6] || "").trim(),
      usageArea: (r[7] || "").trim(),
      issued: numOr(r[8], 0),
      uom: (r[9] || "").trim(),
      rate: numOr(r[10], 0),
      totalCost: numOr(r[11], 0),
      profitCenter: (r[12] || "").trim(),
      remarks: (r[13] || "").trim()
    });
  }
  return out;
}

function parseAssets(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /no|asset/i.test(rows[0][0] + rows[0][1])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const assetTag = (r[1] || "").trim();
    const assetName = (r[2] || "").trim();
    if (!assetTag && !assetName) continue;
    out.push({
      no: (r[0] || "").trim(),
      assetTag,
      assetName,
      description: (r[3] || "").trim(),
      category: (r[4] || "").trim(),
      deviceType: (r[5] || "").trim(),
      brand: (r[6] || "").trim(),
      model: (r[7] || "").trim(),
      serial: (r[8] || "").trim(),
      ip: (r[9] || "").trim(),
      mac: (r[10] || "").trim(),
      location: (r[11] || "").trim(),
      markingLocation: (r[12] || "").trim(),
      plant: (r[13] || "").trim(),
      warehouse: (r[14] || "").trim(),
      assignedTo: (r[15] || "").trim(),
      department: (r[16] || "").trim(),
      warrantyEnd: (r[17] || "").trim(),
      status: (r[18] || "").trim(),
      remarks: (r[19] || "").trim()
    });
  }
  return out;
}

function parseItems(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /no|code/i.test(rows[0][0] + rows[0][1])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const code = (r[1] || "").trim();
    const item = (r[2] || "").trim();
    if (!code && !item) continue;
    out.push({
      no: (r[0] || "").trim(),
      code,
      item,
      itemType: (r[3] || "").trim(),
      category: (r[4] || "").trim(),
      subCategory: (r[5] || "").trim(),
      uom: (r[6] || "").trim(),
      rate: numOr(r[7], 0),
      warehouse: (r[8] || "").trim(),
      remark: (r[9] || "").trim()
    });
  }
  return out;
}

function getFilteredIncidents() {
  return INCIDENTS.filter(inc => {
    if (incidentFilters.from) {
      const from = new Date(incidentFilters.from + "T00:00:00");
      if (inc.downDate && inc.downDate < from) return false;
      if (!inc.downDate) return false;
    }
    if (incidentFilters.to) {
      const to = new Date(incidentFilters.to + "T23:59:59");
      if (inc.downDate && inc.downDate > to) return false;
      if (!inc.downDate) return false;
    }
    if (incidentFilters.device) {
      if (!inc.device.toLowerCase().includes(incidentFilters.device.toLowerCase())) return false;
    }
    if (incidentFilters.type) {
      if (inc.type.toLowerCase() !== incidentFilters.type.toLowerCase()) return false;
    }
    if (incidentFilters.state) {
      if (inc.state.toLowerCase() !== incidentFilters.state.toLowerCase()) return false;
    }
    if (incidentFilters.location) {
      if (!inc.location.toLowerCase().includes(incidentFilters.location.toLowerCase())) return false;
    }
    return true;
  });
}

function renderIncidentKPIs(list) {
  const devices = new Set(list.map(x => x.device));
  const minutes = list.reduce((a, b) => a + (b.minutes || 0), 0);
  const ongoing = list.filter(x => x.state.toLowerCase() === "ongoing").length;
  document.getElementById("kpi-f-incidents").textContent = fmt(list.length);
  document.getElementById("kpi-f-devices").textContent = fmt(devices.size);
  document.getElementById("kpi-f-minutes").textContent = fmt(Math.round(minutes));
  document.getElementById("kpi-f-ongoing").textContent = fmt(ongoing);
}

function renderIncidentsTable() {
  const list = getFilteredIncidents();
  renderIncidentKPIs(list);
  const tbody = document.querySelector("#incidents-table tbody");
  tbody.innerHTML = "";
  const start = (incidentPage - 1) * PAGE_SIZE;
  const pageRows = list.slice(start, start + PAGE_SIZE);
  for (const inc of pageRows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(inc.device)}</td>
      <td>${escapeHtml(inc.ip)}</td>
      <td>${escapeHtml(inc.type)}</td>
      <td>${escapeHtml(inc.location)}</td>
      <td>${escapeHtml(inc.downFrom)}</td>
      <td>${escapeHtml(inc.backUp || "-")}</td>
      <td>${escapeHtml(inc.duration)}</td>
      <td><span class="badge ${inc.state.toLowerCase() === "ongoing" ? "down" : "ok"}">${escapeHtml(inc.state)}</span></td>
    `;
    tbody.appendChild(tr);
  }
  renderPagination(list.length);
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderPagination(total) {
  const container = document.getElementById("incidents-pagination");
  container.innerHTML = "";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const info = document.createElement("span");
  info.className = "page-info";
  info.textContent = `Page ${incidentPage} of ${totalPages} (${total} incidents)`;
  const prev = document.createElement("button");
  prev.textContent = "Prev";
  prev.disabled = incidentPage <= 1;
  prev.addEventListener("click", () => { if (incidentPage > 1) { incidentPage--; renderIncidentsTable(); } });
  const next = document.createElement("button");
  next.textContent = "Next";
  next.disabled = incidentPage >= totalPages;
  next.addEventListener("click", () => { if (incidentPage < totalPages) { incidentPage++; renderIncidentsTable(); } });
  container.appendChild(prev);
  container.appendChild(info);
  container.appendChild(next);
}

function aggregateDateIncidents() {
  const map = {};
  const filtered = DATE_INCIDENTS.filter(d => {
    if (incidentFilters.from && d.date < incidentFilters.from) return false;
    if (incidentFilters.to && d.date > incidentFilters.to) return false;
    if (incidentFilters.device && !d.device.toLowerCase().includes(incidentFilters.device.toLowerCase())) return false;
    if (incidentFilters.type && d.type.toLowerCase() !== incidentFilters.type.toLowerCase()) return false;
    return true;
  });
  for (const d of filtered) {
    if (!map[d.date]) map[d.date] = { date: d.date, incidents: 0, devices: new Set(), minutes: 0 };
    map[d.date].incidents += d.incidents || 0;
    map[d.date].devices.add(d.device);
    map[d.date].minutes += d.minutes || 0;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map(x => ({
    date: x.date,
    incidents: x.incidents,
    devices: x.devices.size,
    minutes: x.minutes
  }));
}

function renderDateIncidents() {
  const agg = aggregateDateIncidents();
  const tbody = document.querySelector("#date-incidents-table tbody");
  tbody.innerHTML = "";
  for (const row of agg) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.date)}</td>
      <td>${fmt(row.incidents)}</td>
      <td>${fmt(row.devices)}</td>
      <td>${fmt(Math.round(row.minutes / 60 * 100) / 100)} hrs</td>
      <td>${fmt(Math.round(row.minutes))}</td>
    `;
    tbody.appendChild(tr);
  }
  // chart
  const ctx = document.getElementById("chart-date-incidents");
  if (charts.dateIncidents) charts.dateIncidents.destroy();
  charts.dateIncidents = new Chart(ctx, {
    type: "bar",
    data: {
      labels: agg.map(x => x.date),
      datasets: [
        { label: "Incidents", data: agg.map(x => x.incidents), backgroundColor: "#2563eb", yAxisID: "y" },
        { label: "Downtime (min)", data: agg.map(x => x.minutes), backgroundColor: "#7c3aed", yAxisID: "y1" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" }, title: { display: true, text: "Incidents by Date" } },
      scales: {
        y: { beginAtZero: true, position: "left" },
        y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } }
      }
    }
  });
}

function renderDeviceDowntime() {
  const q = (document.getElementById("f-device").value || "").toLowerCase();
  const type = (document.getElementById("f-type").value || "").toLowerCase();
  const location = (document.getElementById("f-location").value || "").toLowerCase();
  const filtered = DEVICE_DOWNTIME.filter(d => {
    if (q && !d.device.toLowerCase().includes(q)) return false;
    if (type && d.type.toLowerCase() !== type) return false;
    if (location && !d.location.toLowerCase().includes(location)) return false;
    return true;
  }).sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
  const tbody = document.querySelector("#device-downtime-table tbody");
  tbody.innerHTML = "";
  for (const d of filtered) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(d.device)}</td>
      <td>${escapeHtml(d.ip)}</td>
      <td>${escapeHtml(d.type)}</td>
      <td>${escapeHtml(d.location)}</td>
      <td>${escapeHtml(d.downTimes)}</td>
      <td>${escapeHtml(d.totalDowntime)}</td>
      <td>${fmt(d.minutes)}</td>
      <td>${escapeHtml(d.longest)}</td>
      <td>${escapeHtml(d.firstDown)}</td>
      <td>${escapeHtml(d.lastDown)}</td>
      <td><span class="badge ${d.now.toLowerCase() === "up" ? "ok" : "down"}">${escapeHtml(d.now)}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

function getFilteredConsumption() {
  return CONSUMPTION.filter(c => {
    if (consumptionFilters.from && c.date < consumptionFilters.from) return false;
    if (consumptionFilters.to && c.date > consumptionFilters.to) return false;
    if (consumptionFilters.item) {
      const q = consumptionFilters.item.toLowerCase();
      if (!c.itemName.toLowerCase().includes(q) && !c.itemCode.toLowerCase().includes(q)) return false;
    }
    if (consumptionFilters.warehouse) {
      if (!c.warehouse.toLowerCase().includes(consumptionFilters.warehouse.toLowerCase())) return false;
    }
    if (consumptionFilters.mill) {
      if (!c.mill.toLowerCase().includes(consumptionFilters.mill.toLowerCase())) return false;
    }
    return true;
  });
}

function renderConsumptionKPIs(list) {
  const items = new Set(list.map(x => x.itemCode || x.itemName));
  const cost = list.reduce((a, b) => a + (b.totalCost || 0), 0);
  const issued = list.reduce((a, b) => a + (b.issued || 0), 0);
  document.getElementById("kpi-c-records").textContent = fmt(list.length);
  document.getElementById("kpi-c-cost").textContent = money(cost);
  document.getElementById("kpi-c-issued").textContent = fmt(issued);
  document.getElementById("kpi-c-items").textContent = fmt(items.size);
}

function renderConsumptionTable() {
  const list = getFilteredConsumption();
  renderConsumptionKPIs(list);
  const tbody = document.querySelector("#consumption-table tbody");
  tbody.innerHTML = "";
  const start = (consumptionPage - 1) * PAGE_SIZE;
  const pageRows = list.slice(start, start + PAGE_SIZE);
  for (const c of pageRows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.no)}</td>
      <td>${escapeHtml(c.date)}</td>
      <td>${escapeHtml(c.irNo)}</td>
      <td>${escapeHtml(c.itemCode)}</td>
      <td>${escapeHtml(c.itemName)}</td>
      <td>${escapeHtml(c.warehouse)}</td>
      <td>${escapeHtml(c.mill)}</td>
      <td>${escapeHtml(c.usageArea)}</td>
      <td>${fmt(c.issued)}</td>
      <td>${escapeHtml(c.uom)}</td>
      <td>${money(c.rate)}</td>
      <td>${money(c.totalCost)}</td>
      <td>${escapeHtml(c.profitCenter)}</td>
    `;
    tbody.appendChild(tr);
  }
  renderGenericPagination("consumption-pagination", list.length, consumptionPage, (p) => { consumptionPage = p; renderConsumptionTable(); });
  renderMonthlyCostChart(list);
}

function renderMonthlyCostChart(list) {
  const map = {};
  for (const c of list) {
    const m = (c.date || "").slice(0, 7);
    if (!m) continue;
    map[m] = (map[m] || 0) + (c.totalCost || 0);
  }
  const labels = Object.keys(map).sort();
  const data = labels.map(l => map[l]);
  const ctx = document.getElementById("chart-monthly-cost");
  if (charts.monthlyCost) charts.monthlyCost.destroy();
  charts.monthlyCost = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Monthly Cost (BDT)", data, backgroundColor: "#dc2626" }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: "Monthly Consumption Cost" } }, scales: { y: { beginAtZero: true } } }
  });
}

function getFilteredAssets() {
  return ASSETS.filter(a => {
    const q = (assetsFilters.search || "").toLowerCase();
    if (q) {
      const hay = (a.assetTag + " " + a.assetName + " " + a.serial + " " + a.ip).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (assetsFilters.status && a.status.toLowerCase() !== assetsFilters.status.toLowerCase()) return false;
    if (assetsFilters.category && a.category.toLowerCase() !== assetsFilters.category.toLowerCase() && a.deviceType.toLowerCase() !== assetsFilters.category.toLowerCase()) return false;
    if (assetsFilters.brand && !a.brand.toLowerCase().includes(assetsFilters.brand.toLowerCase())) return false;
    if (assetsFilters.plant) {
      const hay = (a.plant + " " + a.warehouse + " " + a.location).toLowerCase();
      if (!hay.includes(assetsFilters.plant.toLowerCase())) return false;
    }
    return true;
  });
}

function renderAssetsKPIs(list) {
  const assigned = list.filter(a => a.assignedTo && a.assignedTo.trim() !== "").length;
  const available = list.filter(a => a.status.toLowerCase() === "available" || a.status.toLowerCase() === "in stock").length;
  const maint = list.filter(a => /maint/i.test(a.status)).length;
  document.getElementById("kpi-a-total").textContent = fmt(list.length);
  document.getElementById("kpi-a-assigned").textContent = fmt(assigned);
  document.getElementById("kpi-a-available").textContent = fmt(available);
  document.getElementById("kpi-a-maint").textContent = fmt(maint);
}

function renderAssetsTable() {
  const list = getFilteredAssets();
  renderAssetsKPIs(list);
  const tbody = document.querySelector("#assets-table tbody");
  tbody.innerHTML = "";
  const start = (assetsPage - 1) * PAGE_SIZE;
  const pageRows = list.slice(start, start + PAGE_SIZE);
  for (const a of pageRows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(a.no)}</td>
      <td>${escapeHtml(a.assetTag)}</td>
      <td>${escapeHtml(a.assetName)}</td>
      <td>${escapeHtml(a.category)}</td>
      <td>${escapeHtml(a.deviceType)}</td>
      <td>${escapeHtml(a.brand)}</td>
      <td>${escapeHtml(a.model)}</td>
      <td>${escapeHtml(a.serial)}</td>
      <td>${escapeHtml(a.ip)}</td>
      <td>${escapeHtml(a.location)}</td>
      <td>${escapeHtml(a.plant)}</td>
      <td>${escapeHtml(a.warehouse)}</td>
      <td>${escapeHtml(a.assignedTo)}</td>
      <td>${escapeHtml(a.department)}</td>
      <td>${escapeHtml(a.warrantyEnd)}</td>
      <td><span class="badge ${/available|in stock/i.test(a.status) ? "ok" : "down"}">${escapeHtml(a.status)}</span></td>
    `;
    tbody.appendChild(tr);
  }
  renderGenericPagination("assets-pagination", list.length, assetsPage, (p) => { assetsPage = p; renderAssetsTable(); });
}

function getFilteredItems() {
  return ITEMS.filter(i => {
    const q = (itemsFilters.search || "").toLowerCase();
    if (q) {
      const hay = (i.code + " " + i.item + " " + i.category + " " + i.subCategory).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (itemsFilters.category && i.category.toLowerCase() !== itemsFilters.category.toLowerCase()) return false;
    if (itemsFilters.warehouse && !i.warehouse.toLowerCase().includes(itemsFilters.warehouse.toLowerCase())) return false;
    return true;
  });
}

function renderItemsKPIs(list) {
  const cats = new Set(list.map(x => x.category));
  const sum = list.reduce((a, b) => a + (b.rate || 0), 0);
  document.getElementById("kpi-i-total").textContent = fmt(list.length);
  document.getElementById("kpi-i-sum").textContent = money(sum);
  document.getElementById("kpi-i-cats").textContent = fmt(cats.size);
}

function renderItemsTable() {
  const list = getFilteredItems();
  renderItemsKPIs(list);
  const tbody = document.querySelector("#items-table tbody");
  tbody.innerHTML = "";
  const start = (itemsPage - 1) * PAGE_SIZE;
  const pageRows = list.slice(start, start + PAGE_SIZE);
  for (const i of pageRows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(i.no)}</td>
      <td>${escapeHtml(i.code)}</td>
      <td>${escapeHtml(i.item)}</td>
      <td>${escapeHtml(i.itemType)}</td>
      <td>${escapeHtml(i.category)}</td>
      <td>${escapeHtml(i.subCategory)}</td>
      <td>${escapeHtml(i.uom)}</td>
      <td>${money(i.rate)}</td>
      <td>${escapeHtml(i.warehouse)}</td>
      <td>${escapeHtml(i.remark)}</td>
    `;
    tbody.appendChild(tr);
  }
  renderGenericPagination("items-pagination", list.length, itemsPage, (p) => { itemsPage = p; renderItemsTable(); });
}

function renderGenericPagination(containerId, total, currentPage, onPageChange) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const info = document.createElement("span");
  info.className = "page-info";
  info.textContent = `Page ${currentPage} of ${totalPages} (${total} records)`;
  const prev = document.createElement("button");
  prev.textContent = "Prev";
  prev.disabled = currentPage <= 1;
  prev.addEventListener("click", () => { if (currentPage > 1) onPageChange(currentPage - 1); });
  const next = document.createElement("button");
  next.textContent = "Next";
  next.disabled = currentPage >= totalPages;
  next.addEventListener("click", () => { if (currentPage < totalPages) onPageChange(currentPage + 1); });
  container.appendChild(prev);
  container.appendChild(info);
  container.appendChild(next);
}

function populateAssetsFilters() {
  const statusSel = document.getElementById("a-status");
  const catSel = document.getElementById("a-category");
  const statuses = new Set();
  const cats = new Set();
  ASSETS.forEach(a => { if (a.status) statuses.add(a.status); if (a.category) cats.add(a.category); if (a.deviceType) cats.add(a.deviceType); });
  while (statusSel.options.length > 1) statusSel.remove(1);
  while (catSel.options.length > 1) catSel.remove(1);
  [...statuses].sort().forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s; statusSel.appendChild(o); });
  [...cats].sort().forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; catSel.appendChild(o); });
}

function populateItemsFilters() {
  const catSel = document.getElementById("i-category");
  const cats = new Set();
  ITEMS.forEach(i => { if (i.category) cats.add(i.category); });
  while (catSel.options.length > 1) catSel.remove(1);
  [...cats].sort().forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; catSel.appendChild(o); });
}

function populateTypeFilter() {
  const sel = document.getElementById("f-type");
  const types = new Set();
  INCIDENTS.forEach(x => { if (x.type) types.add(x.type); });
  DEVICE_DOWNTIME.forEach(x => { if (x.type) types.add(x.type); });
  // keep existing options
  const current = sel.value;
  // remove all except first
  while (sel.options.length > 1) sel.remove(1);
  [...types].sort().forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  });
  sel.value = current;
}

async function fetchSheet(name) {
  const res = await fetch(sheetUrl(name), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + name);
  const text = await res.text();
  return parseCSV(text);
}

async function loadData() {
  const status = document.getElementById("load-status");
  try {
    status.textContent = "Refreshing from Google Sheets…";
    status.className = "loading";
    // Dashboard summary
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    const d = buildData(rows);
    renderKPIs(d);
    renderCharts(d);
    DATA = d;

    // Additional sheets (best effort)
    const results = await Promise.allSettled([
      fetchSheet("Downtime Incidents"),
      fetchSheet("Downtime by Day"),
      fetchSheet("Downtime Summary"),
      fetchSheet("IT Consumption"),
      fetchSheet("IT Assets"),
      (async () => {
        const res = await fetch("https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/export?format=csv&gid=278364623", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status + " for Item List");
        return parseCSV(await res.text());
      })()
    ]);
    if (results[0].status === "fulfilled") INCIDENTS = parseIncidents(results[0].value);
    if (results[1].status === "fulfilled") DATE_INCIDENTS = parseDateIncidents(results[1].value);
    if (results[2].status === "fulfilled") DEVICE_DOWNTIME = parseDeviceDowntime(results[2].value);
    if (results[3].status === "fulfilled") CONSUMPTION = parseConsumption(results[3].value);
    else console.warn("consumption fetch failed", results[3].reason);
    if (results[4].status === "fulfilled") ASSETS = parseAssets(results[4].value);
    else console.warn("assets fetch failed", results[4].reason);
    if (results[5].status === "fulfilled") ITEMS = parseItems(results[5].value);
    else console.warn("items fetch failed", results[5].reason);


    populateTypeFilter();
    populateAssetsFilters();
    populateItemsFilters();
    renderIncidentKPIs(getFilteredIncidents());
    renderIncidentsTable();
    renderDateIncidents();
    renderDeviceDowntime();
    renderConsumptionTable();
    renderAssetsTable();
    renderItemsTable();

    document.getElementById("generated-at").textContent = "Generated: " + d.generated;
    status.textContent = "Updated " + new Date().toLocaleTimeString();
    status.className = "";
    const badge = document.getElementById("status-badge");
    badge.textContent = "Live data";
    badge.className = "badge ok";
  } catch (e) {
    console.warn("Fetch failed, using snapshot", e);
    renderAll(SNAPSHOT);
    status.textContent = "Offline snapshot (fetch failed)";
    status.className = "error";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  document.getElementById("refresh-btn").addEventListener("click", loadData);

  document.getElementById("apply-filters").addEventListener("click", () => {
    incidentFilters.from = document.getElementById("f-date-from").value;
    incidentFilters.to = document.getElementById("f-date-to").value;
    incidentFilters.device = document.getElementById("f-device").value.trim();
    incidentFilters.type = document.getElementById("f-type").value;
    incidentFilters.state = document.getElementById("f-state").value;
    incidentFilters.location = document.getElementById("f-location").value.trim();
    incidentPage = 1;
    const st = document.getElementById("filter-status");
    st.textContent = "Filters applied";
    st.className = "";
    renderIncidentsTable();
    renderDateIncidents();
    renderDeviceDowntime();
  });

  document.getElementById("reset-filters").addEventListener("click", () => {
    incidentFilters = { from: "", to: "", device: "", type: "", state: "", location: "" };
    document.getElementById("f-date-from").value = "";
    document.getElementById("f-date-to").value = "";
    document.getElementById("f-device").value = "";
    document.getElementById("f-type").value = "";
    document.getElementById("f-state").value = "";
    document.getElementById("f-location").value = "";
    incidentPage = 1;
    document.getElementById("filter-status").textContent = "Filters reset";
    renderIncidentsTable();
    renderDateIncidents();
    renderDeviceDowntime();
  });

  // Consumption filters
  document.getElementById("apply-consumption").addEventListener("click", () => {
    consumptionFilters.from = document.getElementById("c-date-from").value;
    consumptionFilters.to = document.getElementById("c-date-to").value;
    consumptionFilters.item = document.getElementById("c-item").value.trim();
    consumptionFilters.warehouse = document.getElementById("c-warehouse").value.trim();
    consumptionFilters.mill = document.getElementById("c-mill").value.trim();
    consumptionPage = 1;
    document.getElementById("consumption-status").textContent = "Filters applied";
    renderConsumptionTable();
  });
  document.getElementById("reset-consumption").addEventListener("click", () => {
    consumptionFilters = { from: "", to: "", item: "", warehouse: "", mill: "" };
    document.getElementById("c-date-from").value = "";
    document.getElementById("c-date-to").value = "";
    document.getElementById("c-item").value = "";
    document.getElementById("c-warehouse").value = "";
    document.getElementById("c-mill").value = "";
    consumptionPage = 1;
    document.getElementById("consumption-status").textContent = "Filters reset";
    renderConsumptionTable();
  });

  // Assets filters
  document.getElementById("apply-assets").addEventListener("click", () => {
    assetsFilters.search = document.getElementById("a-search").value.trim();
    assetsFilters.status = document.getElementById("a-status").value;
    assetsFilters.category = document.getElementById("a-category").value;
    assetsFilters.brand = document.getElementById("a-brand").value.trim();
    assetsFilters.plant = document.getElementById("a-plant").value.trim();
    assetsPage = 1;
    document.getElementById("assets-status").textContent = "Filters applied";
    renderAssetsTable();
  });
  document.getElementById("reset-assets").addEventListener("click", () => {
    assetsFilters = { search: "", status: "", category: "", brand: "", plant: "" };
    document.getElementById("a-search").value = "";
    document.getElementById("a-status").value = "";
    document.getElementById("a-category").value = "";
    document.getElementById("a-brand").value = "";
    document.getElementById("a-plant").value = "";
    assetsPage = 1;
    document.getElementById("assets-status").textContent = "Filters reset";
    renderAssetsTable();
  });

  // Items filters
  document.getElementById("apply-items").addEventListener("click", () => {
    itemsFilters.search = document.getElementById("i-search").value.trim();
    itemsFilters.category = document.getElementById("i-category").value;
    itemsFilters.warehouse = document.getElementById("i-warehouse").value.trim();
    itemsPage = 1;
    document.getElementById("items-status").textContent = "Filters applied";
    renderItemsTable();
  });
  document.getElementById("reset-items").addEventListener("click", () => {
    itemsFilters = { search: "", category: "", warehouse: "" };
    document.getElementById("i-search").value = "";
    document.getElementById("i-category").value = "";
    document.getElementById("i-warehouse").value = "";
    itemsPage = 1;
    document.getElementById("items-status").textContent = "Filters reset";
    renderItemsTable();
  });
});
