# NOIR LUTs — LUT Shop (Vercel website)

A dark, cinematic LUT-pack shop: customers browse packs with autoplay
video previews, place orders for the real 184-LUT catalog + 3 packs (no payment processing), and each order
instantly opens a private chat with the store admin to arrange payment
& delivery manually.

**Stack:** static single-page site (no build step) + Firebase
(Auth / Firestore / Storage) with realtime listeners. Ships in a full
**demo mode** (local data layer) until a Firebase config is added.

## Files
- `index.html` — page shell, header, footer (hidden admin entry), bottom nav
- `style.css` — dark theme (#0A0A0A, amber accent #FF8A00)
- `app.js` — router, views (Shop / Product / Orders / Chat / Admin), data layer (live Firebase + demo)
- `config.js` — **brand name (one line)** + Firebase config
- `catalog.js` — the real LUT catalog (187 products generated from the downloaded .cube files: 3 packs + 184 LUTs with measured best settings + colour palettes sampled from the LUT data). Demo mode seeds from it; the admin Seed button writes it to Firestore in live mode. The .cube files themselves are never hosted here — delivery is manual in the order chat.
- `firestore.rules` / `storage.rules` — security rules (see SETUP.md)
- `SETUP.md` — step-by-step go-live guide

## Views
- `#/` Shop feed (Firestore products, generated palette previews, search + filter chips: All / Rec.709 / Log & Conversion / Packs / Warm / Cool)
- `#/product/:id` Detail + Place Order
- `#/orders` My Orders (status badges)
- `#/chat/:orderId` Customer chat (order summary pinned)
- `#/admin/login` Admin login (hidden: tap the © footer on the shop)
- `#/admin` Dashboard (live counts + all order chats)
- `#/admin/chat/:orderId` Admin chat + status control

## Deploy
Static site — deploy the folder to Vercel as-is (no build command,
no output dir config needed).
