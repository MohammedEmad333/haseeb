import { HaseebDatabase, newId, nowIso, type Row } from '../database';
import {
  afterFailure,
  generateRecoveryCode,
  hashPin,
  isLockedOut,
  normaliseRecoveryCode,
  remainingLockoutMs,
  validatePin,
  verifyPin,
  type LockoutState,
} from '@/domain/pin';
import { ROLE_PRESETS, abilitiesFor, type Ability, type RoleKey } from '@/domain/abilities';

export interface Account {
  id: string;
  name: string;
  role: string;
  roleKey: string;
  scope: string;
  active: boolean;
  isOwner: boolean;
  /** Whether a passcode has been set; the hash itself never leaves this file. */
  hasPin: boolean;
  abilities: Ability[];
  lockedUntil: string | null;
  lastLoginAt: string | null;
}

export type SignInResult =
  | { ok: true; account: Account }
  | { ok: false; reason: 'unknown' | 'suspended' | 'noPin' | 'locked' | 'wrongPin'; retryInMs?: number };

const META_RECOVERY = 'auth.recovery';

function lockoutOf(row: Row): LockoutState {
  return {
    failedAttempts: Number(row.failed_attempts ?? 0),
    lockedUntil: row.locked_until ? Date.parse(String(row.locked_until)) : null,
  };
}

export class AccountRepository {
  constructor(private readonly db: HaseebDatabase) {}

  async #toAccount(row: Row): Promise<Account> {
    const granted = await this.db.all(
      'SELECT ability FROM permissions WHERE staff_id = ? AND granted = 1',
      [String(row.id)],
    );
    const isOwner = Number(row.is_owner) === 1;
    return {
      id: String(row.id),
      name: String(row.name),
      role: String(row.role),
      roleKey: String(row.role_key),
      scope: String(row.scope),
      active: Number(row.active) === 1,
      isOwner,
      hasPin: String(row.pin_hash ?? '').length > 0,
      abilities: [...abilitiesFor(isOwner, granted.map((g) => String(g.ability)))],
      lockedUntil: row.locked_until === null ? null : String(row.locked_until),
      lastLoginAt: row.last_login_at === null ? null : String(row.last_login_at),
    };
  }

  async list(): Promise<Account[]> {
    const rows = await this.db.all('SELECT * FROM staff ORDER BY is_owner DESC, created_at');
    return Promise.all(rows.map((r) => this.#toAccount(r)));
  }

  /** Accounts offered on the sign-in screen: active, and able to sign in. */
  async signInCandidates(): Promise<Account[]> {
    return (await this.list()).filter((a) => a.active && a.hasPin);
  }

  async byId(id: string): Promise<Account | null> {
    const row = await this.db.get('SELECT * FROM staff WHERE id = ?', [id]);
    return row ? this.#toAccount(row) : null;
  }

  async owner(): Promise<Account | null> {
    const row = await this.db.get('SELECT * FROM staff WHERE is_owner = 1 LIMIT 1');
    return row ? this.#toAccount(row) : null;
  }

  /** Whether the app still needs its first manager account. */
  async needsOwnerSetup(): Promise<boolean> {
    const owner = await this.owner();
    return owner === null || !owner.hasPin;
  }

  // ---- sign in --------------------------------------------------------

  /**
   * Verify a passcode.
   *
   * A wrong passcode costs an attempt and, after enough of them, locks the
   * account for a while — which is what stops someone standing at the counter
   * trying every four-digit code.
   */
  async signIn(id: string, pin: string, now = Date.now()): Promise<SignInResult> {
    const row = await this.db.get('SELECT * FROM staff WHERE id = ?', [id]);
    if (!row) return { ok: false, reason: 'unknown' };
    if (Number(row.active) !== 1) return { ok: false, reason: 'suspended' };
    if (!String(row.pin_hash ?? '')) return { ok: false, reason: 'noPin' };

    const lockout = lockoutOf(row);
    if (isLockedOut(lockout, now)) {
      return { ok: false, reason: 'locked', retryInMs: remainingLockoutMs(lockout, now) };
    }

    const matches = await verifyPin(pin, {
      hash: String(row.pin_hash),
      salt: String(row.pin_salt),
    });

    if (!matches) {
      const next = afterFailure(lockout, now);
      await this.#writeLockout(String(row.id), next, String(row.name));
      return {
        ok: false,
        reason: next.lockedUntil ? 'locked' : 'wrongPin',
        ...(next.lockedUntil ? { retryInMs: next.lockedUntil - now } : {}),
      };
    }

    const account = await this.#toAccount(row);
    await this.db.mutate(
      {
        entity: 'session',
        entityId: account.id,
        action: 'sign_in',
        actor: account.name,
        localOnly: true,
        description: `تسجيل دخول «${account.name}»`,
      },
      async (tx) => {
        await tx.execute(
          `UPDATE staff SET failed_attempts = 0, locked_until = NULL, last_login_at = ?
           WHERE id = ?`,
          [nowIso(), account.id],
        );
      },
    );
    return { ok: true, account: { ...account, lockedUntil: null } };
  }

  async #writeLockout(id: string, state: LockoutState, name: string): Promise<void> {
    await this.db.mutate(
      {
        entity: 'session',
        entityId: id,
        action: state.lockedUntil ? 'lockout' : 'failed_sign_in',
        actor: name,
        localOnly: true,
        description: state.lockedUntil
          ? `إيقاف مؤقت لحساب «${name}» بعد محاولات دخول خاطئة`
          : `محاولة دخول خاطئة لحساب «${name}»`,
      },
      async (tx) => {
        await tx.execute('UPDATE staff SET failed_attempts = ?, locked_until = ? WHERE id = ?', [
          state.failedAttempts,
          state.lockedUntil === null ? null : new Date(state.lockedUntil).toISOString(),
          id,
        ]);
      },
    );
  }

  // ---- account management ---------------------------------------------

  /**
   * Create the manager account and return its recovery code — the only time
   * it is ever shown. With no server there is no reset e-mail; this code is
   * the whole of the recovery story, which is why the UI insists it is written
   * down.
   */
  async createOwner(name: string, pin: string): Promise<{ account: Account; recoveryCode: string }> {
    const invalid = validatePin(pin);
    if (invalid) throw new Error(invalid.message);

    const existing = await this.owner();
    const id = existing?.id ?? newId();
    const { hash, salt } = await hashPin(pin);
    const recoveryCode = generateRecoveryCode();
    const recovery = await hashPin(normaliseRecoveryCode(recoveryCode));

    await this.db.mutate(
      {
        entity: 'staff',
        entityId: id,
        action: existing ? 'set_owner_pin' : 'create_owner',
        actor: name,
        localOnly: true,
        description: existing
          ? `تعيين رمز دخول لحساب المدير «${name}»`
          : `إنشاء حساب المدير «${name}»`,
      },
      async (tx) => {
        if (existing) {
          await tx.execute(
            'UPDATE staff SET name = ?, pin_hash = ?, pin_salt = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
            [name, hash, salt, id],
          );
        } else {
          await tx.execute(
            `INSERT INTO staff (id, name, role, role_key, scope, active, is_owner,
               pin_hash, pin_salt, created_at)
             VALUES (?, ?, 'مالك / مدير', 'owner', 'كل الصلاحيات', 1, 1, ?, ?, ?)`,
            [id, name, hash, salt, nowIso()],
          );
        }
        await tx.execute('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
          META_RECOVERY,
          JSON.stringify(recovery),
        ]);
      },
    );

    const account = (await this.byId(id))!;
    return { account, recoveryCode };
  }

  /** Restore access with the code shown at setup. */
  async resetOwnerPinWithRecoveryCode(code: string, newPin: string): Promise<boolean> {
    const invalid = validatePin(newPin);
    if (invalid) throw new Error(invalid.message);

    const stored = await this.db.value<string>('SELECT value FROM meta WHERE key = ?', [
      META_RECOVERY,
    ]);
    if (!stored) return false;

    const matches = await verifyPin(
      normaliseRecoveryCode(code),
      JSON.parse(stored) as { hash: string; salt: string },
    );
    if (!matches) return false;

    const owner = await this.owner();
    if (!owner) return false;

    const { hash, salt } = await hashPin(newPin);
    await this.db.mutate(
      {
        entity: 'staff',
        entityId: owner.id,
        action: 'recover_owner_pin',
        actor: owner.name,
        localOnly: true,
        description: `استعادة رمز دخول المدير «${owner.name}» برمز الاستعادة`,
      },
      async (tx) => {
        await tx.execute(
          'UPDATE staff SET pin_hash = ?, pin_salt = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
          [hash, salt, owner.id],
        );
      },
    );
    return true;
  }

  async createStaff(input: {
    name: string;
    roleKey: RoleKey;
    pin?: string;
    actor: string;
  }): Promise<Account> {
    const preset = ROLE_PRESETS[input.roleKey];
    if (!preset) throw new Error(`unknown role ${input.roleKey}`);
    if (input.pin) {
      const invalid = validatePin(input.pin);
      if (invalid) throw new Error(invalid.message);
    }

    const id = newId();
    const credentials = input.pin ? await hashPin(input.pin) : { hash: '', salt: '' };

    await this.db.mutate(
      {
        entity: 'staff',
        entityId: id,
        action: 'create',
        actor: input.actor,
        description: `إضافة مستخدم «${input.name}» بصلاحيات ${preset.label}`,
        payload: { roleKey: input.roleKey },
      },
      async (tx) => {
        await tx.execute(
          `INSERT INTO staff (id, name, role, role_key, scope, active, is_owner,
             pin_hash, pin_salt, created_at)
           VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`,
          [
            id,
            input.name,
            preset.label,
            input.roleKey,
            preset.abilities.length === 0 ? 'بدون صلاحيات' : preset.label,
            credentials.hash,
            credentials.salt,
            nowIso(),
          ],
        );
        for (const ability of preset.abilities) {
          await tx.execute('INSERT INTO permissions (staff_id, ability, granted) VALUES (?, ?, 1)', [
            id,
            ability,
          ]);
        }
      },
    );
    return (await this.byId(id))!;
  }

  /** Set or reset another user's passcode. Owner-only, enforced by the caller. */
  async setPin(id: string, pin: string, actor: string): Promise<void> {
    const invalid = validatePin(pin);
    if (invalid) throw new Error(invalid.message);
    const account = await this.byId(id);
    if (!account) throw new Error(`unknown account ${id}`);

    const { hash, salt } = await hashPin(pin);
    await this.db.mutate(
      {
        entity: 'staff',
        entityId: id,
        action: 'set_pin',
        actor,
        localOnly: true,
        description: `تعيين رمز دخول للمستخدم «${account.name}»`,
      },
      async (tx) => {
        await tx.execute(
          'UPDATE staff SET pin_hash = ?, pin_salt = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
          [hash, salt, id],
        );
      },
    );
  }

  async setAbilities(id: string, abilities: readonly Ability[], actor: string): Promise<void> {
    const account = await this.byId(id);
    if (!account) throw new Error(`unknown account ${id}`);
    if (account.isOwner) throw new Error('صلاحيات المدير لا تُعدَّل');

    await this.db.mutate(
      {
        entity: 'staff',
        entityId: id,
        action: 'set_abilities',
        actor,
        description: `تعديل صلاحيات المستخدم «${account.name}»`,
        payload: { abilities },
      },
      async (tx) => {
        await tx.execute('DELETE FROM permissions WHERE staff_id = ?', [id]);
        for (const ability of abilities) {
          await tx.execute('INSERT INTO permissions (staff_id, ability, granted) VALUES (?, ?, 1)', [
            id,
            ability,
          ]);
        }
      },
    );
  }

  async setActive(id: string, active: boolean, actor: string): Promise<void> {
    const account = await this.byId(id);
    if (!account) throw new Error(`unknown account ${id}`);
    // Suspending the last way into the books is not a state to allow.
    if (account.isOwner && !active) throw new Error('لا يمكن إيقاف حساب المدير');

    await this.db.mutate(
      {
        entity: 'staff',
        entityId: id,
        action: active ? 'activate' : 'suspend',
        actor,
        description: active
          ? `تفعيل صلاحيات المستخدم «${account.name}»`
          : `إيقاف صلاحيات المستخدم «${account.name}»`,
      },
      async (tx) => {
        await tx.execute('UPDATE staff SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
      },
    );
  }
}
