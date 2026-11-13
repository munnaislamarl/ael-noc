/* AEL-NOC — Login, Request Access, role permissions & User management (client side).
   Needs the Apps Script backend in /apps-script (see apps-script/SETUP.md). */

// Paste your deployed Apps Script Web App URL here (ends with /exec)
const AUTH_API_URL = "https://script.google.com/macros/s/AKfycbyaZXwPLNcx1QeGe7hDJ3O-qJjmoBx09JRaG49-ErQRMP6q7OXEtO7Wcuxkebnce3XW5g/exec";

const AUTH_ROLES = ["Super Admin", "IT Manager", "IT Officer / Engineer", "Employee / IT User", "Management / Viewer"];
const OPS_PAGES = ["dashboard", "devices", "assets", "items", "maintenance", "consumption", "downtime-report", "log-report"];
// null = every page
const ROLE_PAGES = {
  "Super Admin": null,
  "IT Manager": null,
  "IT Officer / Engineer": OPS_PAGES.concat(["settings"]),
  "Employee / IT User": ["dashboard"],
  "Management / Viewer": OPS_PAGES
};
const SESS_KEY = "aelnoc_session";

window.AUTH = (function () {
  let session = null;
  let ADM = { users: [], requests: [], roles: AUTH_ROLES, loaded: false };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  try { session = JSON.parse(localStorage.getItem(SESS_KEY) || "null"); } catch (e) { session = null; }
  function save(s) { session = s; try { s ? localStorage.setItem(SESS_KEY, JSON.stringify(s)) : localStorage.removeItem(SESS_KEY); } catch (e) {} }

  /* ---------- API ---------- */
  async function api(action, data) {
    if (!AUTH_API_URL) throw new Error("Backend not configured: set AUTH_API_URL in auth.js (see apps-script/SETUP.md).");
    const body = Object.assign({ action }, data || {});
    if (session && action !== "login" && action !== "requestAccess") body.token = session.token;
    let res;
    try {
      res = await fetch(AUTH_API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    } catch (e) { throw new Error("Cannot reach the server. Check your connection."); }
    let j;
    try { j = await res.json(); } catch (e) { throw new Error("Unexpected server response."); }
    if (!j.ok) {
      const msg = j.error || "Request failed";
      if (session && /Session (invalid|expired)|no longer exists|Account disabled/i.test(msg)) { signOut(msg); }
      throw new Error(msg);
    }
    return j;
  }

  /* ---------- permissions ---------- */
  const role = () => (session && session.user && session.user.role) || "";
  const isAdmin = () => role() === "Super Admin";
  const canApprove = () => role() === "Super Admin" || role() === "IT Manager";
  function can(page) {
    if (!session) return false;
    const p = ROLE_PAGES[role()];
    if (p === null) return true;
    return (p || ["dashboard"]).indexOf(page) >= 0;
  }
  function applyRole() {
    document.querySelectorAll(".nav-item[data-page], .nav-subitem[data-page]").forEach(b => { b.hidden = !can(b.dataset.page); });
    document.querySelectorAll(".nav-group").forEach(g => {
      const subs = g.querySelectorAll(".nav-subitem");
      if (subs.length) g.hidden = ![...subs].some(b => !b.hidden);
    });
    document.body.classList.toggle("ro", role() === "Management / Viewer");
    const chip = $("user-chip");
    if (chip) {
      if (session) { chip.hidden = false; chip.innerHTML = "<b>" + esc(session.user.fullName || session.user.username) + "</b><span>" + esc(role()) + "</span>"; }
      else chip.hidden = true;
    }
    const nb = $("um-new"); if (nb) nb.hidden = !isAdmin();
  }

  /* ---------- login overlay views ---------- */
  function view(name) {
    document.querySelectorAll("#login-overlay [data-view]").forEach(el => { el.hidden = el.dataset.view !== name; });
    const sub = $("login-sub");
    if (sub) sub.hidden = name === "done";
    ["login-error", "rq-error", "cp-error"].forEach(id => { const e = $(id); if (e) e.textContent = ""; });
  }
  function showOverlay(v, msg) {
    $("login-overlay").classList.remove("hidden");
    view(v || "signin");
    if (msg && (v || "signin") === "signin") $("login-error").textContent = msg;
  }
  function hideOverlay() { $("login-overlay").classList.add("hidden"); }
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = on ? "Please wait…" : label; }

  function signOut(msg) {
    save(null);
    ADM = { users: [], requests: [], roles: AUTH_ROLES, loaded: false };
    applyRole();
    closeModal();
    const f = $("login-form"); if (f) f.reset();
    showOverlay("signin", msg);
  }

  function enter() {
    hideOverlay();
    applyRole();
    if (typeof loadData === "function") loadData();
    const cur = (function () { try { return localStorage.getItem("activePage"); } catch (e) { return null; } })() || "dashboard";
    showPage(can(cur) ? cur : "dashboard");
    // refresh role from server, then admin data
    api("me").then(r => { session.user = r.user; save(session); applyRole(); if (canApprove()) loadAdmin(); }).catch(() => {});
  }

  /* ---------- forms ---------- */
  function bindForms() {
    $("go-request").addEventListener("click", e => { e.preventDefault(); view("request"); });
    $("go-signin").addEventListener("click", e => { e.preventDefault(); view("signin"); });
    $("done-back").addEventListener("click", () => view("signin"));

    const sel = $("rq-role");
    AUTH_ROLES.filter(r => r !== "Super Admin").forEach(r => { const o = document.createElement("option"); o.value = r; o.textContent = r; if (r === "Employee / IT User") o.selected = true; sel.appendChild(o); });

    $("login-form").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = $("login-btn"), err = $("login-error"); err.textContent = "";
      busy(btn, true, "Sign in");
      try {
        const r = await api("login", { id: $("login-user").value.trim(), password: $("login-pass").value });
        save({ token: r.token, user: r.user, mustChange: !!r.mustChange });
        $("login-pass").value = "";
        if (r.mustChange) { $("cp-old").value = ""; view("chpw"); } else enter();
      } catch (ex) { err.textContent = ex.message; }
      busy(btn, false, "Sign in");
    });

    $("request-form").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = $("rq-btn"), err = $("rq-error"); err.textContent = "";
      const p1 = $("rq-pass").value, p2 = $("rq-pass2").value;
      if (p1 !== p2) { err.textContent = "Passwords do not match."; return; }
      busy(btn, true, "Send request");
      try {
        await api("requestAccess", {
          fullName: $("rq-name").value, username: $("rq-user").value, email: $("rq-email").value, phone: $("rq-phone").value,
          employeeId: $("rq-empid").value, designation: $("rq-desig").value, department: $("rq-dept").value, location: $("rq-loc").value,
          wantsRole: $("rq-role").value, reason: $("rq-reason").value, password: p1
        });
        $("request-form").reset(); $("rq-role").value = "Employee / IT User";
        view("done");
      } catch (ex) { err.textContent = ex.message; }
      busy(btn, false, "Send request");
    });

    $("chpw-form").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = $("cp-btn"), err = $("cp-error"); err.textContent = "";
      if ($("cp-new").value !== $("cp-new2").value) { err.textContent = "Passwords do not match."; return; }
      busy(btn, true, "Save password");
      try {
        await api("changePassword", { oldPassword: $("cp-old").value, newPassword: $("cp-new").value });
        session.mustChange = false; save(session);
        $("chpw-form").reset(); enter();
      } catch (ex) { err.textContent = ex.message; }
      busy(btn, false, "Save password");
    });

    $("signout-btn").addEventListener("click", () => signOut());
  }

  /* ---------- modal helpers ---------- */
  function closeModal() { const o = document.getElementById("am-overlay"); if (o) o.remove(); }
  function modal(html) {
    closeModal();
    const ov = document.createElement("div");
    ov.id = "am-overlay"; ov.className = "am-overlay";
    ov.innerHTML = '<div class="am-modal" role="dialog" aria-modal="true">' + html + "</div>";
    ov.addEventListener("mousedown", e => { if (e.target === ov) closeModal(); });
    document.body.appendChild(ov);
    const c = ov.querySelector("[data-close]"); if (c) c.addEventListener("click", closeModal);
    return ov;
  }
  function tempPwModal(title, user, pw) {
    const ov = modal('<h3>' + esc(title) + '</h3><p class="am-sub">Give this temporary password to <b>' + esc(user) + '</b>. It is shown <b>only once</b>; they must change it at first sign-in.</p>' +
      '<div class="am-pw"><code id="am-pw-val">' + esc(pw) + '</code><button type="button" id="am-copy">Copy</button></div>' +
      '<div class="am-foot"><button class="primary" data-close>Done</button></div>');
    ov.querySelector("#am-copy").addEventListener("click", () => { try { navigator.clipboard.writeText(pw); ov.querySelector("#am-copy").textContent = "Copied"; } catch (e) {} });
  }

  /* ---------- admin data ---------- */
  async function loadAdmin() {
    if (!canApprove()) return;
    try {
      const r = await api("listUsers");
      ADM = { users: r.users || [], requests: r.requests || [], roles: r.roles || AUTH_ROLES, loaded: true };
      fillRoleFilter(); renderUsers(); renderRequests(); updatePendingBadges();
    } catch (ex) {
      ["um-msg", "pr-msg"].forEach(id => { const m = $(id); if (m) m.textContent = ex.message; });
    }
  }
  function fillRoleFilter() {
    const s = $("um-role"); if (!s || s.options.length > 1) return;
    ADM.roles.forEach(r => { const o = document.createElement("option"); o.value = r; o.textContent = r; s.appendChild(o); });
  }
  function pendingCount() { return ADM.requests.filter(r => String(r.status).toLowerCase() === "pending").length; }
  function updatePendingBadges() {
    const n = pendingCount();
    ["nav-pending-badge", "um-pending-count"].forEach(id => { const b = $(id); if (b) { b.textContent = n; b.hidden = !n; } });
  }

  /* ---------- user table ---------- */
  const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  function statusBadge(a) {
    const l = String(a || "active").toLowerCase();
    const c = l === "active" ? "ok" : (l === "disabled" ? "down" : "warn");
    return '<span class="badge ' + c + '">' + esc(a || "active") + "</span>";
  }
  function renderUsers() {
    const tb = document.querySelector("#um-table tbody"); if (!tb) return;
    const q = ($("um-search").value || "").toLowerCase(), rl = $("um-role").value, st = $("um-status").value.toLowerCase();
    const list = ADM.users.filter(u => {
      if (q && !(u.fullName + " " + u.username + " " + u.email).toLowerCase().includes(q)) return false;
      if (rl && u.role !== rl) return false;
      if (st && String(u.account || "active").toLowerCase() !== st) return false;
      return true;
    });
    const me = session && session.user.username.toLowerCase();
    tb.innerHTML = list.map((u, i) => {
      const self = u.username.toLowerCase() === me;
      const acts = isAdmin() ? '<button class="um-act" data-act="edit" data-u="' + esc(u.username) + '">✎ Edit</button>' +
        '<button class="um-act" data-act="reset" data-u="' + esc(u.username) + '">🔑 Reset</button>' +
        (self ? "" : '<button class="um-act um-del" data-act="del" data-u="' + esc(u.username) + '">🗑 Delete</button>') : "—";
      return "<tr><td>" + (i + 1) + '</td><td><div class="um-user"><span class="um-av">' + esc(initials(u.fullName)) + '</span><div><div class="um-name">' + esc(u.fullName) + (self ? " <i>(you)</i>" : "") +
        '</div><div class="um-un">@' + esc(u.username) + "</div></div></div></td><td>" + esc(u.email) + "</td><td>" + esc(u.role) + "</td><td>" + statusBadge(u.account) +
        "</td><td>" + esc(u.created) + '</td><td class="um-acts">' + acts + "</td></tr>";
    }).join("") || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:14px">' + (ADM.loaded ? "No users match." : "Loading…") + "</td></tr>";
    $("um-count").textContent = list.length + " user" + (list.length === 1 ? "" : "s");
  }

  function userForm(u) {
    const edit = !!u; u = u || {};
    const roles = ADM.roles.map(r => '<option' + (r === (u.role || "Employee / IT User") ? " selected" : "") + ">" + esc(r) + "</option>").join("");
    const accts = ["active", "must change password", "disabled"].map(a => '<option' + (a === String(u.account || "active").toLowerCase() ? " selected" : "") + ">" + a + "</option>").join("");
    const ov = modal('<h3>' + (edit ? "Edit user" : "New user") + '</h3><form id="am-form"><div class="am-grid">' +
      '<label>Full name * <input name="fullName" required value="' + esc(u.fullName) + '"></label>' +
      '<label>Username * <input name="username" required pattern="[A-Za-z0-9._\\-]{3,32}" value="' + esc(u.username) + '"' + (edit ? " readonly" : "") + "></label>" +
      '<label>Email * <input name="email" type="email" required value="' + esc(u.email) + '"></label>' +
      '<label>Phone <input name="phone" value="' + esc(u.phone) + '"></label>' +
      '<label>Employee ID <input name="employeeId" value="' + esc(u.employeeId) + '"></label>' +
      '<label>Designation <input name="designation" value="' + esc(u.designation) + '"></label>' +
      '<label>Department <input name="department" value="' + esc(u.department) + '"></label>' +
      '<label>Location / Plant <input name="location" value="' + esc(u.location) + '"></label>' +
      '<label>Role <select name="role">' + roles + "</select></label>" +
      (edit ? '<label>Status <select name="account">' + accts + "</select></label>" : "") +
      "</div>" + (edit ? "" : '<p class="am-sub">A temporary password is generated; the user must change it at first sign-in.</p>') +
      '<p class="login-error" id="am-err"></p><div class="am-foot"><button type="button" data-close>Cancel</button><button type="submit" class="primary" id="am-save">' + (edit ? "Save changes" : "Create user") + "</button></div></form>");
    ov.querySelector("#am-form").addEventListener("submit", async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      const btn = $("am-save"); btn.disabled = true; $("am-err").textContent = "";
      try {
        const r = await api(edit ? "updateUser" : "createUser", d);
        closeModal(); await loadAdmin();
        if (!edit && r.tempPassword) tempPwModal("User created", d.username, r.tempPassword);
      } catch (ex) { $("am-err").textContent = ex.message; btn.disabled = false; }
    });
  }

  async function userAction(act, username) {
    const u = ADM.users.find(x => x.username === username); if (!u) return;
    if (act === "edit") return userForm(u);
    try {
      if (act === "reset") {
        if (!confirm("Reset password for @" + username + "? They must set a new one at next sign-in.")) return;
        const r = await api("resetPassword", { username }); await loadAdmin(); tempPwModal("Password reset", username, r.tempPassword);
      } else if (act === "del") {
        if (!confirm("Delete user @" + username + " (" + u.fullName + ")? This cannot be undone.")) return;
        await api("deleteUser", { username }); await loadAdmin();
      }
    } catch (ex) { alert(ex.message); }
  }

  /* ---------- pending requests ---------- */
  function renderRequests() {
    const tb = document.querySelector("#pr-table tbody"); if (!tb) return;
    const q = ($("pr-search").value || "").toLowerCase(), st = $("pr-status").value.toLowerCase();
    const list = ADM.requests.filter(r => {
      if (q && !(r.fullName + " " + r.username + " " + r.email).toLowerCase().includes(q)) return false;
      if (st && String(r.status).toLowerCase() !== st) return false;
      return true;
    }).reverse();
    tb.innerHTML = list.map(r => {
      const s = String(r.status).toLowerCase();
      const cls = s === "approved" ? "ok" : (s === "rejected" ? "down" : "warn");
      const acts = s === "pending" && canApprove() ? '<button class="um-act um-ok" data-act="approve" data-id="' + esc(r.id) + '">✔ Approve</button><button class="um-act um-del" data-act="reject" data-id="' + esc(r.id) + '">✖ Reject</button>' : "—";
      return "<tr><td>" + esc(r.requested) + "</td><td>" + esc(r.fullName) + "</td><td>@" + esc(r.username) + "</td><td>" + esc(r.email) + "</td><td>" + esc(r.phone) + "</td><td>" + esc(r.department) +
        "</td><td>" + esc(r.designation) + "</td><td>" + esc(r.employeeId) + "</td><td>" + esc(r.location) + "</td><td>" + esc(r.wantsRole) + "</td><td>" + esc(r.reason) +
        '</td><td><span class="badge ' + cls + '">' + esc(r.status) + '</span></td><td class="um-acts">' + acts + "</td></tr>";
    }).join("") || '<tr><td colspan="13" style="text-align:center;color:var(--muted);padding:14px">' + (ADM.loaded ? "No requests." : "Loading…") + "</td></tr>";
    $("pr-count").textContent = list.length + " request" + (list.length === 1 ? "" : "s");
  }

  async function requestAction(act, id) {
    const r = ADM.requests.find(x => x.id === id); if (!r) return;
    if (act === "reject") {
      if (!confirm("Reject the request from " + r.fullName + "?")) return;
      try { await api("rejectRequest", { id }); await loadAdmin(); } catch (ex) { alert(ex.message); }
      return;
    }
    const roles = ADM.roles.filter(x => x !== "Super Admin" || isAdmin()).map(x => '<option' + (x === r.wantsRole ? " selected" : "") + ">" + esc(x) + "</option>").join("");
    const ov = modal('<h3>Approve access</h3><p class="am-sub"><b>' + esc(r.fullName) + "</b> (@" + esc(r.username) + ", " + esc(r.email) + ")<br>" + (r.reason ? "Reason: " + esc(r.reason) : "") + "</p>" +
      '<label class="am-one">Assign role <select id="am-role">' + roles + '</select></label><p class="login-error" id="am-err"></p>' +
      '<div class="am-foot"><button type="button" data-close>Cancel</button><button class="primary" id="am-ok">Approve &amp; activate</button></div>');
    ov.querySelector("#am-ok").addEventListener("click", async () => {
      const b = $("am-ok"); b.disabled = true;
      try { await api("approveRequest", { id, role: $("am-role").value }); closeModal(); await loadAdmin(); }
      catch (ex) { $("am-err").textContent = ex.message; b.disabled = false; }
    });
  }

  /* ---------- wiring ---------- */
  function bindAdminUI() {
    ["um-search", "um-role", "um-status"].forEach(id => $(id).addEventListener(id === "um-search" ? "input" : "change", renderUsers));
    ["pr-search", "pr-status"].forEach(id => $(id).addEventListener(id === "pr-search" ? "input" : "change", renderRequests));
    $("reset-um").addEventListener("click", () => { $("um-search").value = ""; $("um-role").value = ""; $("um-status").value = ""; renderUsers(); });
    $("reset-pr").addEventListener("click", () => { $("pr-search").value = ""; $("pr-status").value = "pending"; renderRequests(); });
    $("um-new").addEventListener("click", () => userForm(null));
    $("um-pending").addEventListener("click", () => showPage("pending-users"));
    $("um-table").addEventListener("click", e => { const b = e.target.closest("[data-act]"); if (b) userAction(b.dataset.act, b.dataset.u); });
    $("pr-table").addEventListener("click", e => { const b = e.target.closest("[data-act]"); if (b) requestAction(b.dataset.act, b.dataset.id); });
    $("refresh-btn").addEventListener("click", () => { if (session) loadAdmin(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  }

  // guard navigation by role
  const baseShowPage = window.showPage;
  window.showPage = function (page) {
    if (session && !can(page)) page = "dashboard";
    baseShowPage(page);
    if ((page === "user-list" || page === "pending-users") && session && canApprove()) loadAdmin();
  };

  function init() {
    bindForms(); bindAdminUI();
    if (session && session.token) {
      if (session.mustChange) { applyRole(); showOverlay("chpw"); }
      else { hideOverlay(); applyRole(); const cur = (function () { try { return localStorage.getItem("activePage"); } catch (e) { return null; } })() || "dashboard"; if (!can(cur)) showPage("dashboard"); api("me").then(r => { session.user = r.user; save(session); applyRole(); if (canApprove()) loadAdmin(); }).catch(() => {}); }
    } else showOverlay("signin");
  }
  document.addEventListener("DOMContentLoaded", init);

  return { hasSession: () => !!(session && session.token && !session.mustChange), can, signOut };
})();
