/**
 * Accounts, passcodes and permissions.
 *
 * The claims under test are the ones a shop actually relies on: a wrong
 * passcode gets you nowhere and eventually locks the account, an employee
 * only holds the abilities the owner ticked, and the owner cannot be locked
 * out of its own books.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHaseeb, type Haseeb } from '@/db';
import { MAX_ATTEMPTS, LOCKOUT_MS, validatePin } from '@/domain/pin';
import { ABILITIES } from '@/domain/abilities';

let h: Haseeb;

beforeEach(async () => {
  h = await openHaseeb({ ephemeral: true });
});

afterEach(async () => {
  await h.db.close();
});

describe('passcode rules', () => {
  it('rejects codes that are too short, repeated or sequential', () => {
    expect(validatePin('123')).not.toBeNull();
    expect(validatePin('1111')).not.toBeNull();
    expect(validatePin('1234')).not.toBeNull();
    expect(validatePin('4826')).toBeNull();
  });
});

describe('owner setup', () => {
  it('starts with an owner that has no passcode, so first launch asks for one', async () => {
    expect(await h.accounts.needsOwnerSetup()).toBe(true);
    const owner = await h.accounts.owner();
    expect(owner?.hasPin).toBe(false);
    // An account without a passcode is not offered on the sign-in screen.
    expect(await h.accounts.signInCandidates()).toHaveLength(0);
  });

  it('holds every ability, whatever the permissions table says', async () => {
    await h.accounts.createOwner('المدير', '4826');
    const owner = (await h.accounts.owner())!;
    expect(owner.abilities.sort()).toEqual([...ABILITIES].sort());
  });

  it('refuses to be suspended', async () => {
    await h.accounts.createOwner('المدير', '4826');
    const owner = (await h.accounts.owner())!;
    await expect(h.accounts.setActive(owner.id, false, 'المدير')).rejects.toThrow();
    expect((await h.accounts.byId(owner.id))!.active).toBe(true);
  });
});

describe('signing in', () => {
  it('accepts the right passcode and stamps the login', async () => {
    const { account } = await h.accounts.createOwner('المدير', '4826');
    const result = await h.accounts.signIn(account.id, '4826');
    expect(result.ok).toBe(true);
    expect((await h.accounts.byId(account.id))!.lastLoginAt).not.toBeNull();
  });

  it('locks the account after enough wrong passcodes, then lets it back in', async () => {
    const { account } = await h.accounts.createOwner('المدير', '4826');
    const t0 = Date.parse('2026-01-01T10:00:00.000Z');

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      const wrong = await h.accounts.signIn(account.id, '9999', t0);
      expect(wrong).toMatchObject({ ok: false, reason: 'wrongPin' });
    }

    // The attempt that trips the lock, and the one that finds it locked.
    expect(await h.accounts.signIn(account.id, '9999', t0)).toMatchObject({ reason: 'locked' });
    expect(await h.accounts.signIn(account.id, '4826', t0 + 1000)).toMatchObject({ reason: 'locked' });

    // Right passcode, after the lockout has expired.
    expect(await h.accounts.signIn(account.id, '4826', t0 + LOCKOUT_MS + 1)).toMatchObject({ ok: true });
    // A success clears the count, so the next slip starts from zero.
    expect((await h.accounts.byId(account.id))!.lockedUntil).toBeNull();
  });

  it('turns away suspended accounts and accounts with no passcode', async () => {
    await h.accounts.createOwner('المدير', '4826');
    const cashier = await h.accounts.createStaff({
      name: 'سارة',
      roleKey: 'cashier',
      actor: 'المدير',
    });
    expect(await h.accounts.signIn(cashier.id, '1379')).toMatchObject({ reason: 'noPin' });

    await h.accounts.setPin(cashier.id, '1379', 'المدير');
    expect(await h.accounts.signIn(cashier.id, '1379')).toMatchObject({ ok: true });

    await h.accounts.setActive(cashier.id, false, 'المدير');
    expect(await h.accounts.signIn(cashier.id, '1379')).toMatchObject({ reason: 'suspended' });
  });

  it('does not reveal whether an account exists', async () => {
    expect(await h.accounts.signIn('no-such-account', '4826')).toMatchObject({ reason: 'unknown' });
  });
});

describe('recovery code', () => {
  it('resets the owner passcode exactly once per code, and only with the right one', async () => {
    const { recoveryCode } = await h.accounts.createOwner('المدير', '4826');
    expect(recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);

    expect(await h.accounts.resetOwnerPinWithRecoveryCode('AAAA-BBBB-CCCC-DDDD', '5731')).toBe(false);
    expect(await h.accounts.resetOwnerPinWithRecoveryCode(recoveryCode, '5731')).toBe(true);

    const owner = (await h.accounts.owner())!;
    expect(await h.accounts.signIn(owner.id, '4826')).toMatchObject({ ok: false });
    expect(await h.accounts.signIn(owner.id, '5731')).toMatchObject({ ok: true });
  });

  it('accepts the code however it was written down', async () => {
    const { recoveryCode } = await h.accounts.createOwner('المدير', '4826');
    const messy = ` ${recoveryCode.toLowerCase().replace(/-/g, ' ')} `;
    expect(await h.accounts.resetOwnerPinWithRecoveryCode(messy, '5731')).toBe(true);
  });
});

describe('abilities', () => {
  it('gives a new employee exactly the preset for its role', async () => {
    await h.accounts.createOwner('المدير', '4826');
    const keeper = await h.accounts.createStaff({
      name: 'خالد',
      roleKey: 'storekeeper',
      actor: 'المدير',
    });
    expect(keeper.abilities.sort()).toEqual(
      ['inventory.read', 'inventory.write', 'orders.read', 'orders.receive'].sort(),
    );
    expect(keeper.abilities).not.toContain('finance.read');
  });

  it('replaces the whole set when the owner edits it', async () => {
    await h.accounts.createOwner('المدير', '4826');
    const cashier = await h.accounts.createStaff({ name: 'سارة', roleKey: 'cashier', actor: 'المدير' });

    await h.accounts.setAbilities(cashier.id, ['pos.sell', 'debts.read'], 'المدير');
    const updated = (await h.accounts.byId(cashier.id))!;
    expect(updated.abilities.sort()).toEqual(['debts.read', 'pos.sell']);
    expect(updated.abilities).not.toContain('pos.credit');
  });

  it('ignores abilities it does not recognise', async () => {
    await h.accounts.createOwner('المدير', '4826');
    const cashier = await h.accounts.createStaff({ name: 'سارة', roleKey: 'cashier', actor: 'المدير' });
    await h.db.mutate({ entity: 'staff', action: 'test', localOnly: true, description: 'test' }, (tx) =>
      tx.execute('INSERT INTO permissions (staff_id, ability, granted) VALUES (?, ?, 1)', [
        cashier.id,
        'books.burn',
      ]),
    );
    expect((await h.accounts.byId(cashier.id))!.abilities).not.toContain('books.burn');
  });

  it("will not let the owner's grant be edited away", async () => {
    await h.accounts.createOwner('المدير', '4826');
    const owner = (await h.accounts.owner())!;
    await expect(h.accounts.setAbilities(owner.id, ['pos.sell'], 'المدير')).rejects.toThrow();
    expect((await h.accounts.byId(owner.id))!.abilities).toHaveLength(ABILITIES.length);
  });
});

describe('the audit trail', () => {
  it('credits work to whoever is signed in', async () => {
    await h.accounts.createOwner('المدير', '4826');
    h.db.setActor('سارة');
    await h.accounts.createStaff({ name: 'خالد', roleKey: 'cashier', actor: h.db.actor });

    const entry = (await h.ops.audit(5)).find((e) => e.description.includes('خالد'));
    expect(entry?.actor).toBe('سارة');
  });
});
