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
| إنشاء حساب المدير | first run | Names the owner, sets a passcode, shows the one-time recovery code |
| تسجيل الدخول | when locked | Account picker, passcode, lockout after repeated failures, owner recovery |
| تسجيل المنشأة | `#/onboarding` | Three-step business registration; creates the encrypted local database |
| لوحة التحكم | `#/` | Six KPIs, seven-day sales/profit chart, channel donut, quick actions |
| البيع المباشر | `#/pos` | Camera/barcode scan, cart, cash/card/wallet/credit checkout, instant receipt |
| الفواتير والأرباح | `#/finance` | Profitability, invoice printing, full returns and credit notes |
| بيع الجملة | `#/wholesale` | Volume tiers, per-invoice custom discount, invoice builder |
| دفتر الديون | `#/debts` | Receivables and payables, aging, payment history, WhatsApp/SMS reminders |
| الطلبات والفواتير | `#/orders` | Create and follow customer/supplier orders, printable tax invoice with QR |
| المخزن | `#/inventory` | Add products/opening stock, receiving, alerts, categories and movement timeline |
| الإدارة العامة | `#/manage` | Double-entry ledger, trial balance, cash shifts, expenses, permissions and audit trail |

## Stack and why

- **React 18 + TypeScript + Vite.** The spec's recommended stack is Flutter; the
  acceptable alternative is React + TypeScript + Vite, which is what this repo
  uses — the Flutter SDK was not available in the build environment, and this
  stack reaches the same three targets (web, desktop via Tauri, mobile via
  Capacitor) from one codebase.
- **Two SQLite drivers behind one port.** On a phone the app uses the
  platform's own SQLite (`@capacitor-community/sqlite`) with **SQLCipher**;
  everywhere else — browser, desktop shell, tests — it uses a real SQLite
  compiled to WebAssembly (`sql.js`) sealed with **AES-256-GCM**. Both
  implement the same async `SqlDriver` interface and run the same SQL, so the
  repositories above cannot tell which one they are talking to.
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
npm test           # 97 tests
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

### Android (Capacitor)

**The easy way — GitHub Actions.** Every push builds an installable APK; no
Android toolchain needed locally.

1. Open the repository's **Actions** tab → **بناء تطبيق أندرويد · Android APK**.
2. Pick the run for your commit (or press **Run workflow** to start one).
3. Download the `haseeb-apk-…` artifact from the run summary and unzip it.
4. Copy the `.apk` to a phone and open it. Android will ask you to allow
   installing from this source — that prompt is normal for an APK that did not
   come from Play.

The workflow runs typecheck and the test suite before it builds, so an APK is
only ever produced from code that passes its own checks.

**Locally**, with Android Studio (or just the SDK) and JDK 21 installed:

```bash
npm run android:apk     # build + sync + assembleDebug
npm run android:open    # build + sync + open in Android Studio
npm run android:icons   # regenerate launcher icons and splash from resources/
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

The `android/` project **is committed** — it carries the manifest, the brand
launcher icons and the signing wiring, and it is what CI builds. Capacitor's
own `android/.gitignore` keeps the generated parts (build outputs, the copied
web bundle, `local.properties`) out of the repository.

#### Signed release builds

The debug APK is signed with Android's throwaway debug key: fine for testing
and sideloading, not for distribution. To get a signed release APK, create a
keystore and add four repository secrets:

```bash
keytool -genkey -v -keystore haseeb.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias haseeb
base64 -w0 haseeb.jks          # macOS: base64 -i haseeb.jks
```

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the base64 output above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `haseeb` |
| `ANDROID_KEY_PASSWORD` | the key password |

With those set, every run also produces a signed release APK. Pushing a tag
(`git tag v1.0.0 && git push --tags`) creates a GitHub release with both APKs
attached.

**Keep `haseeb.jks` safe and backed up.** Android identifies an app by its
signing key: lose it and you cannot ship an update to anyone who already
installed the app — they would have to uninstall and reinstall, losing their
local database with it.

`versionName` follows `package.json` (or the tag), and `versionCode` is the CI
run number, so it always increases.

### iOS

Not set up. `npx cap add ios` plus a Mac with Xcode is the whole of it; the
web bundle and the database layer are already platform-neutral.

## Where the data lives

| Platform | Driver | Location |
|---|---|---|
| Android (and iOS) | `capacitor` | `/data/data/com.haseeb.app/databases/haseebSQLite.db`, encrypted by SQLCipher with a secret in the platform secure store |
| Web / Tauri WebView | `sqljs` | IndexedDB database `haseeb`, object store `files`, keys `haseeb.db`, `haseeb.devicekey`, `haseeb.salt` |
| Tests | `sqljs` | In-memory, discarded per test |

The active driver is shown in the app: الإدارة العامة → قاعدة البيانات المحلية.

**On a phone**, writes are incremental — a sale writes the pages it touched,
and the file is already durable when the call returns.

**On the web**, the whole SQLite image is sealed with AES-256-GCM before it is
written and only ever decrypted into memory. Writes are debounced 400 ms and
flushed on `pagehide`, so a killed tab loses at most a few hundred
milliseconds. This is the driver that gets slow as the database grows, which
is why the native one exists.

The exact location is shown in the app: the storage card at the bottom of the
sidebar, and the «قاعدة البيانات المحلية» panel on الإدارة العامة.

### Key management, honestly

Two modes, on both drivers:

- **Device key (default).** A random 256-bit key is generated on first run —
  handed to the platform secure store on a phone, written beside the database
  on the web. This protects the file *at rest*: a copied database, a stolen
  backup, another app reading shared storage. It does **not** protect against
  an attacker who already controls the running device, since the key is
  reachable there too.
- **Owner passphrase.** Opening with `{ passphrase }` keys SQLCipher directly
  on a phone, and derives an AES key with PBKDF2-SHA256 (210,000 rounds) on the
  web. Nothing on the device can open the file without it.

Passphrase mode is wired through the data layer and covered by tests; the
onboarding flow currently creates a device-key database. Prompting for and
caching a passphrase is a UX decision left to the product owner.

## Accounts, and who can do what

There is no cloud account, so there is nothing to sign up for and no password
to be breached somewhere else. Instead every person who works on the device
gets a **local account with a passcode**, and the app records their name
against everything they do.

**First run** asks for the manager's name and passcode and then shows a
recovery code — once. With no server there is no reset e-mail: that code is
the entire recovery story, which is why the screen will not continue until the
owner confirms they have written it down.

**Abilities, not roles.** Fourteen abilities (`src/domain/abilities.ts`) are
the vocabulary; the five role presets — كاشير, أمين مخزن, محاسب, مندوب جملة,
مالك — are only a starting point the owner edits per person. Every guard names
an ability, never a role, so a shop can give its accountant stock access
without inventing a job title for it.

Enforcement is not cosmetic: `RequireAbility` refuses the route, so a screen a
user cannot open is unreachable by typing its URL, not merely hidden from the
navigation. The owner's grant is standing and cannot be edited away or
suspended — a shop that could lock itself out of its own books would.

**What the passcode protects, precisely:** someone picking up an unlocked
shared device and opening a screen that is not theirs, or ringing up a sale
under the manager's name. It is the lock on the till drawer. It is *not*
protection against an attacker holding the device and its key store — four
digits is ten thousand guesses and no amount of hashing changes that; the
database's own encryption is what stands in that person's way. PBKDF2-SHA256
(120,000 rounds) with a per-user salt makes each guess cost something, and five
wrong attempts lock the account for five minutes so guessing at the keypad
stops being viable.

The session lives in memory only and is deliberately not persisted: on a shared
device a session that survived a restart would mean whoever closed the app last
night owns every sale rung up this morning. It also locks itself after ten
minutes of no interaction.

## Moving the shop between devices

الإدارة العامة → «نقل البيانات بين الأجهزة».

Export writes a single `.hsb` file: every table, sealed with AES-256-GCM under
a passphrase the owner chooses (PBKDF2-SHA256, 210,000 rounds). It is a
**row-level snapshot, not a copy of the database file** — which is what lets it
cross between the two drivers, since a phone's SQLCipher file and the web's
sealed image are not the same artifact. On a phone the file is written through
the platform filesystem and handed to the share sheet; in a browser it
downloads.

The passphrase is stored nowhere. A file that leaves the device is useless
without it, and a forgotten passphrase means a useless file — the screen says
so before you type one.

**Import replaces; it does not merge.** The receiving device is emptied and
refilled from the file, accounts and passcodes included, and the screen shows
what the file holds (and asks again) before that happens. Merging two ledgers
that both moved on is a conflict-resolution problem with no safe automatic
answer — two devices that each sold the last unit cannot both be right — and
guessing silently would be worse than asking.

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
  db/          schema.sql · database (async) · crypto · storage
    drivers/     driver (the port) · sqljs · capacitor · index (selection)
    repositories/  products · sales · customers · operations · analytics
  lib/         format (ar-EG, numbering-system aware) · reminders · zatca · report
  state/       HaseebProvider · useQuery
  ui/          primitives · composites · ui.css
  shell/       AppShell · screens registry · shell.css
  screens/     one file per route
  dev/         selftest (the on-device database check CI runs)
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
   bumps a revision, `useQuery` re-runs, and every screen recomputes from the
   same rows. A sale rung up on the POS moves the dashboard, the debt book and
   the warehouse at once.

### Optional encrypted sync

Sync is a queue plus a reconcile, and it is genuinely optional — nothing blocks
on it. Local mutations accumulate in `sync_queue`; `OperationsRepository.markSynced`
clears them once a peer confirms. The header pill and الإدارة العامة show the
queue depth. No transport is implemented, because the product requirement is
that the app works without one — and because there is no account behind this
app for a transport to authenticate. What actually crosses between devices
today is the encrypted export file described above.

## Accessibility and RTL

- `dir="rtl"` on the root; **logical properties only** — `inset-inline-*`,
  `margin-inline-*`, `padding-inline-*`, `border-inline-*`. No `left`/`right`
  anywhere in the stylesheets.
- Numeric runs carry `unicode-bidi: isolate`, so an amount can never reorder
  against the Arabic text beside it.
- Semantic roles on tables, tabs (`role="tablist"` with arrow-key navigation),
  switches (`role="switch"`) and meters.
- Focus rings on every interactive element; ≥44px touch targets.
- Numbers are formatted through `Intl` with `ar-EG`. The numbering system is a
  runtime setting, never a hard-coded digit: **Latin digits (0123456789) are
  the default**, and Arabic-Indic (٠١٢٣٤٥٦٧٨٩) is one toggle away in
  الإدارة العامة → العرض. The choice is stored in the local database, so it
  survives a restart. A test fails the build if a literal Arabic-Indic digit
  reappears in component source, since that would bypass the setting.
- The percent sign follows the digits: ٪ (U+066A) is drawn to sit beside
  Arabic-Indic numerals, and `%` beside Latin ones.
- Signed and composite numeric runs (`+230%`, `74.50 × 2`, `150 – 299`) carry
  `direction: ltr` inside an isolate. The `+`, `−` and `×` are bidi-neutral,
  so without it an RTL line renders `+230%` as `230%+`.
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

## What was verified, and how

Beyond the 89 unit and integration tests, the built bundle was driven in
Chromium at 1440px and 390px:

- All nine routes render with **zero console errors**.
- **Zero requests leave the origin** across every route. With the network then
  cut entirely, the POS still completes a sale, the tax-invoice QR is still
  generated (a `data:` URI, not a fetch), and the Arabic font still resolves
  from the bundle.
- Fifteen interaction flows: add to cart → stepper → checkout → stock
  decrement; credit sale refused without a customer; period and status filters
  requerying; the wholesale slider recomputing line totals; issuing a wholesale
  invoice; recording a payment against a balance; receiving stock and seeing it
  on the movement timeline; a sale surviving a reload; and the mobile drawer
  and FAB.
- **The native driver on a real emulator.** `src/dev/selftest.ts` opens
  whichever driver the platform chose, checks the seeded figures, writes a sale
  through a transaction, proves an over-stock sale rolls back, and reopens the
  database. CI boots an x86_64 emulator, installs the APK and reads the verdict
  from logcat — and fails the job if the app falls back to the WebAssembly
  driver on a device. Run it in a browser with `?selftest=1`.
- **The whole account flow, end to end**: first launch demands a manager
  account, rejects a sequential passcode and a mismatched confirmation, shows
  the recovery code once and refuses to continue until it is acknowledged; the
  owner adds an employee with a passcode and edits their abilities; that
  employee signs in, sees only their own screens, is refused a forbidden route
  typed into the address bar, and is not offered user management or data
  export; a wrong passcode is refused. Then: export an encrypted backup,
  fail to open it with the wrong passphrase, preview what it holds, restore it,
  and find the imported accounts working and the import in the audit trail.
- Accessibility: every interactive element has an accessible name, every table
  a caption, one `h1` per screen, and a visible focus ring on all 12 sampled
  tab stops. Touch targets are measured **in a touch context** — the 44px rule
  only applies under `pointer: coarse`, and measuring a mouse-driven desktop
  against it just reports the design's own dimensions — and all eight routes
  come back clean at 390px, with no horizontal scroll on any of them.
- The print stylesheet reduces the page to the tax invoice alone.

## Known gaps

- **Product photography.** The POS grid uses the design's striped placeholder;
  the schema has an `image_url` column ready for real images.
- **The QR is GCC/ZATCA-shaped** (base64 TLV, five fields) and generated on
  device. Confirm the field set against the tax authority the business actually
  files with before shipping.
- **The brand icon** is a raster crop with a white background. Ask the brand
  owner for a transparent SVG before release.
- **Restore is not merge.** Importing a backup replaces the receiving device.
  Two devices that both moved on cannot be reconciled automatically, and the
  app does not pretend otherwise; if a shop needs two tills writing at once,
  that needs a sync transport, not a bigger import button.
- **The passcode is a till-drawer lock, not a safe.** It stops the wrong person
  using an unlocked shared device. It does not stop someone holding the device
  and its key store — see the honest note above.
- **Tauri scaffolding** is documented above but not committed, since the
  generated platform folder belongs to whoever builds it. The Android project
  *is* committed, because CI builds the APK from it.

## Licence

Application code: see repository. Fonts are IBM Plex Sans Arabic and IBM Plex
Mono, licensed under the SIL Open Font License.
