// ============================================================
//  NOIR LUTs — app logic
//  One data-layer interface, two implementations:
//   • LIVE  — Firebase (Auth + Firestore, realtime onSnapshot)
//   • DEMO  — localStorage in-browser layer with the same API
//  Demo mode is used until a real Firebase config is pasted
//  into config.js (window.NOIR_CONFIG.firebase.apiKey).
// ============================================================
const CFG = window.NOIR_CONFIG || { brandName: "NOIR", firebase: {} };
const LIVE = !!(CFG.firebase && CFG.firebase.apiKey);
const $view = document.getElementById("view");
const $modal = document.getElementById("modalRoot");

document.getElementById("brandName").textContent = CFG.brandName;
document.getElementById("brandNameFooter").textContent = CFG.brandName;
document.title = `${CFG.brandName} LUTs — Cinematic Color Grading Presets`;
if (!LIVE) document.getElementById("demoBadge").classList.remove("hidden");

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + (Number(n) % 1 === 0 ? Number(n).toFixed(0) : Number(n).toFixed(2));
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
const fmtTime = (ts) => ts ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const shortId = (id) => (id || "").slice(0, 8) + "…";
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.add("hidden"), 2600);
}
function mediaHTML(p, cls) {
  if (p.videoUrl) return `<video class="${cls}" src="${esc(p.videoUrl)}" poster="${esc(p.imageUrl || "")}" autoplay muted loop playsinline></video>`;
  if (p.imageUrl) return `<img class="${cls}" src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy">`;
  return `<div class="${cls}" style="background:linear-gradient(135deg,#2a1a05,#0d0d0d)"></div>`;
}

// ============================================================
//  PLACEHOLDER PRODUCTS (seed data — live mode: written to
//  Firestore by the admin Seed button; demo mode: the demo DB)
// ============================================================
const PLACEHOLDER_PRODUCTS = [
  {
    name: "CINEMATIC WARMTH PACK", tagline: "Warm golden-hour grades for sunny, aesthetic footage",
    description: "Our signature warm pack. Golden skin tones, soft highlights and rich amber shadows — built for beach days, golden hour and clean outdoor footage.\n\nWorks in Blackmagic Camera, LumaRAW, Premiere, DaVinci Resolve and any app that takes .cube LUTs.",
    includes: ["12 warm cinematic .cube LUTs (33-point)", "Rec.709 versions — no Log needed", "Best-settings cheat sheet (ISO / shutter / WB per LUT)", "Free updates for this pack"],
    price: 29, imageUrl: "https://picsum.photos/seed/noirwarm/1200/800",
    videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    isActive: true, sortOrder: 1
  },
  {
    name: "TEAL & ORANGE BLOCKBUSTER PACK", tagline: "The Hollywood look — teal shadows, glowing skin",
    description: "The classic blockbuster grade. Deep teal shadows with warm, protected skin tones for instant subject separation.\n\nIncludes strong and subtle strengths so it works on everything from sports to portraits.",
    includes: ["10 teal & orange .cube LUTs", "Subtle + strong versions of each look", "Rec.709 and Apple Log variants", "Install guide for phone + desktop"],
    price: 39, imageUrl: "https://picsum.photos/seed/noirteal/1200/800",
    videoUrl: "",
    isActive: true, sortOrder: 2
  },
  {
    name: "MOODY FILM PACK", tagline: "Faded blacks, soft contrast, real film character",
    description: "Muted, moody film emulation — lifted blacks, gentle rolloff and desaturated greens for a quiet cinematic feel.\n\nPerfect for overcast days, city footage and night scenes.",
    includes: ["9 moody film .cube LUTs", "Faded + night variants", "Rec.709 versions — no Log needed", "Best-settings cheat sheet"],
    price: 24, imageUrl: "https://picsum.photos/seed/noirmood/1200/800",
    videoUrl: "",
    isActive: true, sortOrder: 3
  }
];

// ============================================================
//  DEMO DATA LAYER (localStorage)
// ============================================================
const DemoDB = {
  KEY: "noirluts_demo_db_v1",
  listeners: new Set(),
  load() {
    try { const raw = localStorage.getItem(this.KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    const db = {
      products: PLACEHOLDER_PRODUCTS.map((p, i) => ({ ...p, id: "demo-prod-" + (i + 1) })),
      orders: [], chats: [], messages: {}, counter: 1023
    };
    localStorage.setItem(this.KEY, JSON.stringify(db));
    return db;
  },
  save(db) { localStorage.setItem(this.KEY, JSON.stringify(db)); this.emit(); },
  emit() { this.listeners.forEach((fn) => { try { fn(); } catch (e) {} }); },
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
};
window.addEventListener("storage", (e) => { if (e.key === DemoDB.KEY) DemoDB.emit(); });

function demoCustomerId() {
  let id = localStorage.getItem("noirluts_customer");
  if (!id) { id = "cust-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("noirluts_customer", id); }
  return id;
}

// ============================================================
//  STORE — unified API used by all views
// ============================================================
const Store = {
  mode: LIVE ? "live" : "demo",
  uid: null,
  isAdmin: false,
  _fb: null, // firebase handles when live

  async init() {
    if (LIVE) { await this._initLive(); }
    else { this.uid = demoCustomerId(); }
  },

  // ---------- LIVE (Firebase) ----------
  async _initLive() {
    const v = "10.12.5";
    const [appM, authM, fsM] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${v}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`)
    ]);
    const app = appM.initializeApp(CFG.firebase);
    const auth = authM.getAuth(app);
    const db = fsM.getFirestore(app);
    this._fb = { authM, fsM, auth, db };
    await new Promise((resolve) => {
      authM.onAuthStateChanged(auth, async (user) => {
        if (!user) { await authM.signInAnonymously(auth); return; }
        this.uid = user.uid;
        if (!user.isAnonymous) {
          try {
            const snap = await fsM.getDoc(fsM.doc(db, "admins", user.uid));
            this.isAdmin = snap.exists();
          } catch (e) { this.isAdmin = false; }
        } else this.isAdmin = false;
        updateAdminNav();
        resolve();
      });
    });
  },

  // ---------- subscriptions: cb receives full arrays ----------
  subscribeProducts(cb) {
    if (!LIVE) {
      const run = () => { const db = DemoDB.load(); cb(db.products.filter(p => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder)); };
      run(); return DemoDB.onChange(run);
    }
    const { fsM, db } = this._fb;
    const q = fsM.query(fsM.collection(db, "products"), fsM.where("isActive", "==", true), fsM.orderBy("sortOrder"));
    return fsM.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
  },

  subscribeMyOrders(cb) {
    if (!LIVE) {
      const run = () => { const db = DemoDB.load(); cb(db.orders.filter(o => o.customerId === this.uid).sort((a, b) => b.createdAt - a.createdAt)); };
      run(); return DemoDB.onChange(run);
    }
    const { fsM, db } = this._fb;
    const q = fsM.query(fsM.collection(db, "orders"), fsM.where("customerId", "==", this.uid), fsM.orderBy("createdAt", "desc"));
    return fsM.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...normTs(d.data()) }))), () => cb([]));
  },

  subscribeAllChats(cb) { // admin
    if (!LIVE) {
      const run = () => { const db = DemoDB.load(); cb([...db.chats].sort((a, b) => b.lastMessageAt - a.lastMessageAt).map(c => ({ ...c, order: db.orders.find(o => o.id === c.orderId) || null }))); };
      run(); return DemoDB.onChange(run);
    }
    const { fsM, db } = this._fb;
    const q = fsM.query(fsM.collection(db, "chats"), fsM.orderBy("lastMessageAt", "desc"));
    return fsM.onSnapshot(q, async (s) => {
      const chats = s.docs.map((d) => ({ id: d.id, ...normTs(d.data()) }));
      for (const c of chats) {
        try { const o = await fsM.getDoc(fsM.doc(db, "orders", c.orderId)); c.order = o.exists() ? { id: o.id, ...normTs(o.data()) } : null; }
        catch (e) { c.order = null; }
      }
      cb(chats);
    }, () => cb([]));
  },

  subscribeAllOrders(cb) { // admin stats
    if (!LIVE) {
      const run = () => { const db = DemoDB.load(); cb([...db.orders].sort((a, b) => b.createdAt - a.createdAt)); };
      run(); return DemoDB.onChange(run);
    }
    const { fsM, db } = this._fb;
    const q = fsM.query(fsM.collection(db, "orders"), fsM.orderBy("createdAt", "desc"));
    return fsM.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...normTs(d.data()) }))), () => cb([]));
  },

  subscribeChat(orderId, cb) { // {order, chat}
    if (!LIVE) {
      const run = () => { const db = DemoDB.load(); cb({ order: db.orders.find(o => o.id === orderId) || null, chat: db.chats.find(c => c.orderId === orderId) || null }); };
      run(); return DemoDB.onChange(run);
    }
    const { fsM, db } = this._fb;
    let order = null, chat = null, done = false;
    const fire = () => { if (order || chat) cb({ order, chat }); };
    const u1 = fsM.onSnapshot(fsM.doc(db, "orders", orderId), (s) => { order = s.exists() ? { id: s.id, ...normTs(s.data()) } : null; fire(); });
    const u2 = fsM.onSnapshot(fsM.doc(db, "chats", orderId), (s) => { chat = s.exists() ? { id: s.id, ...normTs(s.data()) } : null; fire(); });
    return () => { u1(); u2(); };
  },

  subscribeMessages(chatId, cb) {
    if (!LIVE) {
      const run = () => { const db = DemoDB.load(); cb([...(db.messages[chatId] || [])].sort((a, b) => a.createdAt - b.createdAt)); };
      run(); return DemoDB.onChange(run);
    }
    const { fsM, db } = this._fb;
    const q = fsM.query(fsM.collection(db, "chats", chatId, "messages"), fsM.orderBy("createdAt"));
    return fsM.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...normTs(d.data()) }))), () => cb([]));
  },

  async getProduct(id) {
    if (!LIVE) { const db = DemoDB.load(); return db.products.find(p => p.id === id) || null; }
    const { fsM, db } = this._fb;
    const s = await fsM.getDoc(fsM.doc(db, "products", id));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  },

  // ---------- order placement ----------
  async placeOrder(product) {
    const firstText = (num) => `Order ${num}: ${product.name} — ${money(product.price)}. Hi, I'd like to buy this LUT.`;
    if (!LIVE) {
      const db = DemoDB.load();
      db.counter += 1;
      const num = "ORD-" + db.counter;
      const oid = "order-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      const now = Date.now();
      db.orders.push({ id: oid, orderNumber: num, customerId: this.uid, productId: product.id, productName: product.name, price: product.price, imageUrl: product.imageUrl || "", status: "Pending", createdAt: now });
      db.chats.push({ id: oid, orderId: oid, customerId: this.uid, lastMessage: firstText(num), lastMessageAt: now, adminUnread: true, customerUnread: false });
      (db.messages[oid] = db.messages[oid] || []).push({ id: "m" + now, senderId: this.uid, senderRole: "customer", text: firstText(num), createdAt: now });
      DemoDB.save(db);
      return { id: oid, orderNumber: num };
    }
    const { fsM, db } = this._fb;
    const counterRef = fsM.doc(db, "meta", "counters");
    const num = await fsM.runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const next = (snap.exists() ? (snap.data().orderSeq || 1023) : 1023) + 1;
      tx.set(counterRef, { orderSeq: next }, { merge: true });
      return "ORD-" + next;
    });
    const orderRef = fsM.doc(fsM.collection(db, "orders"));
    const order = { orderNumber: num, customerId: this.uid, productId: product.id, productName: product.name, price: product.price, imageUrl: product.imageUrl || "", status: "Pending", createdAt: fsM.serverTimestamp() };
    await fsM.setDoc(orderRef, order);
    await fsM.setDoc(fsM.doc(db, "chats", orderRef.id), { orderId: orderRef.id, customerId: this.uid, lastMessage: firstText(num), lastMessageAt: fsM.serverTimestamp(), adminUnread: true, customerUnread: false });
    await fsM.addDoc(fsM.collection(db, "chats", orderRef.id, "messages"), { senderId: this.uid, senderRole: "customer", text: firstText(num), createdAt: fsM.serverTimestamp() });
    return { id: orderRef.id, orderNumber: num };
  },

  async sendMessage(chatId, text, role) {
    const now = Date.now();
    if (!LIVE) {
      const db = DemoDB.load();
      (db.messages[chatId] = db.messages[chatId] || []).push({ id: "m" + now + Math.random().toString(36).slice(2, 5), senderId: role === "admin" ? "admin" : this.uid, senderRole: role, text, createdAt: now });
      const chat = db.chats.find(c => c.id === chatId);
      if (chat) { chat.lastMessage = text; chat.lastMessageAt = now; if (role === "admin") { chat.customerUnread = true; chat.adminUnread = false; } else { chat.adminUnread = true; chat.customerUnread = false; } }
      DemoDB.save(db);
      return;
    }
    const { fsM, db } = this._fb;
    await fsM.addDoc(fsM.collection(db, "chats", chatId, "messages"), { senderId: this.uid, senderRole: role, text, createdAt: fsM.serverTimestamp() });
    await fsM.updateDoc(fsM.doc(db, "chats", chatId), { lastMessage: text, lastMessageAt: fsM.serverTimestamp(), ...(role === "admin" ? { customerUnread: true, adminUnread: false } : { adminUnread: true, customerUnread: false }) });
  },

  async markRead(chatId, role) {
    if (!LIVE) {
      const db = DemoDB.load();
      const chat = db.chats.find(c => c.id === chatId);
      if (!chat) return;
      if (role === "admin" && chat.adminUnread) { chat.adminUnread = false; DemoDB.save(db); }
      if (role === "customer" && chat.customerUnread) { chat.customerUnread = false; DemoDB.save(db); }
      return;
    }
    const { fsM, db } = this._fb;
    await fsM.updateDoc(fsM.doc(db, "chats", chatId), role === "admin" ? { adminUnread: false } : { customerUnread: false }).catch(() => {});
  },

  async setOrderStatus(orderId, status) {
    if (!LIVE) {
      const db = DemoDB.load();
      const o = db.orders.find(x => x.id === orderId);
      if (o) { o.status = status; DemoDB.save(db); }
      return;
    }
    const { fsM, db } = this._fb;
    await fsM.updateDoc(fsM.doc(db, "orders", orderId), { status });
  },

  // ---------- admin auth ----------
  async adminLogin(email, password) {
    if (!LIVE) {
      if (email.trim().toLowerCase() === "admin@demo.local" && password === "noiradmin") {
        sessionStorage.setItem("noirluts_demo_admin", "1");
        this.isAdmin = true; updateAdminNav();
        return { ok: true };
      }
      return { ok: false, error: "Wrong demo email or password — use the demo login shown above." };
    }
    const { authM, fsM, auth, db } = this._fb;
    try {
      const cred = await authM.signInWithEmailAndPassword(auth, email, password);
      const snap = await fsM.getDoc(fsM.doc(db, "admins", cred.user.uid));
      if (!snap.exists()) { await authM.signOut(auth); return { ok: false, error: "That account is not an admin account." }; }
      this.uid = cred.user.uid; this.isAdmin = true; updateAdminNav();
      return { ok: true };
    } catch (e) { return { ok: false, error: "Login failed: " + (e.code || e.message) }; }
  },

  async adminLogout() {
    if (!LIVE) { sessionStorage.removeItem("noirluts_demo_admin"); }
    else { try { await this._fb.authM.signOut(this._fb.auth); } catch (e) {} }
    this.isAdmin = false; updateAdminNav();
  },

  async seedProducts() {
    if (!LIVE) { toast("Demo products are already the placeholders 👍"); return { ok: true, note: "demo" }; }
    const { fsM, db } = this._fb;
    for (const p of PLACEHOLDER_PRODUCTS) await fsM.addDoc(fsM.collection(db, "products"), p);
    return { ok: true };
  }
};
function normTs(d) { const o = { ...d }; for (const k of ["createdAt", "lastMessageAt"]) if (o[k] && o[k].toMillis) o[k] = o[k].toMillis(); return o; }
if (!LIVE && sessionStorage.getItem("noirluts_demo_admin") === "1") Store.isAdmin = true;
function updateAdminNav() { document.getElementById("adminNavLink").classList.toggle("hidden", !Store.isAdmin); }

// ============================================================
//  ROUTER + VIEWS
// ============================================================
let unsubs = [];
function cleanup() { unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; $modal.innerHTML = ""; }
function setNav(name) { document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === name)); }

function viewShop() {
  setNav("shop");
  $view.innerHTML = `
    <section class="hero">
      <h1>Cinematic color,<br><span class="accent">one tap away.</span></h1>
      <p>${esc(CFG.brandTagline || "")}. Order in seconds — payment &amp; delivery are arranged personally with you in chat. No checkout, no hassle.</p>
    </section>
    <div class="section-title">LUT Packs</div>
    <div id="productFeed"><div class="loading">Loading LUT packs…</div></div>`;
  unsubs.push(Store.subscribeProducts((products) => {
    const feed = document.getElementById("productFeed"); if (!feed) return;
    if (!products.length) { feed.innerHTML = `<div class="empty"><span class="big">🎞️</span>No LUT packs live yet — check back soon.</div>`; return; }
    feed.innerHTML = products.map(p => `
      <a class="card" href="#/product/${p.id}">
        <div class="card-media">${mediaHTML(p)}<span class="card-price-chip">${money(p.price)}</span></div>
        <div class="card-body">
          <h2 class="card-name">${esc(p.name)}</h2>
          <p class="card-tag">${esc(p.tagline || "")}</p>
          <span class="card-cta">VIEW PACK →</span>
        </div>
      </a>`).join("");
  }));
}

async function viewProduct(id) {
  setNav("shop");
  $view.innerHTML = `<a class="back-link" href="#/">← Back to shop</a><div class="loading">Loading…</div>`;
  const p = await Store.getProduct(id);
  if (!p) { $view.innerHTML = `<a class="back-link" href="#/">← Back to shop</a><div class="empty"><span class="big">🤷</span>That pack isn't available.</div>`; return; }
  const hasVideo = !!p.videoUrl;
  $view.innerHTML = `
    <a class="back-link" href="#/">← Back to shop</a>
    <div class="detail-media">
      ${hasVideo
        ? `<video id="detailVideo" src="${esc(p.videoUrl)}" poster="${esc(p.imageUrl || "")}" autoplay muted loop playsinline></video><span class="unmute-hint" id="unmuteHint">🔇 Tap video for sound</span>`
        : mediaHTML(p)}
    </div>
    <h1 class="detail-name">${esc(p.name)}</h1>
    <p class="detail-price">${money(p.price)}</p>
    <p class="detail-desc">${esc(p.description || p.tagline || "")}</p>
    ${Array.isArray(p.includes) && p.includes.length ? `<div class="includes"><h3>What's included</h3><ul>${p.includes.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>` : ""}
    <button class="btn btn-accent" id="orderBtn">Place Order — ${money(p.price)}</button>
    <p style="color:var(--muted);font-size:14px;text-align:center;margin-top:12px">No payment now. Placing an order opens a private chat with us to arrange payment &amp; delivery.</p>`;
  const vid = document.getElementById("detailVideo");
  if (vid) vid.addEventListener("click", () => { vid.muted = !vid.muted; const h = document.getElementById("unmuteHint"); if (h) h.textContent = vid.muted ? "🔇 Tap video for sound" : "🔊 Sound on — tap to mute"; });
  document.getElementById("orderBtn").addEventListener("click", () => confirmOrder(p));
}

function confirmOrder(p) {
  $modal.innerHTML = `
    <div class="modal-backdrop" id="mb">
      <div class="modal">
        <h3>Confirm your order</h3>
        <p>This places your order and opens a chat with us — we'll arrange payment &amp; delivery there. Nothing is charged now.</p>
        <div class="row"><span>LUT pack</span><b>${esc(p.name)}</b></div>
        <div class="row"><span>Price</span><b>${money(p.price)}</b></div>
        <div class="row"><span>Status</span><b>Pending</b></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="cancelOrder">Cancel</button>
          <button class="btn btn-accent" id="confirmOrder">Place Order</button>
        </div>
      </div>
    </div>`;
  document.getElementById("cancelOrder").onclick = () => { $modal.innerHTML = ""; };
  document.getElementById("mb").addEventListener("click", (e) => { if (e.target.id === "mb") $modal.innerHTML = ""; });
  document.getElementById("confirmOrder").onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = "Placing…";
    try {
      const res = await Store.placeOrder(p);
      if (navigator.vibrate) navigator.vibrate(30);
      $modal.innerHTML = "";
      toast(`Order ${res.orderNumber} placed 🎉`);
      location.hash = "#/chat/" + res.id;
    } catch (e) { toast("Order failed — try again"); ev.target.disabled = false; ev.target.textContent = "Place Order"; }
  };
}

function orderRowHTML(o, opts = {}) {
  return `
    <button class="order-row" data-order="${o.id}">
      ${o.imageUrl ? `<img class="order-thumb" src="${esc(o.imageUrl)}" alt="">` : `<div class="order-thumb"></div>`}
      <span class="order-main">
        <p class="order-name">${esc(o.productName)}</p>
        <p class="order-meta">${esc(o.orderNumber)} · ${money(o.price)} · ${fmtDate(o.createdAt)}${opts.customer ? " · Customer " + esc(shortId(o.customerId)) : ""}</p>
      </span>
      <span class="badge badge-${esc(o.status)}">${esc(o.status)}</span>
      ${opts.unread ? `<span class="unread-dot"></span>` : ""}
    </button>`;
}

function viewOrders() {
  setNav("orders");
  $view.innerHTML = `<div class="hero"><h1>My <span class="accent">Orders</span></h1><p>Tap any order to open its chat.</p></div><div id="ordersList"><div class="loading">Loading your orders…</div></div>`;
  let chatMap = {};
  unsubs.push(Store.subscribeMyOrders((orders) => {
    const el = document.getElementById("ordersList"); if (!el) return;
    if (!orders.length) { el.innerHTML = `<div class="empty"><span class="big">📦</span>No orders yet.<br><br><a href="#/" style="color:var(--accent);font-weight:800">Browse LUT packs →</a></div>`; return; }
    el.innerHTML = orders.map(o => orderRowHTML(o, { unread: chatMap[o.id]?.customerUnread })).join("");
    el.querySelectorAll("[data-order]").forEach(b => b.onclick = () => location.hash = "#/chat/" + b.dataset.order);
  }));
  // unread dots: reuse chats via my-orders + chat docs (demo: read db; live: orders only—dots derive from chats below)
  if (!LIVE) {
    const run = () => { const db = DemoDB.load(); chatMap = {}; db.chats.forEach(c => chatMap[c.orderId] = c); };
    run(); unsubs.push(DemoDB.onChange(run));
  }
}

function chatView(orderId, asAdmin) {
  setNav(asAdmin ? "admin" : "orders");
  $view.innerHTML = `<a class="back-link" href="#${asAdmin ? "/admin" : "/orders"}">← Back</a><div id="chatRoot"><div class="loading">Opening chat…</div></div>`;
  let order = null, rendered = false;
  const role = asAdmin ? "admin" : "customer";

  unsubs.push(Store.subscribeChat(orderId, (data) => {
    order = data.order; const chat = data.chat;
    const root = document.getElementById("chatRoot"); if (!root) return;
    if (!order) { root.innerHTML = `<div class="empty"><span class="big">🤷</span>Order not found.</div>`; return; }
    if (!asAdmin && order.customerId !== Store.uid && Store.mode === "demo" && order.customerId !== Store.uid) { /* demo: allow view */ }
    root.innerHTML = `
      <div class="summary-card">
        ${order.imageUrl ? `<img src="${esc(order.imageUrl)}" alt="">` : ""}
        <div style="flex:1;min-width:0">
          <div style="font-weight:900;font-size:17px">${esc(order.productName)}</div>
          <div style="color:var(--muted);font-size:13.5px">${esc(order.orderNumber)} · ${money(order.price)} · ${fmtDate(order.createdAt)}</div>
        </div>
        <span class="badge badge-${esc(order.status)}">${esc(order.status)}</span>
      </div>
      ${asAdmin ? `<div class="status-bar"><b style="font-size:14px;letter-spacing:.08em">ORDER STATUS</b>
        <select id="statusSel">
          ${["Pending", "Confirmed", "Delivered"].map(s => `<option ${s === order.status ? "selected" : ""}>${s}</option>`).join("")}
        </select><span style="color:var(--muted);font-size:13px">Customer sees changes instantly</span></div>` : ""}
      <div class="chat-wrap">
        <div class="messages" id="msgs"><div class="loading">Loading messages…</div></div>
        <form class="composer" id="composer">
          <input id="msgInput" type="text" placeholder="Type a message…" autocomplete="off" maxlength="2000">
          <button type="submit">Send</button>
        </form>
      </div>`;
    rendered = true;
    if (asAdmin) {
      document.getElementById("statusSel").onchange = async (e) => { await Store.setOrderStatus(orderId, e.target.value); toast("Status → " + e.target.value); };
    }
    const form = document.getElementById("composer");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const inp = document.getElementById("msgInput");
      const text = inp.value.trim(); if (!text) return;
      inp.value = "";
      await Store.sendMessage(orderId, text, role);
    };
    Store.markRead(orderId, role);
    // messages subscription (attach once per render cycle is fine — cleanup on route change)
    unsubs.push(Store.subscribeMessages(orderId, (msgs) => {
      const box = document.getElementById("msgs"); if (!box) return;
      if (!msgs.length) { box.innerHTML = `<div class="empty">No messages yet — say hi 👋</div>`; return; }
      box.innerHTML = msgs.map(m => {
        const mine = m.senderRole === role;
        return `<div class="msg ${mine ? "out" : "in"}">${esc(m.text)}<small>${fmtTime(m.createdAt)}</small></div>`;
      }).join("");
      box.scrollTop = box.scrollHeight;
    }));
  }));
}

function viewAdminLogin() {
  setNav("");
  if (Store.isAdmin) { location.hash = "#/admin"; return; }
  $view.innerHTML = `
    <div class="form-card">
      <h2>Admin Login</h2>
      <p>Store owner access only.</p>
      ${!LIVE ? `<div class="demo-hint"><b>Demo mode login</b><br>Email: <b>admin@demo.local</b><br>Password: <b>noiradmin</b><br><span style="opacity:.8">Fake local data only — real admin login activates when Firebase is connected.</span></div>` : ""}
      <div id="loginErr"></div>
      <form id="loginForm">
        <div class="field"><label>Email</label><input id="adminEmail" type="email" required autocomplete="username" placeholder="you@yourstore.com"></div>
        <div class="field"><label>Password</label><input id="adminPass" type="password" required autocomplete="current-password" placeholder="••••••••"></div>
        <button class="btn btn-accent" type="submit">Log In</button>
      </form>
      <p style="margin-top:16px;text-align:center"><a class="back-link" href="#/">← Back to shop</a></p>
    </div>`;
  document.getElementById("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const res = await Store.adminLogin(document.getElementById("adminEmail").value, document.getElementById("adminPass").value);
    if (res.ok) { toast("Welcome back 👋"); location.hash = "#/admin"; }
    else document.getElementById("loginErr").innerHTML = `<div class="form-error">${esc(res.error)}</div>`;
  };
}

function viewAdmin() {
  setNav("admin");
  if (!Store.isAdmin) { location.hash = "#/admin/login"; return; }
  $view.innerHTML = `
    <div class="hero"><h1>Admin <span class="accent">Dashboard</span></h1><p>Every order chat, newest first.</p></div>
    <div class="stats" id="stats">
      <div class="stat"><div class="num" id="stTotal">–</div><div class="lbl">Total Orders</div></div>
      <div class="stat"><div class="num" id="stPending" style="color:var(--yellow)">–</div><div class="lbl">Pending</div></div>
      <div class="stat"><div class="num" id="stConfirmed" style="color:#7db1ff">–</div><div class="lbl">Confirmed</div></div>
      <div class="stat"><div class="num" id="stDelivered" style="color:#4ade80">–</div><div class="lbl">Delivered</div></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
      <button class="btn btn-ghost btn-small" id="seedBtn">Seed placeholder products</button>
      <button class="btn btn-ghost btn-small" id="logoutBtn">Log out</button>
    </div>
    <div class="section-title">Order Chats</div>
    <div id="adminChats"><div class="loading">Loading chats…</div></div>`;
  document.getElementById("seedBtn").onclick = async () => { const r = await Store.seedProducts(); toast(r.ok ? "Placeholder products seeded to Firestore ✓" : "Seed failed"); };
  document.getElementById("logoutBtn").onclick = async () => { await Store.adminLogout(); location.hash = "#/"; };
  unsubs.push(Store.subscribeAllOrders((orders) => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set("stTotal", orders.length);
    set("stPending", orders.filter(o => o.status === "Pending").length);
    set("stConfirmed", orders.filter(o => o.status === "Confirmed").length);
    set("stDelivered", orders.filter(o => o.status === "Delivered").length);
  }));
  unsubs.push(Store.subscribeAllChats((chats) => {
    const el = document.getElementById("adminChats"); if (!el) return;
    if (!chats.length) { el.innerHTML = `<div class="empty"><span class="big">💬</span>No orders yet. When a customer orders, their chat lands here.</div>`; return; }
    el.innerHTML = chats.map(c => {
      const o = c.order; if (!o) return "";
      return `<div style="position:relative">${orderRowHTML(o, { customer: true, unread: c.adminUnread })}
        <div style="color:var(--muted);font-size:13.5px;margin:-6px 14px 14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">💬 ${esc(c.lastMessage || "")}</div></div>`;
    }).join("");
    el.querySelectorAll("[data-order]").forEach(b => b.onclick = () => location.hash = "#/admin/chat/" + b.dataset.order);
  }));
}

// ---------- routing ----------
function route() {
  cleanup();
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);
  if (parts.length === 0) return viewShop();
  if (parts[0] === "product" && parts[1]) return viewProduct(parts[1]);
  if (parts[0] === "orders") return viewOrders();
  if (parts[0] === "chat" && parts[1]) return chatView(parts[1], false);
  if (parts[0] === "admin" && parts[1] === "login") return viewAdminLogin();
  if (parts[0] === "admin" && parts[1] === "chat" && parts[2]) return chatView(parts[2], true);
  if (parts[0] === "admin") return viewAdmin();
  return viewShop();
}
window.addEventListener("hashchange", route);
document.getElementById("copyrightBtn").addEventListener("click", () => { location.hash = Store.isAdmin ? "#/admin" : "#/admin/login"; });
updateAdminNav();

Store.init().then(route).catch((e) => { console.error(e); route(); });

// Exposed for debugging / smoke tests
window.NOIRStore = Store;
