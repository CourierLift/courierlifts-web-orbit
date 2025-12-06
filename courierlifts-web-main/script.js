// ===== Courier Lifts — Phase 3 MVP (Polish + Orders List) =====
// Uses your running backend at window.BACKEND_URL or http://localhost:8000
// Endpoints:
//  - POST /auth/register   (optional)
//  - POST /auth/login
//  - POST /quote/estimate
//  - POST /orders/create_compat   (address-based create)
//  - GET  /orders/mine
//  - GET  /rewards/balance, POST /rewards/event

// ---------- Config ----------
const host = typeof window !== "undefined" ? window.location.hostname : "";
const isProd = /courierlifts\.com$|netlify\.app$/.test(host);

// In prod → use Netlify proxy at /api
// In dev → fall back to local FastAPI
const BACKEND = (window.BACKEND_URL || (isProd ? "/api" : "http://localhost:8000"))
  .replace(/\/$/, "");

// ---------- Tiny DOM helpers ----------
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));
const val = (sel) => (qs(sel) ? qs(sel).value.trim() : "");
const setText = (sel, text) => { const el = qs(sel); if (el) el.textContent = text; };
const setHTML = (sel, html) => { const el = qs(sel); if (el) el.innerHTML = html; };
const show = (sel, on = true) => { const el = qs(sel); if (el) el.style.display = on ? "" : "none"; };
const disable = (el, on = true) => { if (el) el.disabled = !!on; };

// Create-or-get utility so we can inject UI bits if they’re missing
function ensureEl({ id, tag = "div", parent = document.body, className = "" }) {
  let el = qs(`#${id}`);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    if (className) el.className = className;
    parent.appendChild(el);
  }
  return el;
}

// ---------- Toasts (lightweight) ----------
function toast(msg, type = "info", ms = 2500) {
  const box = ensureEl({ id: "toast", className: "cl-toast" });
  box.textContent = msg;
  box.dataset.type = type;
  box.style.opacity = "1";
  clearTimeout(box._t);
  box._t = setTimeout(() => (box.style.opacity = "0"), ms);
}

// If you want some minimal styling without touching CSS:
(function injectToastStyle() {
  if (qs("#cl-toast-style")) return;
  const css = `
    .cl-toast{
      position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
      background:#111; color:#fff; padding:10px 14px; border-radius:10px;
      box-shadow:0 6px 24px rgba(0,0,0,.25); z-index:9999; transition:opacity .25s;
      max-width:90%; font-size:.95rem; letter-spacing:.2px;
    }
    .cl-toast[data-type="error"]{ background:#b91c1c; } /* red-700 */
    .cl-toast[data-type="success"]{ background:#065f46; } /* teal-800 */
    .cl-badge{
      display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px;
      background:#000; color:#fff; font-size:.85rem; box-shadow:0 2px 12px rgba(0,0,0,.15);
    }
  `;
  const style = document.createElement("style");
  style.id = "cl-toast-style";
  style.textContent = css;
  document.head.appendChild(style);
})();

// ---------- Auth ----------
function saveToken(token) { localStorage.setItem("cl_token", token); }
function getToken() { return localStorage.getItem("cl_token"); }
function clearToken() { localStorage.removeItem("cl_token"); }
function authHeader() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function setLoggedInUI(email) {
  // Badge (create if missing)
  const top = ensureEl({ id: "loginStatus", className: "cl-badge", parent: document.body });
  top.style.position = "fixed";
  top.style.right = "16px";
  top.style.top = "16px";
  top.innerHTML = email ? `🔒 Logged in as <b>${email}</b>` : "🔓 Not logged in";
  // Buttons that should be guarded
  const orderBtn = qs("#createOrderBtn");
  disable(orderBtn, !email); // disabled until logged in
}

async function register(email, password) {
  const res = await fetch(`${BACKEND}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role: "customer" })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Register failed");
  return data;
}

async function login(email, password) {
  const res = await fetch(`${BACKEND}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Login failed");
  saveToken(data.access_token);
  setLoggedInUI(email);
  toast("Logged in", "success");
  return data;
}

// ---------- Quote (address-based) ----------
async function getQuoteEstimate() {
  const pickup = val("#pickup") || val("#origin");
  const dropoff = val("#dropoff") || val("#destination");
  const vehicle = (val("#vehicle") || "car").toLowerCase();
  const itemType = (val("#item_type") || "standard").toLowerCase();
  const weightKg = Number(val("#weight") || val("#weight_kg") || 0);

  if (!pickup || !dropoff) { toast("Enter pickup & dropoff", "error"); setText("#priceOut", ""); return; }

  const payload = { origin: pickup, destination: dropoff, vehicle, item_type: itemType, weight_kg: weightKg };
  const res = await fetch(`${BACKEND}/quote/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Quote failed");

  setText("#priceOut", `$${Number(data.price_total).toFixed(2)} (ETA ${data.eta_min} min)`);
  return data;
}

// ---------- Create order (address-based) ----------
async function createOrderCompat() {
  const pickup = val("#pickup") || val("#origin");
  const dropoff = val("#dropoff") || val("#destination");
  const vehicle = (val("#vehicle") || "car").toLowerCase();
  const itemType = (val("#item_type") || "standard").toLowerCase();
  const weightKg = Number(val("#weight") || val("#weight_kg") || 0);
  const qty = Number(val("#quantity") || 1);
  const L = Number(val("#length_in") || 12);
  const W = Number(val("#width_in") || 8);
  const H = Number(val("#height_in") || 6);

  if (!pickup || !dropoff) { toast("Enter pickup & dropoff", "error"); setText("#orderOut", ""); return; }
  if (!getToken()) { toast("Please log in first", "error"); setText("#orderOut", ""); return; }

  const payload = { origin: pickup, destination: dropoff, vehicle, item_type: itemType, weight_kg: weightKg, quantity: qty, length_in: L, width_in: W, height_in: H };
  const res = await fetch(`${BACKEND}/orders/create_compat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Order create failed");

  setHTML("#orderOut", `Order #${data.id} — <b>${data.status}</b> — $${Number(data.price).toFixed(2)} — ETA ${data.eta_min} min`);
  toast("Order created", "success");
  return data;
}

// ---------- Rewards ----------
async function getRewardsBalance() {
  if (!getToken()) { setText("#rewardsOut", "Login to view rewards"); return 0; }
  const res = await fetch(`${BACKEND}/rewards/balance`, { headers: { ...authHeader() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Rewards balance failed");
  setText("#rewardsOut", `${data} pts`);
  return data;
}

async function earnPoints(points = 25, reason = "first_order") {
  if (!getToken()) { setText("#rewardsOut", "Login first"); return; }
  const res = await fetch(`${BACKEND}/rewards/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ type: "earn", points, reason })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Rewards earn failed");
  await getRewardsBalance();
  return data;
}

// ---------- Orders list ----------
async function getMyOrders() {
  if (!getToken()) { toast("Login to see your orders", "error"); return []; }
  const res = await fetch(`${BACKEND}/orders/mine`, { headers: { ...authHeader() } });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error((data && data.detail) || "Orders fetch failed");
  renderOrders(data);
  return data;
}

function renderOrders(items = []) {
  const host = ensureEl({ id: "ordersOut" });
  if (!items.length) { host.innerHTML = "<em>No orders yet.</em>"; return; }
  const cards = items.map(o => `
    <div class="order-card" style="border:1px solid #eee;border-radius:12px;padding:12px 14px;margin:8px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>#${o.id}</strong>
        <span style="padding:4px 10px;border-radius:999px;background:#111;color:#fff;font-size:.8rem;">${o.status}</span>
      </div>
      <div style="margin-top:6px;font-size:.95rem;opacity:.9;">
        $${Number(o.price).toFixed(2)} • ETA ${o.eta_min} min • ${o.vehicle} • ${o.item_type}
      </div>
      ${o.origin && o.destination ? `<div style="margin-top:6px; font-size:.9rem;">
        <b>From:</b> ${o.origin}<br/><b>To:</b> ${o.destination}
      </div>` : ""}
    </div>
  `).join("");
  host.innerHTML = cards;
}


// ---------- Pilot sign-up ----------
async function submitPilotSignup(email, role) {
  const res = await fetch("/.netlify/functions/pilot-signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Pilot signup failed");
  }
  return data;
}

function initPilotForm() {
  const form = qs("#pilotForm");
  const statusEl = qs("#formStatus");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = val("#pilotEmail");
    const role = val("#pilotRole");

    if (!email || !role) {
      if (statusEl) statusEl.textContent = "Please fill out all fields.";
      toast("Please fill out all pilot fields", "error");
      return;
    }

    if (statusEl) {
      statusEl.textContent = "Submitting...";
    }

    try {
      await submitPilotSignup(email, role);
      if (statusEl) statusEl.textContent = "You're in! We'll be in touch soon.";
      toast("Pilot signup received!", "success");
      form.reset();
    } catch (err) {
      if (statusEl) statusEl.textContent = "Something went wrong. Please try again.";
      toast(err.message || "Pilot signup error", "error");
    }
  });
}


// ---------- Wire up (only if elements exist) ----------
window.addEventListener("DOMContentLoaded", () => {
  // Initialize pilot signup form
  initPilotForm();
  // Guarded button state on first paint
  setLoggedInUI(getToken() ? "saved session" : "");

  const loginBtn = qs("#loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const email = val("#loginEmail");
        const pwd = val("#loginPassword");
        await login(email, pwd);
        setText("#loginMsg", "Logged in!");
        await getRewardsBalance();
      } catch (err) {
        setText("#loginMsg", err.message || "Login error");
        toast(err.message || "Login error", "error");
      }
    });
  }

  const quoteBtn = qs("#quoteBtn");
  if (quoteBtn) {
    quoteBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        setText("#priceOut", "Calculating…");
        await getQuoteEstimate();
      } catch (err) {
        setText("#priceOut", "Quote error");
        toast(err.message || "Quote error", "error");
      }
    });
  }

  const orderBtn = qs("#createOrderBtn");
  if (orderBtn) {
    // disabled if not logged in (also handled by setLoggedInUI)
    disable(orderBtn, !getToken());
    orderBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        setText("#orderOut", "Creating…");
        const order = await createOrderCompat();
        if (order) await earnPoints(25, "order_created");
      } catch (err) {
        setText("#orderOut", "Order error");
        toast(err.message || "Order error", "error");
      }
    });
  }

  const rewardsBtn = qs("#rewardsRefreshBtn");
  if (rewardsBtn) {
    rewardsBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await getRewardsBalance(); } catch { setText("#rewardsOut", "Error"); }
    });
  }

  const myOrdersBtn = qs("#myOrdersBtn");
  if (myOrdersBtn) {
    myOrdersBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await getMyOrders(); } catch (err) { toast(err.message || "Orders error", "error"); }
    });
  }

  // On load, if token exists show balance automatically
  if (getToken()) {
    getRewardsBalance().catch(() => {});
  }
});

