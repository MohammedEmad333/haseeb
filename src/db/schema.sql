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

CREATE TABLE IF NOT EXISTS staff (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  scope      TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

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
