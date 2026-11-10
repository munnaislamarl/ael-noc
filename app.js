/* Factory Network Monitor Dashboard */
const CSV_URL = "https://docs.google.com/spreadsheets/d/1IE8NU185d9s1s18GriMDA1bAiGOjJpT4XIu0oUC-S4E/export?format=csv&gid=1477935364";

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

function buildData(rows) {
  const get = (section, metric) => {
    const r = rows.find(x => x.length >= 3 && x[0] === section && x[1] === metric);
    return r ? r[2] : null;
  };
  const d = {
    generated: get("", "Generated") || SNAPSHOT.generated,
    devices: {
      total: toNum(get("Devices", "Total devices")) || SNAPSHOT.devices.total,
      up: toNum(get("Devices", "Up")) || SNAPSHOT.devices.up,
      down: toNum(get("Devices", "Down")) || SNAPSHOT.devices.down,
      unknown: toNum(get("Devices", "Unknown / not checked")) || SNAPSHOT.devices.unknown
    },
    downtimeMonth: {
      period: get("Downtime (running month)", "Period") || SNAPSHOT.downtimeMonth.period,
      incidents: toNum(get("Downtime (running month)", "Incidents")) || SNAPSHOT.downtimeMonth.incidents,
      devicesAffected: toNum(get("Downtime (running month)", "Devices affected")) || SNAPSHOT.downtimeMonth.devicesAffected,
      hours: toNum(get("Downtime (running month)", "Total downtime (hours)")) || SNAPSHOT.downtimeMonth.hours,
      minutes: toNum(get("Downtime (running month)", "Total downtime (min)")) || SNAPSHOT.downtimeMonth.minutes
    },
    downtimeAll: {
      incidents: toNum(get("Downtime (all history)", "Incidents")) || SNAPSHOT.downtimeAll.incidents,
      hours: toNum(get("Downtime (all history)", "Total downtime (hours)")) || SNAPSHOT.downtimeAll.hours,
      minutes: toNum(get("Downtime (all history)", "Total downtime (min)")) || SNAPSHOT.downtimeAll.minutes
    },
    itAssets: {
      total: toNum(get("IT Assets", "Total assets")) || SNAPSHOT.itAssets.total,
      available: toNum(get("IT Assets", "Status: Available")) || SNAPSHOT.itAssets.available
    },
    items: {
      total: toNum(get("Item List", "Total items")) || SNAPSHOT.items.total,
      sumRates: toNum(get("Item List", "Sum of rates (BDT)")) || SNAPSHOT.items.sumRates
    },
    itMaintenance: { total: toNum(get("IT Maintenance", "Total records")) || SNAPSHOT.itMaintenance.total },
    itConsumption: {
      total: toNum(get("IT Consumption", "Total records")) || SNAPSHOT.itConsumption.total,
      totalCost: toNum(get("IT Consumption", "Total cost (BDT)")) || SNAPSHOT.itConsumption.totalCost
    },
    users: { total: toNum(get("Users", "Total users")) || SNAPSHOT.users.total },
    accessRequests: {
      total: toNum(get("Access Requests", "Total")) || SNAPSHOT.accessRequests.total,
      pending: toNum(get("Access Requests", "Pending")) || SNAPSHOT.accessRequests.pending,
      approved: toNum(get("Access Requests", "Approved")) || SNAPSHOT.accessRequests.approved,
      rejected: toNum(get("Access Requests", "Rejected")) || SNAPSHOT.accessRequests.rejected
    },
    activity: { total: toNum(get("Activity Log", "Total events (stored)")) || SNAPSHOT.activity.total }
  };
  // generated time: try the Generated row (section empty)
  const genRow = rows.find(x => x.length >= 3 && x[1] === "Generated");
  if (genRow) d.generated = genRow[2];
  return d;
}

let DATA = SNAPSHOT;
let charts = {};

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
  // Device status doughnut
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

  // Access requests doughnut
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

  // Downtime comparison bar
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

  // IT overview bar
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
  const badge = document.getElementById("status-badge");
  badge.textContent = "Live data";
  badge.className = "badge ok";
}

async function loadData() {
  const status = document.getElementById("load-status");
  try {
    status.textContent = "Refreshing from Google Sheets…";
    status.className = "loading";
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    const d = buildData(rows);
    renderAll(d);
    status.textContent = "Updated " + new Date().toLocaleTimeString();
    status.className = "";
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
});
