<div dir="rtl">

# حسيب (Haseeb)

**حساباتك بدقة.. وأمان.**

برنامج محاسبة ونقاط بيع يعمل **دون إنترنت**، للمحلات والمنشآت الصغيرة والمتوسطة.
واجهة عربية كاملة من اليمين إلى اليسار، وقاعدة بيانات محلية مشفّرة على الجهاز،
تعمل على الجوال والويب وسطح المكتب من نفس الشيفرة.

</div>

---

An offline-first accounting and point-of-sale application for small and medium
retail businesses in the Arabic-speaking market. Fully RTL, fully local: no
network call is required for any feature, and the database is encrypted at
rest on the device.

## What it does

| Screen | Route | What it covers |
|---|---|---|
| تسجيل المنشأة | `#/onboarding` | Three-step business registration; creates the encrypted local database |
| لوحة التحكم | `#/` | Six KPIs, seven-day sales/profit chart, channel donut, quick actions |
| البيع المباشر | `#/pos` | Barcode scan or search, cart with steppers, cash or credit checkout |
| الفواتير والأرباح | `#/finance` | Period and status filters, four summary cards, invoice table |
| بيع الجملة | `#/wholesale` | Volume tiers, per-invoice custom discount, invoice builder |
| دفتر الديون | `#/debts` | Receivables and payables, aging, payment history, WhatsApp/SMS reminders |
| الطلبات والفواتير | `#/orders` | Customer orders, purchase orders, printable tax invoice with QR |
| المخزن | `#/inventory` | Stock table with alerts, categories, receiving, movement timeline |
| الإدارة العامة | `#/manage` | Financial health, operating costs, permissions, audit trail, DB controls |

## Stack and why

- **React 18 + TypeScript + Vite.** The spec's recommended stack is Flutter; the
  acceptable alternative is React + TypeScript + Vite, which is what this repo
  uses — the Flutter SDK was not available in the build environment, and this
  stack reaches the same three targets (web, desktop via Tauri, mobile via
  Capacitor) from one codebase.
- **SQLite via `sql.js`** — a real SQLite compiled to WebAssembly, so the same
  engine, SQL and schema run in a browser, a Tauri WebView and a Capacitor
  WebView. Swapping in a native driver (`better-sqlite3`, `op-sqlite`) means
  writing one sibling to `src/db/engine.ts`; nothing above it knows sql.js
  exists.
- **AES-256-GCM** over the whole database image, via WebCrypto.
- **No UI kit.** Every colour, size, radius and shadow comes from
  `src/styles/tokens.css`; there is no framework theme to fight.
- **Fonts bundled locally** (`@fontsource/ibm-plex-sans-arabic`,
  `@fontsource/ibm-plex-mono`). Nothing is fetched from a CDN at runtime,
  because the app has to render correctly with networking disabled.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run preview    # serve the built bundle
npm test           # 59 tests
npm run typecheck
```

### Web

`npm run build` produces a self-contained `dist/` with relative asset URLs. Serve
it from any static host, or open it from the filesystem — hash routing and
`base: './'` mean it works under `file://` too.

### Desktop (Tauri)

Requires the [Rust toolchain and Tauri prerequisites](https://tauri.app/start/prerequisites/),
which are not installed in this repo's CI image.

```bash
npm install -D @tauri-apps/cli
npx tauri init          # once: point frontendDist at ../dist, devUrl at http://localhost:5173
npm run desktop:dev
npm run desktop:build   # .app / .msi / .AppImage
```

### Mobile (Capacitor)

Requires Android Studio or Xcode.

```bash
npm install @capacitor/core @capacitor/cli
npx cap init حسيب com.haseeb.app --web-dir=dist
npx cap add android      # and/or: npx cap add ios
npm run mobile:android   # builds, syncs and opens the platform IDE
```

`capacitor.config.json` is not committed because the platform folders it pairs
with are generated, not source.

## Where the data lives

| Platform | Location |
|---|---|
| Web / Capacitor WebView / Tauri WebView | IndexedDB database `haseeb`, object store `files`, keys `haseeb.db`, `haseeb.devicekey`, `haseeb.salt` |
| Tests | In-memory (`MemoryStore`), discarded per test |

The whole SQLite image is sealed with AES-256-GCM before it is written, and only
ever decrypted into memory. Writes are debounced 400 ms and flushed on
`pagehide`, so a killed tab loses at most the last few hundred milliseconds.

The exact location is shown in the app: the storage card at the bottom of the
sidebar, and the «قاعدة البيانات المحلية» panel on الإدارة العامة.

### Key management, honestly

Two modes:

- **Device key (default).** A random 256-bit key is generated on first run and
  stored alongside the database. This protects the file *at rest* — a copied
  database, a stolen backup, another app reading shared storage — but **not**
  an attacker who already controls the running device, since the key is there
  too. This is the same trade-off SQLCipher-with-a-keystore-key makes.
- **Owner passphrase.** `HaseebDatabase.open({ passphrase })` derives the key
  with PBKDF2-SHA256 (210,000 rounds) and stores only the salt. Nothing on the
  device can open the file without the passphrase.

Passphrase mode is wired through the database layer and covered by tests; the
onboarding flow currently creates a device-key database. Prompting for and
caching a passphrase is a UX decision left to the product owner.

## Resetting the seed data

Three ways, in increasing bluntness:

1. **In the app** — الإدارة العامة → «إعادة الضبط للبيانات الافتتاحية»
   (asks for confirmation, then wipes every table and re-seeds).
2. **In code** — `resetToSeed(db)` from `src/db/seed.ts`.
3. **By hand** — clear the site's IndexedDB (DevTools → Application → Storage →
   Clear site data). The next load creates and seeds a fresh database.

The seed only runs when the database is empty, so an existing install is never
overwritten by an update.

## About the seed figures

The seed reproduces every figure the design specifies *literally*: the product
catalogue with its SKUs, costs, prices and quantities; the six named invoices
(INV-2476…INV-2481) at their stated amounts and profits; the debt ledger down
to محمود عبد الله's individual payments; the orders, expenses, staff, audit
entries and stock movements.

Aggregate tiles are **computed from that ledger** rather than hard-coded, and a
few of them therefore differ from the design's numbers — because the design's
own aggregates do not reconcile with each other:

| Design says | Arithmetic |
|---|---|
| Gross profit ١١,٤٦٠, expenses ٩,٤٨٠, net profit ٧,٩٨٠ | 11,460 − 9,480 = **1,980**, not 7,980 |
| Weekly sales ٤٨,٢٠٠ and six invoices totalling ١٩,٧٧٤ over the same seven days | the two cannot both hold |
| Today's income ٣,٢٤٠ while the chart's last day is 52/284 of the week's ٤٨,٢٠٠ | implies **8,825** |

These read as per-tile mock values rather than one consistent set of books.
Hard-coding them would put a number on the dashboard that the ledger
contradicts, which is the one thing an accounting app must never do — so the
figures are derived, and these are the specific contradictions.

The figures that *are* self-consistent land exactly, and are asserted in
`tests/checkout.test.ts`:

- ١٢,٤٠٠ ج.م receivable across ١٨ عميلاً
- ٣,٨٥٠ ج.م payable across ٤ موردين
- ٩,٦٤٠ ج.م collected across ٢٣ سداداً
- ٩,٤٨٠ ج.م operating expenses
- ٦٢,٤٠٠ ج.م across ٤٨ invoices for the month
- The printed tax invoice reconciling to the piaster: ١,٢٤٠.٠٠ + ١٤٪ = ١,٤١٣.٦٠
- محمود عبد الله at ١,٤٥٠ ج.م outstanding, ١٢ days overdue

## Architecture

```
src/
  domain/      money · tax · wholesale · debts · inventory   (pure, no I/O)
  db/          schema.sql · engine · crypto · storage · database
    repositories/  products · sales · customers · operations · analytics
  lib/         format (ar-EG, numbering-system aware) · reminders · zatca · report
  ui/          primitives · composites · ui.css
  shell/       AppShell · screens registry · shell.css
  screens/     one file per route
  styles/      tokens.css · global.css · print.css
tests/         domain suites + database integration + encryption
```

Three rules hold this together:

1. **Money is integer piasters.** `src/domain/money.ts` refuses a fractional
   amount. Floats never touch a total.
2. **Every mutation is audited.** `HaseebDatabase.mutate` writes the change, an
   `audit_log` row and a `sync_queue` row in one transaction. A change cannot
   commit without its ledger entry.
3. **The database is the state.** There is no cache to invalidate: a commit
   bumps a revision, and every screen recomputes from the same rows. A sale
   rung up on the POS moves the dashboard, the debt book and the warehouse at
   once.

### Optional encrypted sync

Sync is a queue plus a reconcile, and it is genuinely optional — nothing blocks
on it. Local mutations accumulate in `sync_queue`; `OperationsRepository.markSynced`
clears them once a peer confirms. The header pill and الإدارة العامة show the
queue depth. No transport is implemented, because the product requirement is
that the app works without one.

## Accessibility and RTL

- `dir="rtl"` on the root; **logical properties only** — `inset-inline-*`,
  `margin-inline-*`, `padding-inline-*`, `border-inline-*`. No `left`/`right`
  anywhere in the stylesheets.
- Numeric runs carry `unicode-bidi: isolate`, so an amount can never reorder
  against the Arabic text beside it.
- Semantic roles on tables, tabs (`role="tablist"` with arrow-key navigation),
  switches (`role="switch"`) and meters.
- Focus rings on every interactive element; ≥44px touch targets.
- Numbers are formatted through `Intl` with `ar-EG`; the numbering system is a
  runtime setting (`setNumberingSystem('arab' | 'latn')`), never a hard-coded
  digit.
- `prefers-reduced-motion` disables the sync pulse and the hover lifts.

## Layouts

Verified at both ends of the range:

- **≥900px** — sidebar rail on the RTL leading edge, two-column screen layouts.
- **<900px** — the rail becomes a drawer (hamburger, Escape to close, focus
  moves in), a bottom tab bar takes over, and the new-sale FAB sits above it.
  Screen layouts collapse to one column.

## What the design did not cover, and is here anyway

Loading skeletons (`#F1F5F9` shimmer), empty states for every list and table,
error states in the `#FEF2F2`/`#B91C1C` pair, form validation on onboarding and
both dialogs, an out-of-stock guard on the POS and the wholesale builder, and a
print stylesheet that reduces the page to the tax invoice.

## Known gaps

- **Product photography.** The POS grid uses the design's striped placeholder;
  the schema has an `image_url` column ready for real images.
- **The QR is GCC/ZATCA-shaped** (base64 TLV, five fields) and generated on
  device. Confirm the field set against the tax authority the business actually
  files with before shipping.
- **The brand icon** is a raster crop with a white background. Ask the brand
  owner for a transparent SVG before release.
- **Tauri and Capacitor scaffolding** is documented above but not committed,
  since the generated platform folders belong to whoever builds them.

## Licence

Application code: see repository. Fonts are IBM Plex Sans Arabic and IBM Plex
Mono, licensed under the SIL Open Font License.
