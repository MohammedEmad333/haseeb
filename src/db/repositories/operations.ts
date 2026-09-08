import { HaseebDatabase, newId, nowIso, type Row } from '../database';
import type {
  AuditEntry,
  BusinessProfile,
  Expense,
  Order,
  OrderDirection,
  OrderStatus,
  StaffMember,
  SyncQueueEntry,
} from '../types';

/** Business profile, expenses, staff, orders, audit and the sync queue. */
export class OperationsRepository {
  constructor(private readonly db: HaseebDatabase) {}

  // ---- business profile ----------------------------------------------

  profile(): BusinessProfile | null {
    const row = this.db.get('SELECT * FROM business_profile WHERE id = 1');
    if (!row) return null;
    return {
      name: String(row.name),
      businessType: String(row.business_type),
      currencyCode: String(row.currency_code),
      currencyLabel: String(row.currency_label),
      phone: String(row.phone),
      commercialReg: String(row.commercial_reg),
      taxNumber: String(row.tax_number),
      vatRate: Number(row.vat_rate),
      onboardedAt: row.onboarded_at === null ? null : String(row.onboarded_at),
    };
  }

  saveProfile(profile: BusinessProfile): void {
    const existing = this.profile();
    this.db.mutate(
      {
        entity: 'business_profile',
        entityId: '1',
        action: existing ? 'update' : 'create',
        description: existing
          ? `تحديث بيانات المنشأة «${profile.name}»`
          : `إنشاء المنشأة «${profile.name}» وقاعدة البيانات المحلية`,
        payload: profile,
      },
      (db) =>
        db.run(
          `INSERT INTO business_profile (id, name, business_type, currency_code, currency_label,
             phone, commercial_reg, tax_number, vat_rate, onboarded_at, created_at)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             name = excluded.name,
             business_type = excluded.business_type,
             currency_code = excluded.currency_code,
             currency_label = excluded.currency_label,
             phone = excluded.phone,
             commercial_reg = excluded.commercial_reg,
             tax_number = excluded.tax_number,
             vat_rate = excluded.vat_rate,
             onboarded_at = excluded.onboarded_at`,
          [
            profile.name,
            profile.businessType,
            profile.currencyCode,
            profile.currencyLabel,
            profile.phone,
            profile.commercialReg,
            profile.taxNumber,
            profile.vatRate,
            profile.onboardedAt,
            existing ? nowIso() : nowIso(),
          ],
        ),
    );
  }

  // ---- expenses -------------------------------------------------------

  expenses(period?: string): Expense[] {
    const rows = period
      ? this.db.all('SELECT * FROM expenses WHERE period = ? ORDER BY amount_piasters DESC', [
          period,
        ])
      : this.db.all('SELECT * FROM expenses ORDER BY amount_piasters DESC');
    return rows.map(toExpense);
  }

  totalExpenses(period?: string): number {
    return this.expenses(period).reduce((t, e) => t + e.amount, 0);
  }

  /**
   * Operating expenses attributable to a window.
   *
   * Expenses are booked per month (rent, salaries, utilities), so comparing a
   * week's gross profit against a whole month's costs would show a loss on a
   * perfectly profitable week. Costs are pro-rated across the days they cover
   * instead, which is what makes «صافي الربح» mean anything on a weekly view.
   */
  expensesForRange(fromIso: string, toIso: string): number {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));

    let total = 0;
    for (const expense of this.expenses()) {
      const daysInPeriod = daysInMonth(expense.period);
      total += Math.round((expense.amount * Math.min(days, daysInPeriod)) / daysInPeriod);
    }
    return total;
  }

  // ---- staff & permissions --------------------------------------------

  staff(): StaffMember[] {
    return this.db.all('SELECT * FROM staff ORDER BY created_at').map((r) => ({
      id: String(r.id),
      name: String(r.name),
      role: String(r.role),
      scope: String(r.scope),
      active: Number(r.active) === 1,
      abilities: this.db
        .all('SELECT ability FROM permissions WHERE staff_id = ? AND granted = 1', [String(r.id)])
        .map((p) => String(p.ability)),
    }));
  }

  setStaffActive(id: string, active: boolean): void {
    const member = this.db.get('SELECT name FROM staff WHERE id = ?', [id]);
    this.db.mutate(
      {
        entity: 'staff',
        entityId: id,
        action: active ? 'activate' : 'suspend',
        description: active
          ? `تفعيل صلاحيات المستخدم «${member?.name ?? id}»`
          : `إيقاف صلاحيات المستخدم «${member?.name ?? id}»`,
        payload: { active },
      },
      (db) => db.run('UPDATE staff SET active = ? WHERE id = ?', [active ? 1 : 0, id]),
    );
  }

  // ---- orders ----------------------------------------------------------

  orders(direction?: OrderDirection): Order[] {
    const rows = direction
      ? this.db.all('SELECT * FROM orders WHERE direction = ? ORDER BY placed_at DESC', [direction])
      : this.db.all('SELECT * FROM orders ORDER BY placed_at DESC');
    return rows.map(toOrder);
  }

  setOrderStatus(id: string, status: OrderStatus): void {
    const order = this.db.get('SELECT order_no FROM orders WHERE id = ?', [id]);
    this.db.mutate(
      {
        entity: 'order',
        entityId: id,
        action: 'set_status',
        description: `تحديث حالة الطلب ${order?.order_no ?? id} إلى «${ORDER_STATUS_LABEL[status]}»`,
        payload: { status },
      },
      (db) => db.run('UPDATE orders SET status = ? WHERE id = ?', [status, id]),
    );
  }

  // ---- audit & sync ----------------------------------------------------

  audit(limit = 20): AuditEntry[] {
    return this.db
      .all('SELECT * FROM audit_log ORDER BY occurred_at DESC, rowid DESC LIMIT ?', [limit])
      .map((r) => ({
        id: String(r.id),
        entity: String(r.entity),
        entityId: String(r.entity_id),
        action: String(r.action),
        description: String(r.description),
        actor: String(r.actor),
        occurredAt: String(r.occurred_at),
      }));
  }

  /**
   * Pending mutations awaiting the optional encrypted sync. Nothing in the
   * app blocks on this queue draining — it is a record of what *would* be
   * pushed if the owner ever turns sync on.
   */
  pendingSync(limit = 50): SyncQueueEntry[] {
    return this.db
      .all('SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY queued_at LIMIT ?', [limit])
      .map((r) => ({
        id: String(r.id),
        entity: String(r.entity),
        entityId: String(r.entity_id),
        action: String(r.action),
        queuedAt: String(r.queued_at),
        syncedAt: r.synced_at === null ? null : String(r.synced_at),
      }));
  }

  pendingSyncCount(): number {
    return Number(this.db.value('SELECT COUNT(*) FROM sync_queue WHERE synced_at IS NULL') ?? 0);
  }

  markSynced(ids: readonly string[]): void {
    if (ids.length === 0) return;
    const at = nowIso();
    this.db.mutate(
      {
        entity: 'sync_queue',
        action: 'reconcile',
        description: `مزامنة ${ids.length} عملية مع النسخة المشفّرة`,
        actor: 'النظام',
      },
      (db) => {
        for (const id of ids) {
          db.run('UPDATE sync_queue SET synced_at = ? WHERE id = ?', [at, id]);
        }
      },
    );
  }

  // ---- preferences -----------------------------------------------------

  /** A user preference, or null when it has never been set. */
  preference(key: string): string | null {
    const value = this.db.value<string>('SELECT value FROM meta WHERE key = ?', [`pref.${key}`]);
    return value ?? null;
  }

  setPreference(key: string, value: string, description: string): void {
    this.db.mutate(
      {
        entity: 'preference',
        entityId: key,
        action: 'set',
        description,
        payload: { key, value },
        // A display preference is this device's business, not something to
        // push to a peer that may be set up differently.
        localOnly: true,
      },
      (db) =>
        db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [`pref.${key}`, value]),
    );
  }

  /** Record an encrypted local backup in the audit trail. */
  recordBackup(): void {
    this.db.mutate(
      {
        entity: 'database',
        entityId: newId(),
        action: 'backup',
        actor: 'النظام',
        description: 'نسخة احتياطية مشفّرة للقاعدة المحلية',
      },
      () => undefined,
    );
  }
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  completed: 'مكتمل',
  preparing: 'قيد التحضير',
  awaitingShipment: 'بانتظار الشحن',
  received: 'مستلم',
  cancelled: 'ملغي',
};

/** Calendar days in a `YYYY-MM` period, defaulting to 30 for a malformed one. */
function daysInMonth(period: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return 30;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
}

function toExpense(row: Row): Expense {
  return {
    id: String(row.id),
    label: String(row.label),
    amount: Number(row.amount_piasters),
    color: String(row.color),
    period: String(row.period),
    recordedAt: String(row.recorded_at),
  };
}

function toOrder(row: Row): Order {
  return {
    id: String(row.id),
    orderNo: String(row.order_no),
    direction: String(row.direction) as OrderDirection,
    counterpartyId: row.counterparty_id === null ? null : String(row.counterparty_id),
    counterpartyName: String(row.counterparty_name),
    status: String(row.status) as OrderStatus,
    fulfilment: String(row.fulfilment),
    itemCount: Number(row.item_count),
    summary: String(row.summary),
    total: Number(row.total_piasters),
    placedAt: String(row.placed_at),
  };
}
