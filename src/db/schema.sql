-- =====================================================================
-- حسيب — local schema
--
-- One SQLite file, held encrypted at rest. Every mutating repository
-- method writes an `audit_log` row and a `sync_queue` row in the same
-- transaction as the change itself, so the ledger can never disagree with
-- what actually happened.
--
-- All money columns are INTEGER piasters. All timestamps are ISO-8601
-- strings in the device's local time.
-- =====================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS business_profile (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  name              TEXT    NOT NULL,
  business_type     TEXT    NOT NULL,
  currency_code     TEXT    NOT NULL DEFAULT 'EGP',
  currency_label    TEXT    NOT NULL DEFAULT 'ج.م',
  phone             TEXT    NOT NULL DEFAULT '',
  commercial_reg    TEXT    NOT NULL DEFAULT '',
  tax_number        TEXT    NOT NULL DEFAULT '',
  vat_rate          REAL    NOT NULL DEFAULT 14,
  onboarded_at      TEXT,
  created_at        TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id             TEXT PRIMARY KEY,
  sku            TEXT NOT NULL UNIQUE,
  barcode        TEXT,
  name           TEXT NOT NULL,
  category_id    TEXT REFERENCES categories (id),
  cost_piasters  INTEGER NOT NULL,
  price_piasters INTEGER NOT NULL,
  qty_on_hand    INTEGER NOT NULL DEFAULT 0,
  low_threshold  INTEGER NOT NULL DEFAULT 20,
  crit_threshold INTEGER NOT NULL DEFAULT 10,
  image_url      TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode);

CREATE TABLE IF NOT EXISTS stock_movements (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products (id),
  kind          TEXT NOT NULL CHECK (kind IN ('purchase','sale','return','adjustment')),
  qty_delta     INTEGER NOT NULL,
  qty_after     INTEGER NOT NULL,
  actor         TEXT NOT NULL DEFAULT '',
  counterparty  TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  occurred_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_movements_time ON stock_movements (occurred_at DESC);

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('retail','wholesale','supplier')),
  phone         TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  tier          TEXT CHECK (tier IN ('silver','gold','platinum')),
  min_order_qty INTEGER NOT NULL DEFAULT 0,
  since_year    INTEGER,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_kind ON customers (kind);

CREATE TABLE IF NOT EXISTS sales (
  id                TEXT PRIMARY KEY,
  invoice_no        TEXT NOT NULL UNIQUE,
  customer_id       TEXT REFERENCES customers (id),
  channel           TEXT NOT NULL CHECK (channel IN ('retail','wholesale','preorder','other')),
  payment_method    TEXT NOT NULL CHECK (payment_method IN ('cash','wallet','card','credit')),
  subtotal_piasters INTEGER NOT NULL,
  discount_piasters INTEGER NOT NULL DEFAULT 0,
  vat_piasters      INTEGER NOT NULL DEFAULT 0,
  total_piasters    INTEGER NOT NULL,
  profit_piasters   INTEGER NOT NULL DEFAULT 0,
  vat_rate          REAL    NOT NULL DEFAULT 14,
  occurred_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_time ON sales (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales (customer_id);

CREATE TABLE IF NOT EXISTS sale_lines (
  id                TEXT PRIMARY KEY,
  sale_id           TEXT NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  product_id        TEXT NOT NULL REFERENCES products (id),
  name_snapshot     TEXT NOT NULL,
  qty               INTEGER NOT NULL,
  unit_piasters     INTEGER NOT NULL,
  cost_piasters     INTEGER NOT NULL,
  discount_percent  REAL    NOT NULL DEFAULT 0,
  discount_piasters INTEGER NOT NULL DEFAULT 0,
  total_piasters    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_lines_sale ON sale_lines (sale_id);

CREATE TABLE IF NOT EXISTS invoices (
  id                TEXT PRIMARY KEY,
  invoice_no        TEXT NOT NULL UNIQUE,
  sale_id           TEXT REFERENCES sales (id),
  customer_id       TEXT REFERENCES customers (id),
  kind              TEXT NOT NULL CHECK (kind IN ('retail','wholesale')),
  status            TEXT NOT NULL CHECK (status IN ('paid','pending','overdue')),
  issued_at         TEXT NOT NULL,
  due_at            TEXT,
  subtotal_piasters INTEGER NOT NULL,
  discount_piasters INTEGER NOT NULL DEFAULT 0,
  vat_piasters      INTEGER NOT NULL DEFAULT 0,
  total_piasters    INTEGER NOT NULL,
  profit_piasters   INTEGER NOT NULL DEFAULT 0,
  qr_payload        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_invoices_issued ON invoices (issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id             TEXT PRIMARY KEY,
  invoice_id     TEXT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  product_id     TEXT REFERENCES products (id),
  name_snapshot  TEXT NOT NULL,
  qty            INTEGER NOT NULL,
  unit_piasters  INTEGER NOT NULL,
  total_piasters INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines (invoice_id);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  order_no       TEXT NOT NULL UNIQUE,
  direction      TEXT NOT NULL CHECK (direction IN ('customer','supplier')),
  counterparty_id TEXT REFERENCES customers (id),
  counterparty_name TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('completed','preparing','awaitingShipment','received','cancelled')),
  fulfilment     TEXT NOT NULL DEFAULT '',
  item_count     INTEGER NOT NULL DEFAULT 0,
  summary        TEXT NOT NULL DEFAULT '',
  total_piasters INTEGER NOT NULL,
  placed_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_direction ON orders (direction, placed_at DESC);

CREATE TABLE IF NOT EXISTS debts (
  id                 TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL REFERENCES customers (id),
  invoice_id         TEXT REFERENCES invoices (id),
  direction          TEXT NOT NULL CHECK (direction IN ('receivable','payable')),
  principal_piasters INTEGER NOT NULL,
  opened_at          TEXT NOT NULL,
  due_at             TEXT NOT NULL,
  note               TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_debts_customer ON debts (customer_id);

CREATE TABLE IF NOT EXISTS payments (
  id             TEXT PRIMARY KEY,
  debt_id        TEXT REFERENCES debts (id) ON DELETE CASCADE,
  customer_id    TEXT NOT NULL REFERENCES customers (id),
  amount_piasters INTEGER NOT NULL,
  method         TEXT NOT NULL CHECK (method IN ('cash','wallet','card','transfer')),
  paid_at        TEXT NOT NULL,
  note           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments (customer_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS expenses (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  amount_piasters INTEGER NOT NULL,
  color           TEXT NOT NULL DEFAULT '#0F172A',
  period          TEXT NOT NULL,
  recorded_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_period ON expenses (period);

-- Formal accounting ledger. Entries are immutable; correcting an operation
-- is done by posting a reversing entry (for example a credit note).
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  account_type   TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  active         INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO ledger_accounts VALUES
  ('acc-cash', '101', 'الصندوق', 'asset', 'debit', 1),
  ('acc-card', '102', 'تحصيلات البطاقات', 'asset', 'debit', 1),
  ('acc-wallet', '103', 'المحفظة الإلكترونية', 'asset', 'debit', 1),
  ('acc-ar', '110', 'الذمم المدينة', 'asset', 'debit', 1),
  ('acc-inventory', '120', 'المخزون', 'asset', 'debit', 1),
  ('acc-ap', '200', 'الذمم الدائنة', 'liability', 'credit', 1),
  ('acc-vat', '210', 'ضريبة القيمة المضافة المستحقة', 'liability', 'credit', 1),
  ('acc-equity', '300', 'رأس المال', 'equity', 'credit', 1),
  ('acc-sales', '400', 'إيرادات المبيعات', 'revenue', 'credit', 1),
  ('acc-cogs', '500', 'تكلفة البضاعة المباعة', 'expense', 'debit', 1),
  ('acc-expense', '600', 'المصروفات التشغيلية', 'expense', 'debit', 1);

CREATE TABLE IF NOT EXISTS journal_entries (
  id             TEXT PRIMARY KEY,
  reference_type TEXT NOT NULL,
  reference_id   TEXT NOT NULL,
  description    TEXT NOT NULL,
  occurred_at    TEXT NOT NULL,
  UNIQUE (reference_type, reference_id)
);
CREATE INDEX IF NOT EXISTS idx_journal_time ON journal_entries (occurred_at DESC);

CREATE TABLE IF NOT EXISTS journal_lines (
  id              TEXT PRIMARY KEY,
  journal_id      TEXT NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL REFERENCES ledger_accounts (id),
  debit_piasters  INTEGER NOT NULL DEFAULT 0 CHECK (debit_piasters >= 0),
  credit_piasters INTEGER NOT NULL DEFAULT 0 CHECK (credit_piasters >= 0),
  CHECK ((debit_piasters = 0) <> (credit_piasters = 0))
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines (account_id);

CREATE TABLE IF NOT EXISTS credit_notes (
  id                TEXT PRIMARY KEY,
  note_no           TEXT NOT NULL UNIQUE,
  invoice_id        TEXT NOT NULL UNIQUE REFERENCES invoices (id) ON DELETE CASCADE,
  payment_method    TEXT NOT NULL,
  subtotal_piasters INTEGER NOT NULL,
  vat_piasters      INTEGER NOT NULL,
  total_piasters    INTEGER NOT NULL,
  profit_piasters   INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  issued_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_time ON credit_notes (issued_at DESC);

CREATE TABLE IF NOT EXISTS credit_note_lines (
  id             TEXT PRIMARY KEY,
  credit_note_id TEXT NOT NULL REFERENCES credit_notes (id) ON DELETE CASCADE,
  product_id     TEXT REFERENCES products (id),
  name_snapshot  TEXT NOT NULL,
  qty            INTEGER NOT NULL,
  unit_piasters  INTEGER NOT NULL,
  total_piasters INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_shifts (
  id                       TEXT PRIMARY KEY,
  opened_by                TEXT NOT NULL,
  opened_at                TEXT NOT NULL,
  opening_cash_piasters    INTEGER NOT NULL,
  closed_at                TEXT,
  expected_cash_piasters   INTEGER,
  actual_cash_piasters     INTEGER,
  difference_piasters      INTEGER,
  status                   TEXT NOT NULL CHECK (status IN ('open','closed'))
);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_shifts (status, opened_at DESC);

-- A staff row is also a sign-in account. `pin_hash` empty means the account
-- exists but cannot sign in yet — the owner has not given it a passcode.
CREATE TABLE IF NOT EXISTS staff (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,
  role_key        TEXT NOT NULL DEFAULT 'cashier',
  scope           TEXT NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  is_owner        INTEGER NOT NULL DEFAULT 0,
  pin_hash        TEXT NOT NULL DEFAULT '',
  pin_salt        TEXT NOT NULL DEFAULT '',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_active ON staff (active);

CREATE TABLE IF NOT EXISTS permissions (
  staff_id TEXT NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  ability  TEXT NOT NULL,
  granted  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (staff_id, ability)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  description TEXT NOT NULL,
  actor       TEXT NOT NULL DEFAULT 'المدير',
  payload     TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log (occurred_at DESC);

CREATE TABLE IF NOT EXISTS sync_queue (
  id          TEXT PRIMARY KEY,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '',
  queued_at   TEXT NOT NULL,
  synced_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue (synced_at);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
