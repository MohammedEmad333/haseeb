/** Row shapes as the repositories hand them out — camelCase, money in piasters. */

import type { MovementKind, StockStatus } from '@/domain/inventory';
import type { TierName } from '@/domain/wholesale';

export type PaymentMethod = 'cash' | 'wallet' | 'card' | 'credit';
export type SettlementMethod = 'cash' | 'wallet' | 'card' | 'transfer';
export type SalesChannel = 'retail' | 'wholesale' | 'preorder' | 'other';
export type InvoiceStatus = 'paid' | 'pending' | 'overdue';
export type CustomerKind = 'retail' | 'wholesale' | 'supplier';
export type OrderDirection = 'customer' | 'supplier';
export type OrderStatus =
  | 'completed'
  | 'preparing'
  | 'awaitingShipment'
  | 'received'
  | 'cancelled';

export interface BusinessProfile {
  name: string;
  businessType: string;
  currencyCode: string;
  currencyLabel: string;
  phone: string;
  commercialReg: string;
  taxNumber: string;
  vatRate: number;
  onboardedAt: string | null;
}

export interface Category {
  id: string;
  name: string;
  position: number;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  cost: number;
  price: number;
  qtyOnHand: number;
  lowThreshold: number;
  critThreshold: number;
  status: StockStatus;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  kind: MovementKind;
  qtyDelta: number;
  qtyAfter: number;
  actor: string;
  counterparty: string;
  note: string;
  occurredAt: string;
}

export interface Customer {
  id: string;
  name: string;
  kind: CustomerKind;
  phone: string;
  city: string;
  tier: TierName | null;
  minOrderQty: number;
  sinceYear: number | null;
}

export interface SaleLine {
  id: string;
  productId: string;
  name: string;
  qty: number;
  unit: number;
  cost: number;
  discountPercent: number;
  discount: number;
  total: number;
}

export interface Sale {
  id: string;
  invoiceNo: string;
  customerId: string | null;
  customerName: string | null;
  channel: SalesChannel;
  paymentMethod: PaymentMethod;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  profit: number;
  vatRate: number;
  occurredAt: string;
}

export interface SaleWithLines extends Sale {
  lines: SaleLine[];
}

export interface InvoiceLine {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unit: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  saleId: string | null;
  customerId: string | null;
  customerName: string;
  kind: 'retail' | 'wholesale';
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string | null;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  profit: number;
  qrPayload: string;
}

export interface InvoiceWithLines extends Invoice {
  lines: InvoiceLine[];
}

export interface Order {
  id: string;
  orderNo: string;
  direction: OrderDirection;
  counterpartyId: string | null;
  counterpartyName: string;
  status: OrderStatus;
  fulfilment: string;
  itemCount: number;
  summary: string;
  total: number;
  placedAt: string;
}

export interface Debt {
  id: string;
  customerId: string;
  invoiceId: string | null;
  direction: 'receivable' | 'payable';
  principal: number;
  openedAt: string;
  dueAt: string;
  note: string;
}

export interface Payment {
  id: string;
  debtId: string | null;
  customerId: string;
  amount: number;
  method: SettlementMethod;
  paidAt: string;
  note: string;
}

export interface Expense {
  id: string;
  label: string;
  amount: number;
  color: string;
  period: string;
  recordedAt: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  scope: string;
  active: boolean;
  abilities: string[];
}

export interface AuditEntry {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  description: string;
  actor: string;
  occurredAt: string;
}

export interface SyncQueueEntry {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  queuedAt: string;
  syncedAt: string | null;
}

export type LedgerAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface TrialBalanceRow {
  id: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  debit: number;
  credit: number;
  balance: number;
}

export interface JournalEntry {
  id: string;
  referenceType: string;
  referenceId: string;
  description: string;
  occurredAt: string;
  debit: number;
  credit: number;
}

export interface CreditNote {
  id: string;
  noteNo: string;
  invoiceId: string;
  paymentMethod: PaymentMethod;
  subtotal: number;
  vat: number;
  total: number;
  profit: number;
  reason: string;
  issuedAt: string;
}

export interface CashShift {
  id: string;
  openedBy: string;
  openedAt: string;
  openingCash: number;
  closedAt: string | null;
  expectedCash: number | null;
  actualCash: number | null;
  difference: number | null;
  status: 'open' | 'closed';
}
