# NOIR LUTs — Go-Live Setup (Firebase)

The site ships in **DEMO MODE**: every flow (shop, ordering, chat, admin)
works with fake local data so you can tap through it. Follow these steps
once to connect your real Firebase project — after that, everything is
live and real-time, and you manage products/prices from Firestore
without ever touching code again.

> Rename the brand any time: it's ONE line — `brandName` in `config.js`.

---

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `noirluts`).
2. Google Analytics is optional. Create the project.

## 2. Add a Web app and paste the config
1. In the project overview, click the **Web** icon (`</>`) → register app (nickname: `NOIR LUTs Web`).
2. Firebase shows a `firebaseConfig` object. Copy its values into
   **`config.js`** in this repo (the `firebase: { ... }` block),
   OR set them as Vercel env vars and paste them into config.js before redeploying (the site reads config from `config.js` — simplest is to edit that file and redeploy).
3. Redeploy on Vercel. The DEMO badge disappears = you're live.

## 3. Turn on sign-in methods
Firebase console → **Authentication** → **Sign-in method**:
- Enable **Anonymous** (customers — frictionless, no sign-up).
- Enable **Email/Password** (you, the admin).

## 4. Create YOUR admin account
1. Authentication → **Users** → **Add user**: your email + a strong password.
2. Copy your **User UID** from that row.

## 5. Create Firestore + mark yourself admin
1. **Firestore Database** → **Create database** (production mode).
2. In the **Data** tab, create a collection named **`admins`**, add a document
   with **Document ID = your User UID** (from step 4), any field (e.g. `role: "admin"`).
   That document is what makes you admin — the app and the rules both check it.

## 6. Deploy the security rules
Easiest (console) way:
- Firestore → **Rules** tab → delete the contents → paste in everything from
  **`firestore.rules`** in this repo → **Publish**.
- Storage → **Rules** tab → same with **`storage.rules`** → **Publish**.

(Or with the Firebase CLI: `firebase deploy --only firestore:rules,storage`.)

## 7. Upload your preview images/videos (Storage)
1. **Storage** → **Get started** → **Files** tab → create a folder `products/`.
2. Upload your preview images/videos there.
3. Click a file → copy its **download URL** — you'll paste it into the
   product's `imageUrl` / `videoUrl` in Firestore.

## 8. Seed + manage products
1. Open the site, scroll to the footer, tap **© 2025 NOIR** (hidden admin entry).
2. Log in with your admin email/password.
3. On the dashboard, tap **Seed placeholder products** — this writes the 3
   placeholder packs to Firestore.
4. From then on, add/edit everything in **Firestore → `products`**:
   `name`, `tagline`, `description`, `includes` (array of strings), `price`,
   `imageUrl`, `videoUrl`, `isActive` (true/false), `sortOrder` (1 = top).
   Changes appear on the shop instantly — no redeploy.

## How the shop works (live)
- Customers are signed in anonymously, automatically.
- **Place Order** creates an `orders` doc (numbers run ORD-1024, ORD-1025…
  from a counter transaction), a `chats` doc, and auto-sends the first
  message: *"Order ORD-####: [LUT Name] — $[Price]. Hi, I'd like to buy this LUT."*
- You reply from **Admin → tap the chat**. Set **Pending → Confirmed → Delivered**
  inside the chat; the customer sees the badge change in real time.
- Payment & delivery are arranged by you, in that chat — there is
  intentionally **no payment processing** anywhere in the app.

## Demo mode reference
- Until step 2 is done, data lives in the visitor's browser (localStorage).
- Demo admin login (shown on the admin login screen): `admin@demo.local` / `noiradmin`.
- Orders/chats placed in demo from one browser are only visible in that browser.
