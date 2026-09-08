# حسيب (Haseeb) — Build Spec & Task Brief for Claude Code

> **ابدأ من هنا.** هذا الملف وحده كافٍ لبناء التطبيق كاملاً. اقرأه بالكامل قبل كتابة أي كود.

## TASK (do this)

Build a production-ready, **offline-first cross-platform accounting & POS application** named **حسيب (Haseeb)** — mobile, web, and desktop — implementing **all ten screens** specified below, pixel-faithfully, fully **RTL Arabic**.

Work autonomously, in this order:

1. **Scaffold** the project with the stack in “Recommended Stack” (or the repo's existing stack if you were dropped into one — then follow its patterns instead).
2. **Design layer first**: create the token file (colors, type scale, spacing, radii, shadows from “Design Tokens”), the base primitives (Button ×4 variants, Card, Badge, StatTile, DataTable, Chip/FilterChip, Tabs, Toggle, RangeSlider, Timeline, PhoneShell-free responsive shell, TopBar, Sidebar/Drawer, BottomTabBar, FAB), and the RTL setup.
3. **Data layer**: local encrypted SQLite schema + repositories for: businessProfile, products, stockMovements, sales, saleLines, invoices, invoiceLines, orders (customer + supplier), customers (retail + wholesale), debts, payments, expenses, staff & permissions, auditLog, syncQueue. Every mutation writes an `auditLog` row. Seed with the exact sample data in this spec so screens look identical to the design on first run.
4. **Screens**, in this order: Onboarding → Dashboard → POS → Inventory → Debts → Invoices/Profits → Orders/Invoice print → Wholesale → General Management. (Screen J “Brand & Design System” is the spec reference — do **not** ship it as an app screen.)
5. **Mobile layouts** for every screen (bottom tab bar + FAB, ≥44px touch targets), and desktop/web layouts (sidebar rail).
6. **Add the states the design omits**: loading skeletons (`#F1F5F9`), empty states (13px `#64748B`), errors (`#FEF2F2` / `#B91C1C`), form validation.
7. **Tests** for money math, tax (14% VAT), tiered wholesale discounts, debt aging (paid / due-soon / overdue), and stock decrement on sale.
8. **README** in the repo: how to run on each platform, DB location, how to reset seed data.

### Non-negotiables
- **RTL everywhere**: `dir="rtl"`, logical properties only (`inset-inline-*`, `margin-inline-*`, `padding-inline-*`), mirrored tables and navigation. Never hardcode left/right.
- **Offline-first**: no network call is required for any feature. Encrypted local DB; optional encrypted sync is a queue + reconcile, surfaced in the header pill and Settings.
- **Fonts bundled locally** (IBM Plex Sans Arabic + IBM Plex Mono) — no runtime CDN, because the app must work offline.
- **Numbers**: format with a locale-aware formatter (`ar-EG`). The Arabic-Indic digits in this spec are display samples, not literals.
- **Colors**: use only the tokens in “Design Tokens”. No default framework blues, no purple/pink gradients.
- **Money**: integer minor units (piasters) internally; never floats.
- **Accessibility**: text contrast ≥4.5:1, focus rings on every interactive element, semantic roles on tables/tabs/toggles.

### Recommended Stack (if the repo is empty)
- **Flutter** (single codebase for iOS/Android/Web/Windows/macOS/Linux) + `drift` over SQLite + `sqlcipher` for encryption + `riverpod` for state. Locale `ar`, `textDirection: TextDirection.rtl`.
- Acceptable alternative: **React + TypeScript + Vite**, Tauri for desktop, Capacitor for mobile, `sql.js`/`better-sqlite3`/`op-sqlite` per platform, Zustand for state, CSS variables for tokens. Do **not** introduce a UI kit whose defaults fight these tokens (no unmodified Bootstrap/MUI theme).

### Definition of done
Every screen below renders with the seeded data, matches the specified colors/type/spacing/radii/shadows, works at 390px and at 1440px, functions with networking disabled, and passes the tests.

### Included reference files (optional)
`Haseeb.dc.html` (interactive prototype — open in a browser to see the intended result), `assets/haseeb-icon.png`, `assets/logo-full.png`. If you only have this markdown file, the spec below is sufficient; recreate the icon from `assets/logo-full.png` by cropping the circular emblem, or request the brand SVG.

---

## Overview
Haseeb is an **offline-first accounting / POS application** for small and medium retail businesses in the Arabic-speaking market. It covers business onboarding, an executive dashboard, general management (costs, permissions, audit), a live point-of-sale, invoices & profit analytics, wholesale management, a debt ledger, orders & tax invoices, and inventory/warehouse.

The entire product is **RTL Arabic**. Tagline: **حساباتك بدقة.. وأمان.**

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing intended look, layout, and behavior. They are **not production code to copy directly**.

The task is to **recreate these designs in the target codebase's existing environment** (React Native / Flutter / React + Vite / Electron / SwiftUI — whatever the app already uses), following its established patterns, component library, routing, and state management. If no codebase exists yet, choose an appropriate cross-platform stack (the product targets **mobile, web, and desktop** with a **local database**; e.g. Flutter + Drift/SQLite, or React + Tauri/Capacitor + SQLite) and implement the designs there.

The prototype is a single self-contained HTML file with a left rail that switches between screens. In a real app each of those is a **route/screen**, not a switch in one component.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, radii, shadows, and copy are final. Recreate pixel-faithfully using the codebase's existing primitives. All numeric copy in the design uses **Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩)** — in production, format numbers with a locale-aware formatter (`ar-EG` with `latn` or `arab` numbering per product decision), do not hardcode.

---

## Global Shell

### Direction & language
- `dir="rtl"` on the app root. All layouts mirror: sidebar on the **right**, table columns read right-to-left, `inset-inline-*` / logical properties everywhere instead of left/right.

### Top bar (desktop/web)
- Height ~64px, background `#0F172A`, text `#F8FAFC`, sticky, `box-shadow: 0 10px 30px -18px rgba(15,23,42,.8)`, padding `12px 22px`, `display:flex; align-items:center; gap:18px`.
- **Brand block** (right side in RTL): 40×40 rounded-13px tile, background `#F8FAFC`, containing the app icon (`assets/haseeb-icon.png`, `object-fit:contain`, 3px padding), inner shadow `inset 0 1px 0 rgba(255,255,255,.6)` + `0 6px 16px -8px rgba(2,6,23,.9)`. Beside it: “حسيب” 17px/600 and tagline 10.5px `#94A3B8`.
- **Search**: centered, max-width 400px, background `rgba(248,250,252,.07)`, border `1px solid rgba(248,250,252,.12)`, radius 14px, padding `9px 14px`, `backdrop-filter: blur(8px)`. Placeholder: «ابحث عن فاتورة، عميل، أو صنف…».
- **Sync/storage pill**: `rgba(16,185,129,.14)` bg, `rgba(16,185,129,.3)` border, pill radius, 7px dot `#10B981` with a 2.4s pulse animation (`opacity 1→.3`, `scale 1→.8`), label «قاعدة محلية · مزامنة مشفّرة» 11.5px `#A7F3D0`.
- **User block**: name 12.5px/500, role 10.5px `#94A3B8`, 34×34 avatar tile radius 11px bg `#1E293B`; separated by a 1px divider `rgba(248,250,252,.14)`.

### Sidebar (desktop/web)
- Width 228px, background `#F8FAFC`, `border-inline-start: 1px solid #E2E8F0` (visually the left edge in RTL), padding `16px 12px`.
- Section label «الشاشات» 10px/600 `#94A3B8`, letter-spacing 1.4px.
- Items: `padding:10px 11px; border-radius:12px; gap:11px`. Leading 8×8 rounded-3px dot. Active: bg `#EAF2EE`, text `#0F172A` 600, dot in the screen's accent color. Inactive: transparent bg, text `#475569` 400, dot `#CBD5E1`. Hover: bg `#EEF2F6`.
- Screen list and dot colors:
  | Screen | Label | Dot |
  |---|---|---|
  | brand | الهوية والنظام | `#0F172A` |
  | onboarding | تسجيل المنشأة | `#64748B` |
  | dashboard | لوحة التحكم | `#059669` |
  | manage | الإدارة العامة | `#0F172A` |
  | pos | البيع المباشر | `#10B981` |
  | finance | الفواتير والأرباح | `#059669` |
  | wholesale | بيع الجملة | `#0EA5A0` |
  | debts | دفتر الديون | `#DC2626` |
  | orders | الطلبات والفواتير | `#F59E0B` |
  | inventory | المخزن | `#475569` |
- **Storage card** pinned to the bottom: bg `#0F172A`, radius 14px, padding 13px, title «التخزين المحلي» 12px/600 `#F8FAFC`, body 11px `#CBD5E1` line-height 1.7, a 5px progress track `rgba(248,250,252,.14)` with a 38% `#10B981` fill, caption «١.٢ غيغابايت من ٣.٢ مستخدمة» 10.5px `#94A3B8`.

### Content area
- `padding: 22px 24px 40px`, page background `#EEF2F6`.
- Page header pattern: `h1` 23px/600 letter-spacing −0.2px; sub-line 13px `#64748B` with 5px top margin.

---

## Screens

### A. Onboarding & Business Registration (تسجيل المنشأة)
Two panels, `grid-template-columns: repeat(auto-fit, minmax(340px,1fr)); gap:18px`.

**Left (brand panel)** — bg `#0F172A`, radius 22px, padding 32px, min-height 500px, `position:relative; overflow:hidden`.
- Decorative glow: absolutely positioned 240×240 circle, top −70 / inline-end −70, `radial-gradient(circle at 40% 40%, rgba(16,185,129,.32), transparent 68%)`.
- 76×76 radius-22 light tile with the app icon, shadow `0 18px 40px -18px rgba(2,6,23,.9)`.
- H2 «أهلاً بك في حسيب» 30px/600, letter-spacing −0.4px.
- Body 15px `#94A3B8`, line-height 1.8, max-width 360px: «حساباتك بدقة.. وأمان. أنشئ حساب منشأتك في دقيقة، وستعمل بياناتك محلياً على جهازك دون الحاجة لإنترنت.»
- Three bullets, each with a 22×22 radius-8 chip (`rgba(16,185,129,.16)` bg, `rgba(16,185,129,.35)` border) holding a 7×7 `#10B981` square; label 13px `#CBD5E1`:
  1. يعمل دون إنترنت — قاعدة بيانات محلية مشفّرة
  2. نفس الحساب على الجوال والويب وسطح المكتب
  3. مزامنة مشفّرة اختيارية عند الحاجة

**Right (form panel)** — bg `#fff`, border `1px solid #E7ECF2`, radius 22px, padding 26px, shadow `0 1px 2px rgba(15,23,42,.04), 0 24px 50px -32px rgba(15,23,42,.45)`.
- Step indicator: three 5px pills, `flex:1` each — active `#059669`, inactive `#CBD5E1` — plus «١ / ٣» 11.5px mono `#94A3B8`.
- Title «تسجيل المنشأة» 19px/600; sub «هذه البيانات تظهر على فواتيرك وتقاريرك.» 13px `#64748B`.
- Field style: label 12.5px/600, 7px bottom margin; input box `border:1px solid #E2E8F0; background:#F8FAFC; border-radius:13px; padding:13px 15px; font-size:13.5px`.
- Fields: **اسم الشركة/المحل التجاري** (text), **نوع النشاط التجاري** (chip group), **العملة** (select, e.g. «جنيه مصري — ج.م»), **رقم الجوال** (tel, mono font).
- Business-type chips: `padding:9px 15px; radius:12px; font-size:12.5px/500`. Selected: bg + border `#059669`, text `#fff`. Unselected: bg `#F8FAFC`, border `#E2E8F0`, text `#475569`. Options: بقالة / سوبرماركت · مخبز · ملابس · قطع غيار · مطعم / كافيه.
- **Local DB confirmation** callout: bg `#ECFDF5`, border `1px solid #A7F3D0`, radius 15px, padding 15px, 20×20 `#059669` checkbox tile; title «تأكيد إنشاء قاعدة البيانات المحلية» 13px/600 `#065F46`; body 12px `#047857` line-height 1.7.
- Primary CTA full-width: bg `#0F172A`, text `#F8FAFC` 14.5px/600, padding 15px, radius 15px, shadow `0 14px 30px -14px rgba(15,23,42,.8)`; hover `#1E293B`; active `translateY(1px)`. Label «إنشاء المنشأة والمتابعة».

### B. Executive Dashboard (لوحة التحكم الرئيسية)
Header sub-line: «ملخّص الأداء المالي · الأسبوع الحالي حتى ٨ سبتمبر ٢٠٢٦». Header actions: secondary «تصدير التقرير», primary «+ بيع جديد».

**KPI grid** — `repeat(auto-fit, minmax(196px,1fr)); gap:14px`. Card: bg `#fff`, border `1px solid #E7ECF2`, radius 16px, padding `16px 17px`, shadow `0 1px 2px rgba(15,23,42,.04), 0 10px 26px -16px rgba(15,23,42,.18)`.
- Label 12.5px/500 `#64748B`; delta badge 11px/600 radius 8px (positive `#ECFDF5`/`#047857`, negative `#FEF2F2`/`#B91C1C`); value 25px/600 mono, letter-spacing −0.5px; unit 12px `#94A3B8`; 4px progress track `#F1F5F9` with a colored fill.
- Six KPIs: إجمالي المبيعات ٤٨,٢٠٠ (+١٢٪, 82%, `#059669`) · دخل اليوم ٣,٢٤٠ (+٥٪, 58%, `#10B981`) · محصول الأسبوع ١٨,٧٥٠ (+٩٪, 71%, `#059669`) · الأرباح الإجمالية ١١,٤٦٠ (+٧٪, 64%, `#0F172A`) · صافي الربح ٧,٩٨٠ (+٣٪, 46%, `#0F172A`) · إجمالي الديون ١٢,٤٠٠ (−٤٪, 34%, `#DC2626`). Unit «ج.م».

**Charts row** — `minmax(0,2fr) minmax(0,1fr); gap:14px`.
- **Area/line chart card** «المبيعات مقابل الأرباح» / «آخر ٧ أيام · بالجنيه». Legend: المبيعات `#059669`, الربح `#0F172A`.
  - SVG viewBox `0 0 640 226`, height 236. Horizontal gridlines at y = 20, 64, 108, 152, 196 in `#EEF2F6`.
  - X positions: `26 + i * ((640-52)/6)`; Y mapping: `196 - (v/62)*176`.
  - Sales series `[26,34,30,46,38,58,52]`: 2.5px `#059669` stroke, round caps/joins, plus an area fill using a vertical gradient `#10B981` 0.30 → 0.02.
  - Profit series `[7,10,8,13,11,17,15]`: 2px `#0F172A` stroke, `stroke-dasharray: 5 5`.
  - Data dots on the sales line: r=3.5, `#fff` fill, 2px `#059669` stroke.
  - X labels 11px `#94A3B8` at y=221: السبت، الأحد، الاثنين، الثلاثاء، الأربعاء، الخميس، الجمعة.
- **Donut card** «توزيع المبيعات» / «حسب قناة البيع». 152px circle with `conic-gradient(#0F172A 0 42%, #059669 42% 70%, #10B981 70% 88%, #CBD5E1 88% 100%)`, 98px white hole showing «٤٨.٢ك» 19px/600 mono and «إجمالي الأسبوع» 10.5px `#94A3B8`. Legend rows: تجزئة بالمحل ٤٢٪، جملة ٢٨٪، طلبات مسبقة ١٨٪، أخرى ١٢٪.

**Quick actions** — `repeat(auto-fit, minmax(228px,1fr))`. Card: radius 16px, padding 17px, 42×42 radius-13 icon tile, title 14.5px/600, desc 11.5px; hover `translateY(-2px)` over 160ms.
1. **بيع جديد** — «فتح شاشة الكاشير», dark card (`#0F172A` bg, `#F8FAFC` title, `#94A3B8` desc, icon tile `rgba(16,185,129,.18)` / `#10B981`).
2. **تسجيل دين** — «إضافة مبلغ على عميل», white card, icon tile `#FEF2F2` / `#B91C1C`.
3. **إصدار فاتورة** — «فاتورة ضريبية مع QR», white card, icon tile `#ECFDF5` / `#047857`.

### C. General Management (الإدارة العامة)
Sub-line: «الصحة المالية · التكاليف التشغيلية · الصلاحيات وسجل التدقيق».

- **Financial health panel** (dark, `minmax(0,1.2fr)`): score «٨٢» 52px/600 mono `#10B981` + «من ١٠٠ · وضع مستقر» 13px `#A7F3D0`. Four metered rows (label `#CBD5E1` / value mono `#F8FAFC`, 5px track `rgba(248,250,252,.12)`): السيولة النقدية ٨٨٪ (88%, `#10B981`) · هامش الربح ٢٣.٨٪ (64%, `#059669`) · نسبة الديون للمبيعات ٢٥.٧٪ (26%, `#F59E0B`) · دوران المخزون ٤.٢× (72%, `#CBD5E1`).
- **Operating expense log** (white card): rows with a 9×9 color chip, label, share %, mono amount, `1px solid #F1F5F9` separators. إيجار المحل ٤,٠٠٠ (٤٢٪, `#0F172A`) · رواتب الموظفين ٣,٢٠٠ (٣٤٪, `#059669`) · كهرباء ومياه ١,٠٥٠ (١١٪, `#10B981`) · نقل وتوصيل ٧٨٠ (٨٪, `#F59E0B`) · صيانة ومتنوعة ٤٥٠ (٥٪, `#CBD5E1`). Footer «إجمالي المصروفات» / «٩,٤٨٠» 20px/600 above a dashed `#E2E8F0` rule.
- **Employee permissions** list: 34×34 initial tile, name 13px/600, role 11.5px `#94A3B8`, scope badge, and a 38×22 toggle (`#059669` on with knob at inline-start 19px; `#CBD5E1` off with knob at 3px). Rows: ندى مصطفى — كاشير — وردية صباحية — بيع فقط (on) · طارق حسن — أمين مخزن — مخزن + توريد (on, badge `#ECFDF5`/`#047857`) · سارة عادل — محاسبة — تقارير مالية (on) · يوسف كامل — مندوب جملة — موقوف (off, badge `#FEF2F2`/`#B91C1C`).
- **Audit trail**: «كل عملية تُسجَّل محلياً بختم زمني غير قابل للتعديل». Entries = text 12.5px + `who · timestamp` 11px mono `#94A3B8`, with a 7px `#94A3B8` bullet. Five sample entries covering a price edit, an invoice-line deletion, a stock adjustment, a permission suspension, and an encrypted local backup.

### D. Point of Sale (البيع المباشر)
Sub-line «نقطة بيع سريعة · وضع الكاشير». Layout `minmax(0,1.7fr) minmax(0,1fr)`.

- **Live counters** in the header (dark tiles, radius 14px, `10px 16px`, min-width 148px): المصاري اليومية ٣,٢٤٠ · محصول الأسبوع ١٨,٧٥٠ · نسبة الربح ٢٤٪ (value `#10B981`).
- **Scanner bar**: white card radius 16px padding 13px; inner field bg `#F8FAFC` border `#E2E8F0` radius 12px with a 5-bar barcode glyph and placeholder «امسح الباركود أو اكتب اسم الصنف…»; green button «تشغيل الماسح» (`#059669`, hover `#047857`, shadow `0 8px 18px -10px rgba(5,150,105,.9)`).
- **Item grid**: `repeat(auto-fill, minmax(138px,1fr)); gap:11px`. Card radius 15px padding 12px; 60px striped image placeholder (`repeating-linear-gradient(135deg,#F1F5F9 0 7px,#E8EEF4 7px 14px)` with the caption «صورة الصنف» 9.5px mono) — replace with real product photos; name 13px/500; price 13px/600 `#059669` mono; stock 10.5px `#94A3B8`. Hover: border `#10B981` + `translateY(-2px)`.
- **Live sales log table**: columns `2fr .7fr 1.3fr 1fr` = الصنف · الكمية · وقت وتاريخ البيع · طريقة الدفع. Header row bg `#F8FAFC`, 11.5px/600 `#64748B`. Payment badges: نقدي `#ECFDF5`/`#047857`, محفظة & بطاقة `#EEF2F6`/`#334155`, آجل `#FEF2F2`/`#B91C1C`. Card header carries «يُحدَّث تلقائياً» 11.5px `#059669`.
- **Cart panel** (dark, sticky at `top:82px`, radius 18px): title «الفاتورة الحالية» + mono invoice no; line items with a stepper (`− qty +`, plus sign `#10B981`) inside a `rgba(248,250,252,.07)` radius-10 pill; totals block (المجموع الفرعي ٤٨٠.٠٠ / الضريبة ١٤٪ ٦٧.٢٠ / خصم −٢٠.٠٠ in `#10B981`); dashed divider; «الإجمالي المستحق» with 26px/600 mono total ٥٢٧.٢٠; two buttons — glass secondary «تسجيل كدين» (`rgba(248,250,252,.06)` + `backdrop-filter: blur(6px)`) and «إتمام الدفع» (`#10B981` bg, `#04241A` text, 700).

### E. Invoices & Profits (الفواتير والأرباح)
- **Filter bar** (white card radius 15px): «الفترة» chips — اليوم · هذا الأسبوع (default) · هذا الشهر · مخصص (selected = `#0F172A` bg / `#F8FAFC`); divider; «الحالة» badges — مدفوعة `#ECFDF5`/`#047857`, معلّقة `#FFFBEB`/`#92400E`, متأخرة `#FEF2F2`/`#B91C1C`, each with a leading dot.
- **Four sub-cards** (`repeat(auto-fit,minmax(212px,1fr))`), each with a 3px colored top border: مبلغ الفواتير ٦٢,٤٠٠ («٤٨ فاتورة في الفترة», `#0F172A`) · مبلغ البيع الإجمالي ٤٨,٢٠٠ («بعد المرتجعات», `#059669`) · الأرباح الإجمالية ١١,٤٦٠ («هامش ٢٣.٨٪», `#10B981`) · صافي الربح ٧,٩٨٠ («بعد ٩,٤٨٠ مصروفات», `#475569`). Value 26px/600 mono.
- **Tabs**: كل الفواتير · التجزئة · الجملة. Active = 600 weight, `#0F172A` text, 2px `#059669` bottom border; inactive `#94A3B8`.
- **Invoice table**: columns `1.1fr 1.4fr 1fr 1fr .9fr .9fr` = رقم الفاتورة · العميل · التاريخ · المبلغ · الربح · الحالة. Invoice no + date + amounts in mono; profit column `#059669`/600; row hover `#F8FAFC`. Six sample rows INV-2476…INV-2481 with mixed statuses.

### F. Wholesale (بيع الجملة)
- **Wholesale customer list**: 36×36 tile `#ECFDF5` bg / `#A7F3D0` border / `#047857` text; name 13.5px/600; meta «city · حد أدنى {MOQ}»; tier badge — شريحة فضية `#F8FAFC`/`#475569`, ذهبية `#FFFBEB`/`#92400E`, بلاتينية `#EEF2F6`/`#334155`.
- **Volume tiers** (`repeat(auto-fit,minmax(140px,1fr))`): فضية ٥٠–١٤٩ وحدة → ٥٪ (`#F8FAFC`/`#E2E8F0`/`#334155`); ذهبية ١٥٠–٢٩٩ → ٩٪ (`#FFFBEB`/`#FDE68A`/`#92400E`); بلاتينية ٣٠٠+ → ١٤٪ (`#ECFDF5`/`#A7F3D0`/`#047857`). Discount value 22px/600 mono, caption «خصم عن سعر التجزئة».
- **Custom discount control**: `#F8FAFC` panel, label «خصم مخصّص لهذه الفاتورة», live value 15px/600 `#059669` mono, range input 0–30 (`accent-color:#059669`), default 12٪. Changing it should recompute line discounts and totals in production.
- **Wholesale invoice builder** table: columns `2fr 1fr 1fr 1fr 1fr` = الصنف · الكمية · سعر الوحدة · الخصم · الإجمالي; discount cell `#059669`; header action button «إصدار الفاتورة» (`#0F172A`).

### G. Debt Ledger (دفتر الديون)
- **Four stat cards** (`repeat(auto-fit,minmax(186px,1fr))`), tinted per semantic: مستحق لك (مدينون) ١٢,٤٠٠ / ١٨ عميلاً — `#FEF2F2` bg, `#FECACA` border, `#B91C1C` value; مستحق عليك (دائنون) ٣,٨٥٠ / ٤ موردين — `#ECFDF5`/`#A7F3D0`/`#047857`; متأخر السداد ٥,٢٠٠ / ٦ عملاء — `#FFFBEB`/`#FDE68A`/`#B45309`; محصّل هذا الشهر ٩,٦٤٠ / ٢٣ سداداً — white/`#E7ECF2`/`#0F172A`.
- **Customer list**: 38×38 initial tile; name 13.5px/600; meta «phone · آخر سداد {date}»; amount mono/600 colored by status; status tag — **متأخر** `#FEF2F2`/`#DC2626`, **قريب الاستحقاق** `#FFFBEB`/`#B45309`, **مسدَّد** `#ECFDF5`/`#059669` (red / amber / green as specified).
- **Customer profile panel**: 52×52 `#0F172A` avatar; name 15.5px/600; meta «عميل تجزئة · منذ ٢٠٢٤»; outstanding-balance callout (`#FEF2F2`/`#FECACA`, amount 27px/600 `#B91C1C`, note «متأخر ١٢ يوماً عن تاريخ الاستحقاق»); **سجل السدادات** timeline (green dot = payment, red dot = new debt, mono date + amount); two reminder buttons — «تذكير واتساب» (`#059669`) and «تذكير SMS» (secondary). In production these open WhatsApp deep links (`https://wa.me/<msisdn>?text=…`) and the SMS composer (`sms:`), with a templated Arabic reminder message.

### H. Orders & Invoices (الطلبات والفواتير)
- **Tabs**: طلبات العملاء · طلبات الموردين.
- **Order rows**: 8×34 rounded status bar in the status color; title 13.5px/600 («طلب #ORD-882 — أحمد سعيد» / «أمر توريد #PO-311 — الشرق للتوزيع»); meta 11.5px mono `#94A3B8` («٣ أصناف · ٠٨/٠٩ ٠٩:٤١ · تسليم بالمحل»); status badge — مكتمل/مستلم green or slate, قيد التحضير/بانتظار الشحن amber, ملغي red; amount 14px/600 mono, min-width 78px, left-aligned.
- **Tax invoice preview** (printable/shareable): white card radius 18px padding 20px, shadow `0 18px 40px -26px rgba(15,23,42,.4)`.
  - Header: 38×38 logo tile + «مؤسسة النور التجارية» 14px/600 + «س.ت ٤٤٨٢٩١ · الرقم الضريبي ٣٠٢١٩٩٤٨٧» 11px `#94A3B8`; right side «فاتورة ضريبية» + mono invoice number. Dashed `#E2E8F0` rule.
  - Meta row: العميل / التاريخ / الاستحقاق.
  - Line items: name · ×qty (mono `#94A3B8`) · total (mono 600).
  - Footer: a **72×72 QR code** (placeholder in the prototype — generate a real ZATCA/tax-authority-compliant QR in production) with `box-shadow: 0 0 0 4px #fff, 0 0 0 5px #E2E8F0`; totals — الإجمالي قبل الضريبة ١,٢٤٠.٠٠ / ضريبة القيمة المضافة ١٤٪ ١٧٣.٦٠ / المستحق ١,٤١٣.٦٠ (20px/600 `#059669`).
  - Actions: «طباعة» (`#059669`) and «مشاركة PDF» (secondary).

### I. Inventory & Warehouse (المخزن)
- Header alert pill: bg `#FFFBEB`, border `#FDE68A`, 9×9 `#F59E0B` diamond, «إنذار نفاد الكمية — ٤ أصناف» 12.5px/600 `#92400E`.
- Category chips: الكل · بقالة · مشروبات · ألبان · منظفات (selected `#0F172A`).
- **Stock table**: columns `1.6fr .8fr .9fr .9fr 1fr` = الصنف (name + SKU 11px mono `#94A3B8`) · الكمية · التكلفة · سعر البيع · الحالة. Quantity color: normal `#0F172A`, low `#B45309`, critical `#B91C1C`. Status badges: متوفر `#ECFDF5`/`#047857`, كمية منخفضة `#FFFBEB`/`#92400E`, إنذار نفاد `#FEF2F2`/`#B91C1C`.
- **Stock movement timeline**: 10×10 rounded-3 dot + 1px `#E2E8F0` connector; title 12.5px/500; meta «actor/supplier · date time» 11.5px `#94A3B8`; delta mono/600 aligned to the far edge (green for inbound, dark for sales, amber for adjustments).

### J. Brand & Design System screen (الهوية ونظام التصميم)
Reference screen, not a product feature — keep it out of the shipped app, use it as the spec.
- Full logo lockup, app-icon tiles (light `#F8FAFC` and dark `#0F172A`, radius 20px, 74×74).
- Color swatch grid (70px tiles radius 14px).
- Type specimen and the four button styles.
- **Mobile mockups** (see below).

---

## Mobile (390×844 target; mockups shown at 290×580 in the prototype)
Three screens are specified:
1. **Home/dashboard** — dark header block with rounded bottom corners (`border-radius: 0 0 22px 22px`): greeting, «دخل اليوم» + 30px mono value, two mini-stat tiles (محصول الأسبوع, نسبة الربح with `rgba(16,185,129,.14)` tint). Below: «إجراءات سريعة» 2-up cards, then a recent-activity list. **Floating action button**: 54×54, radius 19px, `rgba(5,150,105,.9)` + `backdrop-filter: blur(10px)` + `1px solid rgba(248,250,252,.28)`, shadow `0 16px 30px -12px rgba(5,150,105,.95)`, centered above the tab bar. **Tab bar**: `rgba(248,250,252,.9)` + `blur(12px)`, top border `#E2E8F0`, 5 items (الرئيسية · البيع · الديون · المخزن · المزيد), active `#0F172A`/600.
2. **POS** — sticky search/scan header, 2-column item grid, dark bottom sheet (radius `22px 22px 0 0`) with item count, total 25px mono, and a full-width «إتمام الدفع» button.
3. **Debt ledger** — two summary tiles (لك / عليك), customer cards with a trailing status dot, bottom action pair.

**Touch targets must be ≥44px** in the real build (the mockups are scaled down).

---

## Interactions & Behavior
- **Navigation**: sidebar item click → screen switch (routes in production). Mobile: bottom tab bar + FAB → new sale.
- **Filters/tabs/chips**: single-select, immediate re-filter; active styling as specified above.
- **Wholesale discount slider**: 0–30, live value label, recompute totals.
- **POS**: barcode scan or search adds a line; qty steppers ± ; «تسجيل كدين» posts the sale to the debt ledger instead of taking payment; «إتمام الدفع» closes the sale, appends to the live log, and increments the daily/weekly/margin counters.
- **Hover**: cards `translateY(-2px)` / 160ms ease; table rows tint `#F8FAFC`; buttons darken one step.
- **Active**: primary buttons `translateY(1px)`.
- **Sync dot**: 2.4s infinite ease-in-out pulse.
- **Reminders**: WhatsApp / SMS deep links with an Arabic templated message.
- **Print/PDF**: the tax invoice card is the print artifact — implement a real print stylesheet or PDF renderer.
- **Responsive**: two-column screen layouts collapse to one below ~900px; grids use `auto-fit`/`minmax` and already reflow. Sidebar becomes a drawer or bottom tab bar on mobile.
- **Loading/empty/error states are NOT designed** — add them following the same card/typography language (skeletons in `#F1F5F9`, empty state with a 13px `#64748B` line, errors in the `#FEF2F2`/`#B91C1C` pair).

## State Management
Per-screen local state in the prototype; in production expect:
- `activeScreen` / route.
- Filters: `dateRange`, `invoiceStatus`, `financeTab`, `orderTab`, `inventoryCategory`, `businessType`.
- `wholesaleDiscount` (number 0–30).
- POS: `cart[]` (product, qty, unitPrice), `currentInvoiceNo`, live counters derived from today's/this week's sales.
- Data domains, all persisted to the **local encrypted DB** and readable offline: business profile, products/stock, stock movements, sales, invoices, orders (customer + supplier), customers (retail + wholesale), debts & payments, expenses, staff & permissions, audit log.
- Optional encrypted sync: queue local mutations, reconcile on connect; surface state in the header pill and Settings.

## Design Tokens

**Color**
| Token | Hex |
|---|---|
| ink / primary | `#0F172A` |
| ink-2 (hover) | `#1E293B` |
| brand navy (logo) | `#1E3A67` |
| emerald (action) | `#059669` |
| emerald-dark (hover) | `#047857` |
| emerald-deep | `#065F46` |
| mint (accent) | `#10B981` |
| mint-light | `#34D399` |
| mint tint bg | `#ECFDF5` |
| mint tint border | `#A7F3D0` |
| mint tint text | `#047857` |
| page bg | `#EEF2F6` |
| surface / raised | `#FFFFFF` |
| surface-alt | `#F8FAFC` |
| border | `#E2E8F0` |
| border-card | `#E7ECF2` |
| divider | `#F1F5F9` |
| text-muted | `#64748B` |
| text-subtle | `#94A3B8` |
| text-slate | `#475569` / `#334155` |
| warning bg / border / text | `#FFFBEB` / `#FDE68A` / `#92400E` |
| warning solid | `#F59E0B` (dark text `#B45309`) |
| danger bg / border / text | `#FEF2F2` / `#FECACA` / `#B91C1C` |
| danger solid | `#DC2626` |
| on-mint text | `#04241A` |

**Typography** — `IBM Plex Sans Arabic` (300/400/500/600/700) for all UI; `IBM Plex Mono` (400/500) for numerals, IDs, SKUs, and timestamps.
| Role | Size / weight |
|---|---|
| Page title | 23px / 600, ls −0.2px |
| Section title | 14.5–15px / 600 |
| Hero (onboarding) | 30–31px / 600, ls −0.4px |
| KPI value | 25–27px / 600 mono, ls −0.5px |
| Body | 13px / 400, line-height 1.7–1.8 |
| Table cell | 12.5px |
| Label / meta | 11–12px |
| Badge | 11px / 600 |
| Micro / mono caption | 10.5px |

**Spacing** — 3, 5, 7, 9, 11, 13, 14, 16, 18, 20, 22, 26, 32 px. Grid gap 14px; card padding 16–20px; table row padding 13px vertical / 16–18px horizontal (9px in compact density).

**Radius** — 8px badges · 10–12px small controls · 13px buttons/inputs · 14–16px cards & tiles · 18px large panels · 20–22px hero panels · 30–38px phone frames · 999px pills.

**Shadow**
- card: `0 1px 2px rgba(15,23,42,.04), 0 10px 26px -16px rgba(15,23,42,.18)`
- raised panel: `0 18px 40px -26px rgba(15,23,42,.4)`
- modal/hero: `0 24px 50px -32px rgba(15,23,42,.45)`
- dark button: `0 8px 20px -10px rgba(15,23,42,.7)`
- green button: `0 8px 18px -10px rgba(5,150,105,.9)`
- FAB: `0 16px 30px -12px rgba(5,150,105,.95)`
- phone frame: `0 34px 60px -30px rgba(15,23,42,.75)`

**Motion** — 160ms ease for hover transforms and background changes; 2.4s infinite ease-in-out for the sync pulse.

## Assets
- `assets/logo-full.png` — full Haseeb lockup (emblem + حسيب/HASEEB + tagline), user-supplied. Used on the brand screen.
- `assets/haseeb-icon.png` — 400×400 emblem-only crop of the above, used as the app icon in the header, invoice header, onboarding hero, and icon tiles. Ask the brand owner for a **transparent-background SVG/PNG** before shipping; the current file has a white background and is a raster crop.
- Product images are **striped placeholders** in the prototype — supply real photography or a category-icon fallback.
- The invoice QR is a **checkerboard placeholder** — generate a real QR at runtime.
- Fonts: IBM Plex Sans Arabic + IBM Plex Mono (Google Fonts, OFL) — bundle locally for the offline-first requirement.

## Files
- `Haseeb.dc.html` — the full interactive prototype (all ten screens, RTL, live filters/tabs/slider). Open it in a browser; use the right-hand rail to move between screens.
- `assets/haseeb-icon.png`, `assets/logo-full.png` — brand assets.
