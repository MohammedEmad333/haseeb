/**
 * Users and permissions.
 *
 * Everything here is the owner's: creating an account, deciding what it can
 * reach, giving it a passcode, and taking it away again. The abilities are
 * ticked one by one rather than picked as a role, because a real shop's
 * "cashier" is whatever that shop needs a cashier to be — the role only sets
 * the starting point.
 */

import { useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { useSession } from '@/state/SessionProvider';
import { useQuery } from '@/state/useQuery';
import { Badge, Button, Card, CardBody, CardHead, EmptyState, Field, Input, Select, Toggle } from '@/ui/primitives';
import { InitialTile } from '@/ui/composites';
import { ABILITIES, ABILITY_LABEL, ROLE_PRESETS, type Ability, type RoleKey } from '@/domain/abilities';
import { MIN_PIN_LENGTH } from '@/domain/pin';
import { NOUNS, counted, dateAndTime } from '@/lib/format';
import type { Account } from '@/db';

/** The owner preset is not on offer: there is exactly one owner. */
const HIRABLE_ROLES = Object.entries(ROLE_PRESETS).filter(([key]) => key !== 'owner');

export function StaffManager() {
  const { accounts, db } = useHaseeb();
  const { account: signedIn, actor } = useSession();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: staff } = useQuery(async () => (accounts ? accounts.list() : []), [accounts]);

  if (!staff || !accounts) return null;

  const commit = async (work: () => Promise<void>, message: string): Promise<void> => {
    await work();
    await db?.flush();
    setNotice(message);
  };

  return (
    <Card panel style={{ minWidth: 0 }}>
      <CardHead
        title="المستخدمون والصلاحيات"
        sub="كل حساب على هذا الجهاز برمز دخول خاص به"
        actions={
          <Button
            onClick={() => {
              setAdding((open) => !open);
              setEditing(null);
              setNotice(null);
            }}
            aria-expanded={adding}
          >
            {adding ? 'إغلاق' : 'إضافة مستخدم'}
          </Button>
        }
      />
      <CardBody style={{ paddingInline: 0 }}>
        {adding ? (
          <div style={{ paddingInline: 'var(--hs-sp-9)', paddingBlockEnd: 'var(--hs-sp-8)' }}>
            <NewAccountForm
              onCancel={() => setAdding(false)}
              onCreate={async (input) => {
                await commit(async () => {
                  await accounts.createStaff({ ...input, actor });
                }, `أُضيف «${input.name}». يمكنه الدخول برمزه الآن.`);
                setAdding(false);
              }}
            />
          </div>
        ) : null}

        {notice ? (
          <p
            role="status"
            style={{
              margin: '0 var(--hs-sp-9) var(--hs-sp-6)',
              fontSize: 'var(--hs-fs-badge)',
              color: 'var(--hs-mint-text)',
            }}
          >
            {notice}
          </p>
        ) : null}

        {staff.length === 0 ? (
          <EmptyState title="لا يوجد مستخدمون" body="أضف حساباً لكل من يعمل على هذا الجهاز." />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {staff.map((member) => (
              <li key={member.id} style={{ borderBlockEnd: '1px solid var(--hs-divider)' }}>
                <div
                  className="hs-row"
                  style={{ gap: 'var(--hs-sp-5)', padding: 'var(--hs-sp-5) var(--hs-sp-9)', flexWrap: 'wrap' }}
                >
                  <InitialTile
                    name={member.name}
                    size={34}
                    bg="var(--hs-page)"
                    border="var(--hs-border)"
                    fg="var(--hs-text-slate-2)"
                  />
                  <span style={{ flex: 1, minWidth: 120 }}>
                    <span style={{ display: 'block', fontSize: 'var(--hs-fs-body)', fontWeight: 600 }}>
                      {member.name}
                      {member.id === signedIn?.id ? (
                        <span style={{ fontSize: 'var(--hs-fs-meta)', color: 'var(--hs-text-subtle)', fontWeight: 400 }}>
                          {' '}· أنت
                        </span>
                      ) : null}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 'var(--hs-fs-meta)',
                        color: 'var(--hs-text-subtle)',
                        marginBlockStart: 2,
                      }}
                    >
                      {member.role} · {statusLine(member)}
                    </span>
                  </span>

                  <StatusBadge member={member} />

                  <Toggle
                    checked={member.active}
                    disabled={member.isOwner}
                    label={`تفعيل حساب ${member.name}`}
                    onChange={(next) =>
                      void commit(
                        () => accounts.setActive(member.id, next, actor),
                        next ? `فُعِّل حساب «${member.name}».` : `أُوقف حساب «${member.name}».`,
                      )
                    }
                  />

                  <Button
                    onClick={() => {
                      setEditing((open) => (open === member.id ? null : member.id));
                      setNotice(null);
                    }}
                    aria-expanded={editing === member.id}
                  >
                    {editing === member.id ? 'إغلاق' : 'تعديل'}
                  </Button>
                </div>

                {editing === member.id ? (
                  <AccountEditor
                    member={member}
                    onSetPin={(pin) =>
                      commit(
                        () => accounts.setPin(member.id, pin, actor),
                        `تم تعيين رمز دخول جديد لـ«${member.name}». سلّمه له بنفسك.`,
                      )
                    }
                    onSetAbilities={(abilities) =>
                      commit(
                        () => accounts.setAbilities(member.id, abilities, actor),
                        `حُفظت صلاحيات «${member.name}».`,
                      )
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function statusLine(member: Account): string {
  if (!member.active) return 'موقوف';
  if (!member.hasPin) return 'بانتظار رمز دخول';
  if (member.lockedUntil && Date.parse(member.lockedUntil) > Date.now()) return 'مقفول مؤقتاً';
  if (member.lastLoginAt) return `آخر دخول ${dateAndTime(member.lastLoginAt)}`;
  return 'لم يسجّل الدخول بعد';
}

function StatusBadge({ member }: { member: Account }) {
  if (!member.active) {
    return (
      <Badge bg="var(--hs-danger-bg)" fg="var(--hs-danger-text)">
        موقوف
      </Badge>
    );
  }
  if (!member.hasPin) {
    return (
      <Badge bg="var(--hs-warn-bg)" fg="var(--hs-warn-text)">
        بلا رمز
      </Badge>
    );
  }
  return (
    <Badge bg="var(--hs-mint-bg)" fg="var(--hs-mint-text)">
      {member.isOwner ? 'كل الصلاحيات' : `${member.abilities.length} صلاحية`}
    </Badge>
  );
}

// ---------------------------------------------------------------------------

function NewAccountForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: { name: string; roleKey: RoleKey; pin?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [roleKey, setRoleKey] = useState<RoleKey>('cashier');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('اكتب اسم المستخدم.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), roleKey, pin: pin || undefined });
      setName('');
      setPin('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="hs-stack"
      style={{
        gap: 'var(--hs-sp-6)',
        background: 'var(--hs-page)',
        border: '1px solid var(--hs-border)',
        borderRadius: 'var(--hs-r-card)',
        padding: 'var(--hs-sp-8)',
      }}
    >
      <Field label="الاسم">
        {(props) => (
          <Input {...props} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        )}
      </Field>

      <Field label="الدور" hint={ROLE_PRESETS[roleKey]?.abilities.map((a) => ABILITY_LABEL[a]).join(' · ')}>
        {(props) => (
          <Select {...props} value={roleKey} onChange={(e) => setRoleKey(e.target.value as RoleKey)}>
            {HIRABLE_ROLES.map(([key, preset]) => (
              <option key={key} value={key}>
                {preset.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field
        label="رمز الدخول (اختياري)"
        hint="اتركه فارغاً ليضبطه المدير لاحقاً. الحساب بلا رمز لا يظهر في شاشة الدخول."
        error={error ?? undefined}
      >
        {(props) => (
          <Input
            {...props}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            className="hs-num"
            style={{ direction: 'ltr', textAlign: 'start' }}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\s/g, ''))}
          />
        )}
      </Field>

      <div className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>
        <Button variant="primary" disabled={busy} onClick={() => void submit()}>
          حفظ المستخدم
        </Button>
        <Button onClick={onCancel}>تراجع</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AccountEditor({
  member,
  onSetPin,
  onSetAbilities,
}: {
  member: Account;
  onSetPin: (pin: string) => Promise<void>;
  onSetAbilities: (abilities: Ability[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<Ability>>(new Set(member.abilities));
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dirty =
    selected.size !== member.abilities.length || member.abilities.some((a) => !selected.has(a));

  const toggle = (ability: Ability): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(ability)) next.delete(ability);
      else next.add(ability);
      return next;
    });
  };

  const savePin = async (): Promise<void> => {
    setError(null);
    try {
      await onSetPin(pin);
      setPin('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div
      className="hs-stack"
      style={{
        gap: 'var(--hs-sp-7)',
        padding: 'var(--hs-sp-8) var(--hs-sp-9) var(--hs-sp-9)',
        background: 'var(--hs-page)',
      }}
    >
      <div>
        <div className="hs-field__label" id={`abilities-${member.id}`}>
          الصلاحيات
        </div>
        {member.isOwner ? (
          <p style={{ margin: 0, fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-muted)', lineHeight: 1.8 }}>
            حساب المدير يملك كل الصلاحيات ولا يمكن تقييده أو إيقافه — وإلا أمكن للمنشأة أن تُغلق
            على نفسها دفاترها.
          </p>
        ) : (
          <>
            <div
              role="group"
              aria-labelledby={`abilities-${member.id}`}
              className="hs-row"
              style={{ flexWrap: 'wrap', gap: 'var(--hs-sp-3)', marginBlockStart: 'var(--hs-sp-4)' }}
            >
              {ABILITIES.map((ability) => (
                <button
                  key={ability}
                  type="button"
                  className="hs-chip hs-chip--emerald"
                  aria-pressed={selected.has(ability)}
                  onClick={() => toggle(ability)}
                >
                  {ABILITY_LABEL[ability]}
                </button>
              ))}
            </div>
            <div className="hs-row" style={{ gap: 'var(--hs-sp-4)', marginBlockStart: 'var(--hs-sp-6)' }}>
              <Button variant="primary" disabled={!dirty} onClick={() => void onSetAbilities([...selected])}>
                حفظ الصلاحيات
              </Button>
              <Button disabled={!dirty} onClick={() => setSelected(new Set(member.abilities))}>
                تراجع
              </Button>
            </div>
          </>
        )}
      </div>

      <div style={{ borderBlockStart: '1px dashed var(--hs-border)', paddingBlockStart: 'var(--hs-sp-7)' }}>
        <Field
          label={member.hasPin ? 'إعادة تعيين رمز الدخول' : 'تعيين رمز دخول'}
          hint={`${counted(MIN_PIN_LENGTH, NOUNS.digit)} على الأقل. الرمز لا يُعرض بعد حفظه — سلّمه للمستخدم بنفسك.`}
          error={error ?? undefined}
        >
          {(props) => (
            <div className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>
              <Input
                {...props}
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                className="hs-num"
                style={{ direction: 'ltr', textAlign: 'start', flex: 1 }}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\s/g, ''))}
              />
              <Button disabled={pin.length === 0} onClick={() => void savePin()}>
                حفظ الرمز
              </Button>
            </div>
          )}
        </Field>
      </div>
    </div>
  );
}
