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
let MAINTENANCE = [];
let USERS = [];
let PENDING_USERS = [];
let EMPLOYEES = [];
let DEVICES = [];
let DOWNTIME_REPORT = [];
let ACTIVITY_LOG = [];
let incidentFilters = { from: "", to: "", device: "", type: "", state: "", location: "", month: "" };
let incidentPage = 1;
let consumptionFilters = { from: "", to: "", item: "", warehouse: "", mill: "", month: "" };
let consumptionPage = 1;
let assetsFilters = { search: "", status: "", category: "", brand: "", plant: "", month: "" };
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
  renderConsumptionTable();
  renderAssetsTable();
  renderItemsTable();
  renderMaintenanceTable();
  renderDevicesTable();
  renderDowntimeReportTable();
  renderActivityTable();
  renderUsersTable();
  renderPendingUsersTable();
  renderEmployeesTable();
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
      remarks: (r[19] || "").trim(),
      created: (r[20] || "").trim()
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
      remark: (r[9] || "").trim(),
      created: (r[10] || "").trim()
    });
  }
  return out;
}

function parseMaintenance(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /no|report/i.test(rows[0][0] + rows[0][1])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    if (!(r[0] || r[1] || r[2])) continue;
    out.push({
      no: (r[0] || "").trim(),
      reportId: (r[1] || "").trim(),
      date: (r[2] || "").trim(),
      device: (r[3] || "").trim(),
      location: (r[4] || "").trim(),
      maintenanceType: (r[5] || "").trim(),
      workType: (r[6] || "").trim(),
      problem: (r[7] || "").trim(),
      action: (r[8] || "").trim(),
      networkTest: (r[9] || "").trim(),
      status: (r[10] || "").trim()
    });
  }
  return out;
}

function parseUsers(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /no|full name/i.test(rows[0][0] + rows[0][1])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    if (!(r[1] || r[2])) continue;
    out.push({
      no: (r[0] || "").trim(),
      fullName: (r[1] || "").trim(),
      username: (r[2] || "").trim(),
      employeeId: (r[3] || "").trim(),
      designation: (r[4] || "").trim(),
      department: (r[5] || "").trim(),
      location: (r[6] || "").trim(),
      email: (r[7] || "").trim(),
      phone: (r[8] || "").trim(),
      role: (r[9] || "").trim(),
      account: (r[10] || "").trim(),
      created: (r[11] || "").trim()
    });
  }
  return out;
}

function parsePendingUsers(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /id|requested/i.test(rows[0][0] + rows[0][1])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    if (!(r[2] || r[3])) continue;
    out.push({
      id: (r[0] || "").trim(),
      requested: (r[1] || "").trim(),
      fullName: (r[2] || "").trim(),
      username: (r[3] || "").trim(),
      email: (r[4] || "").trim(),
      phone: (r[5] || "").trim(),
      department: (r[6] || "").trim(),
      designation: (r[7] || "").trim(),
      employeeId: (r[8] || "").trim(),
      location: (r[9] || "").trim(),
      wantsRole: (r[10] || "").trim(),
      reason: (r[11] || "").trim(),
      status: (r[12] || "").trim()
    });
  }
  return out;
}

function parseEmployees(rows) {
  // same as users
  return parseUsers(rows);
}

function parseDevices(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /no|name/i.test(rows[0][0] + rows[0][1])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    if (!(r[1])) continue;
    out.push({
      no: (r[0] || "").trim(),
      name: (r[1] || "").trim(),
      ip: (r[2] || "").trim(),
      type: (r[3] || "").trim(),
      location: (r[4] || "").trim(),
      status: (r[5] || "").trim(),
      response: (r[6] || "").trim(),
      statusSince: (r[7] || "").trim(),
      lastChecked: (r[8] || "").trim(),
      uptime: (r[9] || "").trim()
    });
  }
  return out;
}

function parseDowntimeReport(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /no|device/i.test(rows[0][0] + rows[0][1])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    if (!(r[1])) continue;
    out.push({
      no: (r[0] || "").trim(),
      device: (r[1] || "").trim(),
      ip: (r[2] || "").trim(),
      type: (r[3] || "").trim(),
      location: (r[4] || "").trim(),
      downTimes: (r[5] || "").trim(),
      upTimes: (r[6] || "").trim(),
      totalDowntime: (r[7] || "").trim(),
      minutes: (r[8] || "").trim(),
      longest: (r[9] || "").trim(),
      availability: (r[10] || "").trim(),
      now: (r[11] || "").trim()
    });
  }
  return out;
}

function parseActivityLog(rows) {
  const out = [];
  if (!rows || rows.length < 2) return out;
  let start = 0;
  if (rows[0] && /time|device/i.test(rows[0][0] + rows[0][1])) start = 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    if (!(r[0] || r[1])) continue;
    out.push({
      time: (r[0] || "").trim(),
      device: (r[1] || "").trim(),
      message: (r[2] || "").trim(),
      kind: (r[3] || "").trim()
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
    if (incidentFilters.month) {
      const m = inc.downFrom ? inc.downFrom.slice(0, 7) : "";
      if (m !== incidentFilters.month) return false;
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
    if (consumptionFilters.month) {
      const m = c.date ? c.date.slice(0, 7) : "";
      if (m !== consumptionFilters.month) return false;
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
    if (assetsFilters.month) {
      const m = a.created ? a.created.slice(0, 7) : "";
      if (m !== assetsFilters.month) return false;
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
    if (itemsFilters.month) {
      const m = i.created ? i.created.slice(0, 7) : "";
      if (m !== itemsFilters.month) return false;
    }
    return true;
  });
}

function renderItemsKPIs(list) {
  document.getElementById("kpi-i-total").textContent = fmt(list.length);
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

function renderMaintenanceTable() {
  const tbody = document.querySelector("#maintenance-table tbody");
  if (!tbody) return;
  const q = (document.getElementById("m-search")?.value || "").toLowerCase();
  const st = (document.getElementById("m-status")?.value || "").toLowerCase();
  const ty = (document.getElementById("m-type")?.value || "").toLowerCase();
  const mo = (document.getElementById("m-month")?.value || "");
  tbody.innerHTML = "";
  MAINTENANCE.filter(m => {
    if (q) {
      const hay = (m.device + " " + m.location + " " + m.maintenanceType + " " + m.workType + " " + m.problem).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (st && m.status.toLowerCase() !== st) return false;
    if (ty && m.maintenanceType.toLowerCase() !== ty) return false;
    if (mo) {
      const mm = (m.date || "").slice(0,7);
      if (mm !== mo) return false;
    }
    return true;
  }).forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(m.no)}</td>
      <td>${escapeHtml(m.reportId)}</td>
      <td>${escapeHtml(m.date)}</td>
      <td>${escapeHtml(m.device)}</td>
      <td>${escapeHtml(m.location)}</td>
      <td>${escapeHtml(m.maintenanceType)}</td>
      <td>${escapeHtml(m.workType)}</td>
      <td>${escapeHtml(m.problem)}</td>
      <td>${escapeHtml(m.action)}</td>
      <td>${escapeHtml(m.networkTest)}</td>
      <td><span class="badge ${/complete|pass/i.test(m.status) ? "ok" : "down"}">${escapeHtml(m.status)}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

/* Monthly uptime (current month, month-to-date) per device.
   Built from the Downtime Incidents sheet: overlap of each incident
   with [month start, now], then uptime = 1 - down/elapsed. */
function computeMonthlyUptimeMap() {
  const map = {};
  const now = Date.now();
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const elapsedMin = Math.max(1, (now - monthStart) / 60000);
  const downMin = {};
  INCIDENTS.forEach(inc => {
    if (!inc || !inc.device || !inc.downDate || isNaN(inc.downDate.getTime())) return;
    const startMs = inc.downDate.getTime();
    let endMs;
    if (inc.backUp) {
      const e = new Date(inc.backUp.replace(" ", "T"));
      endMs = isNaN(e.getTime()) ? now : e.getTime();
    } else {
      endMs = now; // ongoing outage
    }
    const from = Math.max(startMs, monthStart);
    const to = Math.min(endMs, now);
    if (to <= from) return;
    const key = inc.device.trim();
    downMin[key] = (downMin[key] || 0) + (to - from) / 60000;
  });
  Object.keys(downMin).forEach(k => {
    const pct = (1 - downMin[k] / elapsedMin) * 100;
    map[k] = Math.max(0, Math.min(100, pct));
  });
  return map;
}

function renderDevicesTable() {
  const tbody = document.querySelector("#devices-table tbody");
  if (!tbody) return;
  const q = (document.getElementById("dev-search")?.value || "").toLowerCase();
  const st = (document.getElementById("dev-status")?.value || "").toLowerCase();
  const ty = (document.getElementById("dev-type")?.value || "").toLowerCase();
  const sort = (document.getElementById("dev-sort")?.value || "import");
  tbody.innerHTML = "";
  let list = DEVICES.filter(d => {
    if (q) {
      const hay = (d.name + " " + d.ip + " " + d.type + " " + d.location).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (st && d.status.toLowerCase() !== st) return false;
    if (ty && d.type.toLowerCase() !== ty) return false;
    return true;
  });
  if (sort === "name") list.sort((a,b) => (a.name||"").localeCompare(b.name||""));
  else if (sort === "status") list.sort((a,b) => (a.status||"").localeCompare(b.status||""));
  else if (sort === "ip") list.sort((a,b) => (a.ip||"").localeCompare(b.ip||""));
  // import order = original order (already)
  const total = DEVICES.length;
  const shown = list.length;
  const countEl = document.getElementById("dev-count");
  if (countEl) countEl.textContent = "Showing " + shown + " of " + total;
  // Current-month uptime per device (from this month's downtime incidents)
  const monthUptime = computeMonthlyUptimeMap();
  const hasIncidents = INCIDENTS.length > 0;
  const monthLabel = (function(){ const n = new Date(); return n.toLocaleString("en", { month: "long", year: "numeric" }); })();
  list.forEach(d => {
    const key = (d.name || "").trim();
    let muText;
    if (hasIncidents) {
      const mu = monthUptime[key];
      muText = (mu === undefined ? 100 : mu).toFixed(2) + "%";
    } else {
      // fallback: Downtime Report availability (also month-scoped in the sheet)
      const rep = DOWNTIME_REPORT.find(x => (x.device || "").trim() === key);
      muText = rep && rep.availability ? escapeHtml(rep.availability) : "-";
    }
    const tr = document.createElement("tr");
    tr.title = "Uptime for " + monthLabel + " (month to date)";
    tr.innerHTML = `
      <td>${escapeHtml(d.no)}</td>
      <td>${escapeHtml(d.name)}</td>
      <td>${escapeHtml(d.ip)}</td>
      <td>${escapeHtml(d.type)}</td>
      <td>${escapeHtml(d.location)}</td>
      <td><span class="badge ${d.status.toLowerCase() === "up" ? "ok" : "down"}">${escapeHtml(d.status)}</span></td>
      <td>${escapeHtml(d.response)}</td>
      <td>${escapeHtml(d.uptime)}</td>
      <td class="mu">${muText}</td>
      <td>${escapeHtml(d.lastChecked)}</td>
    `;
    tbody.appendChild(tr);
  });
}

let DR_ROWS = [];

function localDateStr(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* YYYY-MM-DD day of an incident's start time (robust to different text formats) */
function incDay(i) {
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(i.downFrom || "");
  if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  if (i.downDate && !isNaN(i.downDate.getTime())) return localDateStr(i.downDate);
  return "";
}

/* ---------- Device incident modal (Downtime report) ---------- */
const DM_RANGES = [
  ["all", "All history"], ["today", "Today"], ["yesterday", "Yesterday"],
  ["7", "Last 7 days"], ["14", "Last 14 days"], ["30", "Last 30 days"],
  ["month", "This month"], ["lastmonth", "Last month"]
];
let DM = { device: "", range: "all", rows: [] };

function parseTs(str) {
  if (!str) return null;
  const d = new Date(String(str).trim().replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d.getTime();
}
function incSeconds(i) {
  const st = parseTs(i.downFrom), en = parseTs(i.backUp);
  const ongoing = (i.state || "").toLowerCase() === "ongoing";
  if (st && en && !ongoing) return Math.max(0, (en - st) / 1000);
  if (st && ongoing) return Math.max(0, (Date.now() - st) / 1000);
  return (i.minutes || 0) * 60;
}
function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const p = (n) => String(n).padStart(2, "0");
  if (sec < 60) return sec + "s";
  if (sec < 3600) return p(Math.floor(sec / 60)) + "m " + p(sec % 60) + "s";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return (d ? d + "d " : "") + (d || h ? h + "h " : "") + p(m) + "m";
}
/* returns [fromStr, toStr] (YYYY-MM-DD) or ["",""] for all history */
function quickRangeDates(r) {
  const today = new Date(), f = localDateStr;
  if (r === "all") return ["", ""];
  if (r === "today") return [f(today), f(today)];
  if (r === "yesterday") { const y = new Date(today); y.setDate(y.getDate() - 1); return [f(y), f(y)]; }
  if (r === "month") return [f(new Date(today.getFullYear(), today.getMonth(), 1)), f(today)];
  if (r === "lastmonth") return [f(new Date(today.getFullYear(), today.getMonth() - 1, 1)), f(new Date(today.getFullYear(), today.getMonth(), 0))];
  const n = parseInt(r, 10) || 7; const from = new Date(today); from.setDate(from.getDate() - n + 1);
  return [f(from), f(today)];
}
function deviceIcon(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("camera")) return "📷";
  if (t.includes("printer")) return "🖨️";
  if (t.includes("switch") || t.includes("router") || t.includes("firewall")) return "🔀";
  if (t.includes("server")) return "🖥️";
  return "💻";
}

function ensureDeviceModal() {
  let ov = document.getElementById("dm-overlay");
  if (ov) return ov;
  ov = document.createElement("div");
  ov.id = "dm-overlay"; ov.className = "dm-overlay";
  ov.innerHTML = `
    <div class="dm-modal" role="dialog" aria-modal="true">
      <div class="dm-head">
        <div>
          <div class="dm-title"><span id="dm-icon"></span> <span id="dm-name"></span> <span class="dm-scope" id="dm-scope"></span></div>
          <div class="dm-sub" id="dm-sub"></div>
        </div>
        <button class="dm-close" id="dm-close" title="Close">✕</button>
      </div>
      <div class="dm-toolbar">
        <select id="dm-range">${DM_RANGES.map(r => `<option value="${r[0]}">${r[1]}</option>`).join("")}</select>
        <button id="dm-details-btn">🗄 Device details</button>
        <button id="dm-export">⬇ Export Excel</button>
        <span class="dm-count" id="dm-count"></span>
      </div>
      <div class="dm-details" id="dm-details" style="display:none;"></div>
      <div class="dm-stats">
        <div class="dm-stat"><span>Period</span><b id="dm-period">-</b></div>
        <div class="dm-stat"><span>Times DOWN</span><b class="red" id="dm-down">0</b></div>
        <div class="dm-stat"><span>Times UP</span><b id="dm-up">0</b></div>
        <div class="dm-stat"><span>Total downtime</span><b class="red" id="dm-total">0s</b></div>
        <div class="dm-stat"><span>Longest</span><b id="dm-longest">0s</b></div>
        <div class="dm-stat"><span>Availability</span><b id="dm-avail">-</b></div>
      </div>
      <div class="dm-table-wrap">
        <table class="dm-table">
          <thead><tr><th style="width:56px">#</th><th>Down from</th><th>Back up at</th><th style="width:150px">Duration</th></tr></thead>
          <tbody id="dm-tbody"></tbody>
        </table>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov) closeDeviceModal(); });
  ov.querySelector("#dm-close").addEventListener("click", closeDeviceModal);
  ov.querySelector("#dm-range").addEventListener("change", (e) => { DM.range = e.target.value; renderDeviceModal(); });
  ov.querySelector("#dm-details-btn").addEventListener("click", () => {
    const el = document.getElementById("dm-details");
    el.style.display = el.style.display === "none" ? "" : "none";
  });
  ov.querySelector("#dm-export").addEventListener("click", exportDeviceModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDeviceModal(); });
  return ov;
}
function closeDeviceModal() {
  const ov = document.getElementById("dm-overlay");
  if (ov) ov.classList.remove("open");
  document.body.style.overflow = "";
}
function openDeviceModal(device, range) {
  const ov = ensureDeviceModal();
  DM.device = (device || "").trim();
  DM.range = range || "all";
  ov.querySelector("#dm-range").value = DM.range;
  document.getElementById("dm-details").style.display = "none";
  ov.classList.add("open");
  document.body.style.overflow = "hidden";
  renderDeviceModal();
}
function renderDeviceModal() {
  const name = DM.device;
  const all = INCIDENTS.filter(i => (i.device || "").trim() === name);
  const [fromStr, toStr] = quickRangeDates(DM.range);
  const list = all.filter(i => {
    const day = incDay(i);
    if (fromStr && (!day || day < fromStr)) return false;
    if (toStr && (!day || day > toStr)) return false;
    return true;
  }).sort((a, b) => (b.downFrom || "").localeCompare(a.downFrom || ""));
  DM.rows = list;

  const devObj = DEVICES.find(x => (x.name || "").trim() === name);
  const meta = all[0] || {};
  const ip = (devObj && devObj.ip) || meta.ip || "";
  const type = (devObj && devObj.type) || meta.type || "";
  const loc = (devObj && devObj.location) || meta.location || "";
  const scope = (DM_RANGES.find(r => r[0] === DM.range) || [])[1] || "";
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("dm-icon", deviceIcon(type));
  set("dm-name", name);
  set("dm-scope", "— " + (DM.range === "all" ? "all incidents" : scope.toLowerCase()));
  set("dm-sub", [ip, type].filter(Boolean).join(" · "));
  set("dm-count", list.length + " incident" + (list.length === 1 ? "" : "s"));

  // stats
  const downs = list.length;
  const ups = list.filter(i => (i.state || "").toLowerCase() !== "ongoing").length;
  const secs = list.map(incSeconds);
  const total = secs.reduce((a, b) => a + b, 0);
  const longest = secs.reduce((a, b) => Math.max(a, b), 0);
  const days = list.map(incDay).filter(Boolean).sort();
  const todayStr = localDateStr(new Date());
  const pFrom = fromStr || days[0] || "";
  const pTo = toStr || todayStr;
  let avail = "100.00%";
  if (pFrom) {
    const startMs = new Date(pFrom + "T00:00:00").getTime();
    const endMs = Math.min(new Date(pTo + "T23:59:59").getTime(), Date.now());
    const periodSec = Math.max(60, (endMs - startMs) / 1000);
    avail = Math.max(0, Math.min(100, 100 - (total / periodSec) * 100)).toFixed(2) + "%";
  }
  set("dm-period", pFrom ? (pFrom + " → " + pTo) : "-");
  set("dm-down", downs);
  set("dm-up", ups);
  set("dm-total", fmtDur(total));
  set("dm-longest", fmtDur(longest));
  set("dm-avail", avail);

  // table
  const tb = document.getElementById("dm-tbody");
  tb.innerHTML = "";
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;">No incidents in this period.</td></tr>';
  }
  list.forEach((i, n) => {
    const ongoing = (i.state || "").toLowerCase() === "ongoing";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${n + 1}</td>
      <td>${escapeHtml(i.downFrom)}</td>
      <td>${ongoing ? '<span class="badge down">still down</span>' : escapeHtml(i.backUp || "-")}</td>
      <td class="dm-dur">${escapeHtml(fmtDur(secs[n]))}${ongoing ? " …" : ""}</td>`;
    tb.appendChild(tr);
  });

  // device details panel
  const det = [
    ["Device", name], ["IP address", ip], ["Type", type], ["Location", loc],
    ["Status now", devObj ? devObj.status : ""], ["Response", devObj ? devObj.response : ""],
    ["Status since", devObj ? devObj.statusSince : ""], ["Last checked", devObj ? devObj.lastChecked : ""],
    ["Uptime", devObj ? devObj.uptime : ""]
  ].filter(x => x[1]);
  document.getElementById("dm-details").innerHTML = det.map(x => `<div><span>${escapeHtml(x[0])}</span><b>${escapeHtml(x[1])}</b></div>`).join("");
}
function exportDeviceModal() {
  const rows = DM.rows.map((i, n) => [n + 1, i.device, i.ip, i.type, i.location, i.downFrom, i.backUp || "", fmtDur(incSeconds(i)), i.state]);
  exportTable("downtime-" + DM.device.replace(/[^\w.-]+/g, "_") + "-" + localDateStr(new Date()),
    ["#", "Device", "IP", "Type", "Location", "Down from", "Back up at", "Duration", "State"], rows);
}

/* ---------- Excel export (SheetJS loaded on demand, CSV fallback) ---------- */
function loadXLSX() {
  return new Promise((res, rej) => {
    if (window.XLSX) return res(window.XLSX);
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    sc.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error("xlsx missing"));
    sc.onerror = rej;
    document.head.appendChild(sc);
  });
}
async function exportTable(filename, headers, rows) {
  try {
    const X = await loadXLSX();
    const ws = X.utils.aoa_to_sheet([headers].concat(rows));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, "Report");
    X.writeFile(wb, filename + ".xlsx");
  } catch (e) {
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const csv = "\ufeff" + [headers].concat(rows).map(r => r.map(esc).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = filename + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }
}

function renderDowntimeReportTable() {
  const tbody = document.querySelector("#downtime-report-table tbody");
  const dateCard = document.getElementById("dr-date-table-card");
  const incCard = document.getElementById("dr-incidents-card");
  const view = document.getElementById("dr-view")?.value || "device";
  // show/hide tables
  if (tbody) tbody.parentElement.parentElement.style.display = (view === "device") ? "" : "none";
  if (dateCard) dateCard.style.display = (view === "date") ? "" : "none";
  if (incCard) incCard.style.display = (view === "all") ? "" : "none";

  const q = (document.getElementById("dr-search")?.value || "").toLowerCase();
  const ty = (document.getElementById("dr-type")?.value || "").toLowerCase();
  const dev = (document.getElementById("dr-device")?.value || "").toLowerCase();
  const from = document.getElementById("dr-from")?.value || "";
  const to = document.getElementById("dr-to")?.value || "";

  // filter incidents by date/device/type for "all" view and KPIs
  const filteredInc = INCIDENTS.filter(i => {
    if (q && !(i.device.toLowerCase().includes(q) || i.ip.includes(q))) return false;
    if (ty && i.type.toLowerCase() !== ty) return false;
    if (dev && i.device.toLowerCase() !== dev) return false;
    const day = incDay(i);
    if (from && (!day || day < from)) return false;
    if (to && (!day || day > to)) return false;
    return true;
  });

  // KPIs
  const devicesWithDowntime = new Set(filteredInc.map(i => i.device)).size;
  const totalDevices = DEVICES.length || 250;
  const wentDown = filteredInc.length;
  const cameUp = filteredInc.filter(i => i.state.toLowerCase() !== "ongoing").length;
  const totalMin = filteredInc.reduce((a,b) => a + (b.minutes||0), 0);
  const stillDown = filteredInc.filter(i => i.state.toLowerCase() === "ongoing").length;
  const el = (id) => document.getElementById(id);
  if (el("kpi-dr-devices")) el("kpi-dr-devices").textContent = devicesWithDowntime + " / " + totalDevices;
  if (el("kpi-dr-wentup")) el("kpi-dr-wentup").textContent = wentDown + " / " + cameUp;
  if (el("kpi-dr-total")) el("kpi-dr-total").textContent = formatDowntime(totalMin);
  if (el("kpi-dr-still")) el("kpi-dr-still").textContent = stillDown;
  if (el("dr-period")) el("dr-period").textContent = (from || to) ? ((from || "start") + " → " + (to || "today")) : "All history";

  // By device table (built from the filtered incidents so the date range applies)
  if (tbody) {
    tbody.innerHTML = "";
    const groups = {};
    filteredInc.forEach(i => {
      const k = (i.device || "").trim();
      if (!groups[k]) groups[k] = { device: k, ip: i.ip, type: i.type, location: i.location, incidents: [] };
      groups[k].incidents.push(i);
    });
    // period length (minutes) for availability
    const todayStr = localDateStr(new Date());
    const days = filteredInc.map(incDay).filter(Boolean).sort();
    const pFrom = from || days[0] || todayStr;
    const pTo = to || todayStr;
    const pStartMs = new Date(pFrom + "T00:00:00").getTime();
    const pEndMs = Math.min(new Date(pTo + "T23:59:59").getTime(), Date.now());
    const periodMin = Math.max(1, (pEndMs - pStartMs) / 60000);
    const hasRange = !!(from || to);
    DR_ROWS = Object.values(groups).map(g => {
      const down = g.incidents.length;
      const up = g.incidents.filter(i => (i.state || "").toLowerCase() !== "ongoing").length;
      const mins = g.incidents.reduce((a, b) => a + (b.minutes || 0), 0);
      const longest = g.incidents.reduce((a, b) => Math.max(a, b.minutes || 0), 0);
      const ongoing = g.incidents.some(i => (i.state || "").toLowerCase() === "ongoing");
      const devObj = DEVICES.find(x => (x.name || "").trim() === g.device);
      const now = ongoing ? "DOWN" : (devObj ? devObj.status : "UP");
      const avail = hasRange ? Math.max(0, Math.min(100, 100 - (mins / periodMin) * 100)).toFixed(2) + "%" : "-";
      return Object.assign(g, { down, up, mins, longest, now, avail });
    }).sort((a, b) => b.mins - a.mins);
    DR_ROWS.forEach((g, idx) => {
      const tr = document.createElement("tr");
      tr.className = "dr-row";
      tr.dataset.idx = String(idx);
      tr.title = "Click to see all incidents of this device";
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${escapeHtml(g.device)}</td>
        <td>${escapeHtml(g.ip)}</td>
        <td>${escapeHtml(g.type)}</td>
        <td>${escapeHtml(g.location)}</td>
        <td>${g.down}</td>
        <td>${g.up}</td>
        <td>${escapeHtml(formatDowntime(g.mins))}</td>
        <td>${Math.round(g.mins)}</td>
        <td>${escapeHtml(formatDowntime(g.longest))}</td>
        <td>${escapeHtml(g.avail)}</td>
        <td><span class="badge ${String(g.now).toLowerCase() === "up" ? "ok" : "down"}">${escapeHtml(g.now)}</span></td>
      `;
      tbody.appendChild(tr);
    });
    if (!DR_ROWS.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="12" style="text-align:center;color:var(--muted);padding:14px;">No downtime incidents found for the selected filters / date range.</td>';
      tbody.appendChild(tr);
    }
  }

  // By date table
  const dateTbody = document.querySelector("#dr-date-table tbody");
  if (dateTbody) {
    dateTbody.innerHTML = "";
    const map = {};
    filteredInc.forEach(i => {
      const dt = (i.downFrom || "").slice(0,10);
      if (!dt) return;
      if (!map[dt]) map[dt] = { date: dt, incidents: 0, devices: new Set(), minutes: 0 };
      map[dt].incidents++;
      map[dt].devices.add(i.device);
      map[dt].minutes += i.minutes || 0;
    });
    Object.values(map).sort((a,b) => a.date.localeCompare(b.date)).forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(r.date)}</td><td>${fmt(r.incidents)}</td><td>${fmt(r.devices.size)}</td><td>${fmt(Math.round(r.minutes))}</td>`;
      dateTbody.appendChild(tr);
    });
  }

  // All incidents table
  const incTbody = document.querySelector("#dr-incidents-table tbody");
  if (incTbody) {
    incTbody.innerHTML = "";
    filteredInc.slice(0, 500).forEach(i => {
      const tr = document.createElement("tr");
      tr.className = "dr-row-link";
      tr.dataset.device = i.device;
      tr.title = "Click to see all incidents of this device";
      tr.innerHTML = `
        <td>${escapeHtml(i.device)}</td>
        <td>${escapeHtml(i.ip)}</td>
        <td>${escapeHtml(i.type)}</td>
        <td>${escapeHtml(i.location)}</td>
        <td>${escapeHtml(i.downFrom)}</td>
        <td>${escapeHtml(i.backUp || "-")}</td>
        <td>${escapeHtml(i.duration)}</td>
        <td><span class="badge ${i.state.toLowerCase() === "ongoing" ? "down" : "ok"}">${escapeHtml(i.state)}</span></td>
      `;
      incTbody.appendChild(tr);
    });
  }
}

function formatDowntime(mins) {
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = Math.round(mins % 60);
  let s = "";
  if (d) s += d + "d ";
  if (h) s += h + "h ";
  s += m + "m";
  return s.trim();
}

/* ---------- Log report ---------- */
let LOG_ROWS = [];
function logEventType(a) {
  const k = (a.kind || "").toLowerCase();
  const m = (a.message || "");
  if (/down/.test(k)) return "DOWN";
  if (/(^|[^a-z])up([^a-z]|$)/.test(k)) return "UP";
  const mm = /\bis\s+(up|down)\b/i.exec(m);
  if (mm) return mm[1].toUpperCase();
  if (/\bdown\b/i.test(m) && !/\bup\b/i.test(m)) return "DOWN";
  if (/\bup\b/i.test(m) && !/\bdown\b/i.test(m)) return "UP";
  return "ADMIN";
}
function logDay(a) {
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(a.time || "");
  return m ? m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") : "";
}
function renderActivityTable() {
  const tbody = document.querySelector("#activity-table tbody");
  if (!tbody) return;
  const val = (id) => (document.getElementById(id)?.value || "");
  const q = val("log-search").toLowerCase().trim();
  const ev = val("log-event");
  const dt = val("log-devtype").toLowerCase();
  const dev = val("log-device").trim().toLowerCase();
  const from = val("log-from"), to = val("log-to");
  const typeOf = {};
  DEVICES.forEach(d => { typeOf[(d.name || "").trim().toLowerCase()] = d.type; });
  INCIDENTS.forEach(i => { const k = (i.device || "").trim().toLowerCase(); if (!typeOf[k]) typeOf[k] = i.type; });

  const list = ACTIVITY_LOG.map(a => ({ a, ev: logEventType(a), type: typeOf[(a.device || "").trim().toLowerCase()] || "", day: logDay(a) }))
    .filter(x => {
      if (q && !((x.a.device + " " + x.a.message).toLowerCase().includes(q))) return false;
      if (ev && x.ev !== ev) return false;
      if (dt && (x.type || "").toLowerCase() !== dt) return false;
      if (dev && (x.a.device || "").trim().toLowerCase() !== dev) return false;
      if (from && (!x.day || x.day < from)) return false;
      if (to && (!x.day || x.day > to)) return false;
      return true;
    })
    .sort((p, q2) => (q2.a.time || "").localeCompare(p.a.time || ""));
  LOG_ROWS = list;

  const cnt = (k) => list.filter(x => x.ev === k).length;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("log-period", (from || to) ? ((from || "start") + " → " + (to || localDateStr(new Date()))) : "All history");
  set("log-total", list.length);
  set("log-down", cnt("DOWN"));
  set("log-up", cnt("UP"));
  set("log-admin", cnt("ADMIN"));

  const MAX = 1000;
  tbody.innerHTML = "";
  list.slice(0, MAX).forEach((x, n) => {
    const tr = document.createElement("tr");
    const cls = x.ev === "UP" ? "ev-up" : x.ev === "DOWN" ? "ev-down" : "ev-admin";
    const label = x.ev === "ADMIN" ? "ADMIN" : x.ev;
    tr.innerHTML = `
      <td>${n + 1}</td>
      <td>${escapeHtml(x.a.time)}</td>
      <td><span class="ev-badge ${cls}">${label}</span></td>
      <td><b>${escapeHtml(x.a.device)}</b></td>
      <td>${escapeHtml(x.type)}</td>
      <td>${escapeHtml(x.a.message)}</td>`;
    tbody.appendChild(tr);
  });
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:14px;">No log events found for the selected filters / date range.</td></tr>';
  }
  const st = document.getElementById("log-status-msg");
  if (st) st.textContent = list.length > MAX ? ("Showing latest " + MAX + " of " + list.length + " — narrow the date range or Export Excel for all") : "";
}
function exportLogReport() {
  const rows = LOG_ROWS.map((x, n) => [n + 1, x.a.time, x.ev === "ADMIN" ? "ADMIN" : x.ev, x.a.device, x.type, x.a.message]);
  exportTable("log-report-" + localDateStr(new Date()), ["#", "Date & time", "Event", "Device", "Type", "Message"], rows);
}

function renderUsersTable() {
  const tbody = document.querySelector("#users-table tbody");
  if (!tbody) return;
  const q = (document.getElementById("u-search")?.value || "").toLowerCase();
  const rl = (document.getElementById("u-role")?.value || "").toLowerCase();
  const mo = (document.getElementById("u-month")?.value || "");
  tbody.innerHTML = "";
  USERS.filter(u => {
    if (q) {
      const hay = (u.fullName + " " + u.username + " " + u.email + " " + u.department + " " + u.designation).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (rl && u.role.toLowerCase() !== rl) return false;
    if (mo) {
      const mm = (u.created || "").slice(0,7);
      if (mm !== mo) return false;
    }
    return true;
  }).forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(u.no)}</td>
      <td>${escapeHtml(u.fullName)}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.employeeId)}</td>
      <td>${escapeHtml(u.designation)}</td>
      <td>${escapeHtml(u.department)}</td>
      <td>${escapeHtml(u.location)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.phone)}</td>
      <td>${escapeHtml(u.role)}</td>
      <td>${escapeHtml(u.account)}</td>
      <td>${escapeHtml(u.created)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPendingUsersTable() {
  const tbody = document.querySelector("#pending-users-table tbody");
  if (!tbody) return;
  const q = (document.getElementById("pu-search")?.value || "").toLowerCase();
  const st = (document.getElementById("pu-status")?.value || "").toLowerCase();
  const mo = (document.getElementById("pu-month")?.value || "");
  tbody.innerHTML = "";
  PENDING_USERS.filter(u => {
    if (q) {
      const hay = (u.fullName + " " + u.username + " " + u.email + " " + u.department).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (st && u.status.toLowerCase() !== st) return false;
    if (mo) {
      const mm = (u.requested || "").slice(0,7);
      if (mm !== mo) return false;
    }
    return true;
  }).forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(u.id)}</td>
      <td>${escapeHtml(u.requested)}</td>
      <td>${escapeHtml(u.fullName)}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.phone)}</td>
      <td>${escapeHtml(u.department)}</td>
      <td>${escapeHtml(u.designation)}</td>
      <td>${escapeHtml(u.employeeId)}</td>
      <td>${escapeHtml(u.location)}</td>
      <td>${escapeHtml(u.wantsRole)}</td>
      <td>${escapeHtml(u.reason)}</td>
      <td><span class="badge ${u.status.toLowerCase() === "approved" ? "ok" : (u.status.toLowerCase() === "rejected" ? "down" : "ok")}">${escapeHtml(u.status)}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderEmployeesTable() {
  const tbody = document.querySelector("#employees-table tbody");
  if (!tbody) return;
  const q = (document.getElementById("emp-search")?.value || "").toLowerCase();
  const rl = (document.getElementById("emp-role")?.value || "").toLowerCase();
  const mo = (document.getElementById("emp-month")?.value || "");
  tbody.innerHTML = "";
  EMPLOYEES.filter(u => {
    if (q) {
      const hay = (u.fullName + " " + u.username + " " + u.email + " " + u.department + " " + u.designation).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (rl && u.role.toLowerCase() !== rl) return false;
    if (mo) {
      const mm = (u.created || "").slice(0,7);
      if (mm !== mo) return false;
    }
    return true;
  }).forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(u.no)}</td>
      <td>${escapeHtml(u.fullName)}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.employeeId)}</td>
      <td>${escapeHtml(u.designation)}</td>
      <td>${escapeHtml(u.department)}</td>
      <td>${escapeHtml(u.location)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.phone)}</td>
      <td>${escapeHtml(u.role)}</td>
      <td>${escapeHtml(u.account)}</td>
    `;
    tbody.appendChild(tr);
  });
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

function formatMonth(ym) {
  if (!ym || ym.length < 7) return ym;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const m = parseInt(ym.slice(5, 7), 10);
  return (months[m - 1] || ym.slice(5, 7)) + " " + ym.slice(0, 4);
}
function populateMonthSelect(id, values) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const current = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  const months = [...new Set((values || []).map(v => String(v || "").slice(0, 7)).filter(Boolean))].sort().reverse();
  months.forEach(m => {
    const o = document.createElement("option");
    o.value = m; o.textContent = formatMonth(m);
    sel.appendChild(o);
  });
  sel.value = current;
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
      })(),
      fetchSheet("IT Maintenance"),
      fetchSheet("Downtime Report"),
      fetchSheet("Activity Log"),
      fetchSheet("Devices"),
      fetchSheet("Users / Employees"),
      fetchSheet("Access Requests")
    ]);
    if (results[0].status === "fulfilled") INCIDENTS = parseIncidents(results[0].value);
    if (results[1].status === "fulfilled") DATE_INCIDENTS = parseDateIncidents(results[1].value);
    if (results[2].status === "fulfilled") DEVICE_DOWNTIME = parseDeviceDowntime(results[2].value);
    if (results[3].status === "fulfilled") CONSUMPTION = parseConsumption(results[3].value);
    if (results[4].status === "fulfilled") ASSETS = parseAssets(results[4].value);
    if (results[5].status === "fulfilled") ITEMS = parseItems(results[5].value);
    if (results[6].status === "fulfilled") MAINTENANCE = parseMaintenance(results[6].value);
    if (results[7].status === "fulfilled") DOWNTIME_REPORT = parseDowntimeReport(results[7].value);
    if (results[8].status === "fulfilled") ACTIVITY_LOG = parseActivityLog(results[8].value);
    if (results[9].status === "fulfilled") DEVICES = parseDevices(results[9].value);
    if (results[10].status === "fulfilled") { USERS = parseUsers(results[10].value); EMPLOYEES = parseEmployees(results[10].value); }
    if (results[11].status === "fulfilled") PENDING_USERS = parsePendingUsers(results[11].value);


    populateAssetsFilters();
    populateItemsFilters();
    populateMonthSelect("c-month", CONSUMPTION.map(x => x.date));
    populateMonthSelect("a-month", ASSETS.map(x => x.created));

    populateMonthSelect("m-month", MAINTENANCE.map(x => x.date));
    populateMonthSelect("dr-month", DOWNTIME_REPORT.map(x => x.firstDown));
    populateMonthSelect("u-month", USERS.map(x => x.created));
    populateMonthSelect("pu-month", PENDING_USERS.map(x => x.requested));
    populateMonthSelect("emp-month", EMPLOYEES.map(x => x.created));

    // populate dropdowns
    (function() {
      const devType = document.getElementById("dev-type");
      if (devType) {
        const types = [...new Set(DEVICES.map(d => d.type).filter(Boolean))].sort();
        while (devType.options.length > 1) devType.remove(1);
        // update "All types" option count
        if (devType.options.length > 0) devType.options[0].textContent = "All types (" + DEVICES.length + ")";
        types.forEach(t => {
          const cnt = DEVICES.filter(d => d.type === t).length;
          const o = document.createElement("option"); o.value = t; o.textContent = t + " (" + cnt + ")"; devType.appendChild(o);
        });
      }
      const mStatus = document.getElementById("m-status");
      if (mStatus) {
        const vals = [...new Set(MAINTENANCE.map(m => m.status).filter(Boolean))].sort();
        while (mStatus.options.length > 1) mStatus.remove(1);
        vals.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; mStatus.appendChild(o); });
      }
      const mType = document.getElementById("m-type");
      if (mType) {
        const vals = [...new Set(MAINTENANCE.map(m => m.maintenanceType).filter(Boolean))].sort();
        while (mType.options.length > 1) mType.remove(1);
        vals.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; mType.appendChild(o); });
      }
      const drType = document.getElementById("dr-type");
      if (drType) {
        const vals = [...new Set(DOWNTIME_REPORT.map(d => d.type).filter(Boolean))].sort();
        while (drType.options.length > 1) drType.remove(1);
        vals.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; drType.appendChild(o); });
      }
      const drDev = document.getElementById("dr-device");
      if (drDev) {
        const vals = [...new Set(INCIDENTS.map(i => i.device).filter(Boolean))].sort();
        while (drDev.options.length > 1) drDev.remove(1);
        vals.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; drDev.appendChild(o); });
      }
      const logDevType = document.getElementById("log-devtype");
      if (logDevType) {
        const vals = [...new Set(DEVICES.map(d => d.type).filter(Boolean).concat(INCIDENTS.map(i => i.type).filter(Boolean)))].sort();
        while (logDevType.options.length > 1) logDevType.remove(1);
        vals.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; logDevType.appendChild(o); });
      }
      const logDevice = document.getElementById("log-device");
      if (logDevice) {
        const keep = logDevice.value;
        const vals = [...new Set(DEVICES.map(d => (d.name || "").trim()).concat(ACTIVITY_LOG.map(a => (a.device || "").trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        while (logDevice.options.length > 1) logDevice.remove(1);
        vals.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; logDevice.appendChild(o); });
        logDevice.value = keep;
      }
      const uRole = document.getElementById("u-role");
      if (uRole) {
        const vals = [...new Set(USERS.map(u => u.role).filter(Boolean))].sort();
        while (uRole.options.length > 1) uRole.remove(1);
        vals.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; uRole.appendChild(o); });
      }
      const puStatus = document.getElementById("pu-status");
      if (puStatus) {
        const vals = [...new Set(PENDING_USERS.map(u => u.status).filter(Boolean))].sort();
        while (puStatus.options.length > 1) puStatus.remove(1);
        vals.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; puStatus.appendChild(o); });
      }
      const empRole = document.getElementById("emp-role");
      if (empRole) {
        const vals = [...new Set(EMPLOYEES.map(u => u.role).filter(Boolean))].sort();
        while (empRole.options.length > 1) empRole.remove(1);
        vals.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; empRole.appendChild(o); });
      }
    })();

    renderConsumptionTable();
    renderAssetsTable();
    renderItemsTable();
    renderMaintenanceTable();
    renderDevicesTable();
    renderDowntimeReportTable();
    renderActivityTable();
    renderUsersTable();
    renderPendingUsersTable();
    renderEmployeesTable();
    renderMaintenanceTable();
    renderDevicesTable();
    renderDowntimeReportTable();
    renderActivityTable();
    renderUsersTable();
    renderPendingUsersTable();
    renderEmployeesTable();

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

function applyIncidentFilters() {
  incidentFilters.from = document.getElementById("f-date-from").value;
  incidentFilters.to = document.getElementById("f-date-to").value;
  incidentFilters.device = document.getElementById("f-device").value.trim();
  incidentFilters.type = document.getElementById("f-type").value;
  incidentFilters.state = document.getElementById("f-state").value;
  incidentFilters.location = document.getElementById("f-location").value.trim();
  incidentFilters.month = document.getElementById("f-month").value;
  incidentPage = 1;
  const st = document.getElementById("filter-status");
  if (st) { st.textContent = "Filtered"; st.className = ""; }
  renderIncidentsTable();
  renderDateIncidents();
  renderDeviceDowntime();
}
function resetIncidentFilters() {
  incidentFilters = { from: "", to: "", device: "", type: "", state: "", location: "", month: "" };
  document.getElementById("f-date-from").value = "";
  document.getElementById("f-date-to").value = "";
  document.getElementById("f-device").value = "";
  document.getElementById("f-type").value = "";
  document.getElementById("f-state").value = "";
  document.getElementById("f-location").value = "";
  document.getElementById("f-month").value = "";
  incidentPage = 1;
  const st = document.getElementById("filter-status");
  if (st) { st.textContent = "Filters reset"; st.className = ""; }
  renderIncidentsTable();
  renderDateIncidents();
  renderDeviceDowntime();
}
function applyConsumptionFilters() {
  consumptionFilters.from = document.getElementById("c-date-from").value;
  consumptionFilters.to = document.getElementById("c-date-to").value;
  consumptionFilters.item = document.getElementById("c-item").value.trim();
  consumptionFilters.warehouse = document.getElementById("c-warehouse").value.trim();
  consumptionFilters.mill = document.getElementById("c-mill").value.trim();
  consumptionFilters.month = document.getElementById("c-month").value;
  consumptionPage = 1;
  const st = document.getElementById("consumption-status");
  if (st) { st.textContent = "Filtered"; st.className = ""; }
  renderConsumptionTable();
}
function resetConsumptionFilters() {
  consumptionFilters = { from: "", to: "", item: "", warehouse: "", mill: "", month: "" };
  document.getElementById("c-date-from").value = "";
  document.getElementById("c-date-to").value = "";
  document.getElementById("c-item").value = "";
  document.getElementById("c-warehouse").value = "";
  document.getElementById("c-mill").value = "";
  document.getElementById("c-month").value = "";
  consumptionPage = 1;
  const st = document.getElementById("consumption-status");
  if (st) { st.textContent = "Filters reset"; st.className = ""; }
  renderConsumptionTable();
}
function applyAssetsFilters() {
  assetsFilters.search = document.getElementById("a-search").value.trim();
  assetsFilters.status = document.getElementById("a-status").value;
  assetsFilters.category = document.getElementById("a-category").value;
  assetsFilters.brand = document.getElementById("a-brand").value.trim();
  assetsFilters.plant = document.getElementById("a-plant").value.trim();
  assetsFilters.month = document.getElementById("a-month").value;
  assetsPage = 1;
  const st = document.getElementById("assets-status");
  if (st) { st.textContent = "Filtered"; st.className = ""; }
  renderAssetsTable();
}
function resetAssetsFilters() {
  assetsFilters = { search: "", status: "", category: "", brand: "", plant: "", month: "" };
  document.getElementById("a-search").value = "";
  document.getElementById("a-status").value = "";
  document.getElementById("a-category").value = "";
  document.getElementById("a-brand").value = "";
  document.getElementById("a-plant").value = "";
  document.getElementById("a-month").value = "";
  assetsPage = 1;
  const st = document.getElementById("assets-status");
  if (st) { st.textContent = "Filters reset"; st.className = ""; }
  renderAssetsTable();
}
function applyItemsFilters() {
  itemsFilters.search = document.getElementById("i-search").value.trim();
  itemsFilters.category = document.getElementById("i-category").value;
  itemsFilters.warehouse = document.getElementById("i-warehouse").value.trim();
  itemsPage = 1;
  const st = document.getElementById("items-status");
  if (st) { st.textContent = "Filtered"; st.className = ""; }
  renderItemsTable();
}
function resetItemsFilters() {
  itemsFilters = { search: "", category: "", warehouse: "", month: "" };
  document.getElementById("i-search").value = "";
  document.getElementById("i-category").value = "";
  document.getElementById("i-warehouse").value = "";
  itemsPage = 1;
  const st = document.getElementById("items-status");
  if (st) { st.textContent = "Filters reset"; st.className = ""; }
  renderItemsTable();
}

function showPage(page) {
  document.querySelectorAll("section.section").forEach(sec => {
    sec.style.display = (sec.dataset.page === page) ? "" : "none";
  });
  document.querySelectorAll(".nav-item, .nav-subitem").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  if (page === "downtime-report" || page === "log-report") {
    const sub = document.getElementById("sub-reports");
    if (sub) sub.style.display = "block";
    const arrow = document.querySelector('[data-toggle="reports"] .nav-arrow');
    if (arrow) arrow.textContent = "▼";
  }
  if (page === "user-list" || page === "pending-users" || page === "employee-list") {
    const sub = document.getElementById("sub-users");
    if (sub) sub.style.display = "block";
    const arrow = document.querySelector('[data-toggle="users"] .nav-arrow');
    if (arrow) arrow.textContent = "▼";
  }
  try { localStorage.setItem("activePage", page); } catch (e) {}
}

document.addEventListener("DOMContentLoaded", () => {
  // Login gate
  const overlay = document.getElementById("login-overlay");
  const isLogged = (function(){ try { return !!localStorage.getItem("aelnoc_user"); } catch(e){ return false; } })();
  if (isLogged) { if (overlay) overlay.classList.add("hidden"); }
  else { if (overlay) overlay.classList.remove("hidden"); }

  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {

      const u = (document.getElementById("login-user").value || "").trim();
      const p = document.getElementById("login-pass").value || "";
      const err = document.getElementById("login-error");
      // validate against users list or default admin
      let ok = false;
      if (u === "admin" && p === "Admin@123") ok = true;
      if (USERS && USERS.length) {
        const found = USERS.find(x => (x.username === u || x.email === u));
        // password not stored in sheet; accept if username exists and password matches username or default
        if (found && (p === "Admin@123" || p === found.username)) ok = true;
      }
      if (ok) {
        try { localStorage.setItem("aelnoc_user", u); } catch(e){}
        if (overlay) overlay.classList.add("hidden");
        if (err) err.textContent = "";
        loadData();
      } else {
        if (err) err.textContent = "Invalid username or password.";
      }
    });
  }
  const signout = document.getElementById("signout-btn");
  if (signout) {
    signout.addEventListener("click", () => {
      try { localStorage.removeItem("aelnoc_user"); } catch(e){}
      if (overlay) overlay.classList.remove("hidden");
    });
  }

  const saved = (function(){ try { return localStorage.getItem("activePage"); } catch(e){ return null; } })();
  showPage(saved || "dashboard");
  document.querySelectorAll(".nav-item").forEach(btn => {
    if (btn.dataset.page) {
      btn.addEventListener("click", () => showPage(btn.dataset.page));
    }
  });
  // submenu toggle
  document.querySelectorAll(".nav-parent").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggle;
      const sub = document.getElementById("sub-" + key);
      if (sub) {
        const open = sub.style.display !== "none" && sub.style.display !== "";
        sub.style.display = open ? "none" : "block";
        const arrow = btn.querySelector(".nav-arrow");
        if (arrow) arrow.textContent = open ? "▶" : "▼";
      }
    });
  });
  document.querySelectorAll(".nav-subitem").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });
  if (isLogged) { loadData(); }
  document.getElementById("refresh-btn").addEventListener("click", loadData);

  // Consumption filters
  document.getElementById("apply-consumption").addEventListener("click", applyConsumptionFilters);
  document.getElementById("reset-consumption").addEventListener("click", resetConsumptionFilters);

  // Assets filters
  document.getElementById("apply-assets").addEventListener("click", applyAssetsFilters);
  document.getElementById("reset-assets").addEventListener("click", resetAssetsFilters);

  // Items filters
  document.getElementById("apply-items").addEventListener("click", applyItemsFilters);
  document.getElementById("reset-items").addEventListener("click", resetItemsFilters);

  // Auto-filter: typing/selecting in any filter control re-applies filters without clicking Apply
  const bindAuto = (ids, applyFn) => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const isText = (el.tagName === "INPUT" && el.type !== "date");
      if (isText) {
        let timer = null;
        el.addEventListener("input", () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(applyFn, 250);
        });
      } else {
        el.addEventListener("change", applyFn);
      }
    });
  };
  bindAuto(["c-date-from","c-date-to","c-item","c-warehouse","c-mill","c-month"], applyConsumptionFilters);
  bindAuto(["a-search","a-status","a-category","a-brand","a-plant","a-month"], applyAssetsFilters);
  bindAuto(["i-search","i-category","i-warehouse"], applyItemsFilters);
  bindAuto(["dev-search","dev-status","dev-type","dev-sort"], renderDevicesTable);
  bindAuto(["m-search","m-status","m-type","m-month"], renderMaintenanceTable);
  bindAuto(["u-search","u-role","u-month"], renderUsersTable);
  bindAuto(["pu-search","pu-status","pu-month"], renderPendingUsersTable);
  bindAuto(["emp-search","emp-role","emp-month"], renderEmployeesTable);

  // Settings
  const saveSet = document.getElementById("save-settings");
  if (saveSet) {
    saveSet.addEventListener("click", () => {
      const st = document.getElementById("settings-status");
      if (st) { st.textContent = "Saved"; st.className = ""; }
    });
  }

  // Reset buttons
  const resetDev = document.getElementById("reset-dev");
  if (resetDev) resetDev.addEventListener("click", () => { document.getElementById("dev-search").value=""; document.getElementById("dev-status").value=""; document.getElementById("dev-type").value=""; renderDevicesTable(); });
  const resetMaint = document.getElementById("reset-maint");
  if (resetMaint) resetMaint.addEventListener("click", () => { document.getElementById("m-search").value=""; document.getElementById("m-status").value=""; document.getElementById("m-type").value=""; document.getElementById("m-month").value=""; renderMaintenanceTable(); });
  const resetDr = document.getElementById("reset-dr");
  if (resetDr) resetDr.addEventListener("click", () => {
    document.getElementById("dr-search").value = "";
    if (document.getElementById("dr-type")) document.getElementById("dr-type").value = "";
    if (document.getElementById("dr-device")) document.getElementById("dr-device").value = "";
    if (document.getElementById("dr-from")) document.getElementById("dr-from").value = "";
    if (document.getElementById("dr-to")) document.getElementById("dr-to").value = "";
    renderDowntimeReportTable();
  });
  const drView = document.getElementById("dr-view");
  if (drView) drView.addEventListener("change", renderDowntimeReportTable);
  // quick date buttons
  document.querySelectorAll(".quick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.dataset.range;
      const fromEl = document.getElementById("dr-from");
      const toEl = document.getElementById("dr-to");
      const today = new Date();
      const fmt = localDateStr;
      if (r === "today") { fromEl.value = fmt(today); toEl.value = fmt(today); }
      else if (r === "yesterday") { const y = new Date(today); y.setDate(y.getDate()-1); fromEl.value = fmt(y); toEl.value = fmt(y); }
      else if (r === "month") { const first = new Date(today.getFullYear(), today.getMonth(), 1); fromEl.value = fmt(first); toEl.value = fmt(today); }
      else { const n = parseInt(r,10); const from = new Date(today); from.setDate(from.getDate()-n+1); fromEl.value = fmt(from); toEl.value = fmt(today); }
      renderDowntimeReportTable();
    });
  });
  bindAuto(["dr-search","dr-type","dr-device","dr-from","dr-to"], renderDowntimeReportTable);
  const drBody = document.querySelector("#downtime-report-table tbody");
  if (drBody) drBody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr.dr-row");
    if (!tr) return;
    const g = DR_ROWS[parseInt(tr.dataset.idx, 10)];
    if (g) openDeviceModal(g.device);
  });
  const drIncBody = document.querySelector("#dr-incidents-table tbody");
  if (drIncBody) drIncBody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr.dr-row-link");
    if (tr) openDeviceModal(tr.dataset.device);
  });
  // Date inputs: clicking anywhere in the box opens the calendar
  document.querySelectorAll('input[type="date"]').forEach(inp => {
    const open = () => { try { if (inp.showPicker) inp.showPicker(); } catch (err) {} };
    inp.addEventListener("click", open);
    inp.addEventListener("focus", open);
  });
  const resetLog = document.getElementById("reset-log");
  if (resetLog) resetLog.addEventListener("click", () => {
    ["log-search", "log-event", "log-devtype", "log-device", "log-from", "log-to"].forEach(id => { const e = document.getElementById(id); if (e) e.value = ""; });
    renderActivityTable();
  });
  // Log report: default = last 7 days, quick ranges, auto-apply, export
  (function () {
    const [f7, t7] = quickRangeDates("7");
    const fe = document.getElementById("log-from"), te = document.getElementById("log-to");
    if (fe && !fe.value) fe.value = f7;
    if (te && !te.value) te.value = t7;
    document.querySelectorAll(".log-quick-btn").forEach(btn => btn.addEventListener("click", () => {
      const [f, t] = quickRangeDates(btn.dataset.range);
      fe.value = f; te.value = t;
      renderActivityTable();
    }));
    const showLog = document.getElementById("log-show");
    if (showLog) showLog.addEventListener("click", renderActivityTable);
    const exLog = document.getElementById("log-export");
    if (exLog) exLog.addEventListener("click", exportLogReport);
    bindAuto(["log-search", "log-event", "log-devtype", "log-device", "log-from", "log-to"], renderActivityTable);
  })();
  const resetUser = document.getElementById("reset-user");
  if (resetUser) resetUser.addEventListener("click", () => { document.getElementById("u-search").value=""; document.getElementById("u-role").value=""; document.getElementById("u-month").value=""; renderUsersTable(); });
  const resetPu = document.getElementById("reset-pu");
  if (resetPu) resetPu.addEventListener("click", () => { document.getElementById("pu-search").value=""; document.getElementById("pu-status").value=""; document.getElementById("pu-month").value=""; renderPendingUsersTable(); });
  const resetEmp = document.getElementById("reset-emp");
  if (resetEmp) resetEmp.addEventListener("click", () => { document.getElementById("emp-search").value=""; document.getElementById("emp-role").value=""; document.getElementById("emp-month").value=""; renderEmployeesTable(); });
});



/* Keep sidebar/sticky offsets in sync with the fixed top header height */
(function () {
  const sync = () => {
    const h = document.querySelector("header.top");
    if (h) document.documentElement.style.setProperty("--header-h", h.offsetHeight + "px");
  };
  window.addEventListener("load", sync);
  window.addEventListener("resize", sync);
  document.addEventListener("DOMContentLoaded", () => {
    sync();
    const h = document.querySelector("header.top");
    if (h && window.ResizeObserver) new ResizeObserver(sync).observe(h);
  });
})();
