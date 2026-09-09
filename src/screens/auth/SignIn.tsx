/**
 * Sign in.
 *
 * Accounts are listed rather than typed: on a shop counter the staff are
 * known, and picking a face is faster than spelling a name. Only accounts the
 * owner has given a passcode appear — an account without one cannot sign in.
 */

import { useEffect, useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { useSession } from '@/state/SessionProvider';
import { useQuery } from '@/state/useQuery';
import { Button, Field } from '@/ui/primitives';
import { InitialTile } from '@/ui/composites';
import { AuthShell, PinInput } from './AuthShell';
import { num } from '@/lib/format';
import { validatePin } from '@/domain/pin';

export function SignIn() {
  const { accounts, profile, db } = useHaseeb();
  const { signIn } = useSession();

  const { data: candidates } = useQuery(
    async () => (accounts ? accounts.signInCandidates() : []),
    [accounts],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);

  // One account and nothing to choose: go straight to the keypad.
  useEffect(() => {
    if (candidates && candidates.length === 1 && !selectedId) setSelectedId(candidates[0].id);
  }, [candidates, selectedId]);

  if (recovering) {
    return <RecoverOwner onCancel={() => setRecovering(false)} />;
  }

  const selected = candidates?.find((a) => a.id === selectedId) ?? null;

  const attempt = async (): Promise<void> => {
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      const result = await signIn(selected.id, pin);
      if (!result.ok) {
        setPin('');
        setError(signInMessage(result.reason, result.retryInMs));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={profile?.name ?? 'حسيب'}
      sub={selected ? `الدخول باسم ${selected.name}` : 'اختر المستخدم للدخول'}
      footer={
        <button
          type="button"
          onClick={() => setRecovering(true)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--hs-on-dark-subtle)',
            fontSize: 'var(--hs-fs-cell)',
            cursor: 'pointer',
            textDecoration: 'underline',
            font: 'inherit',
          }}
        >
          نسيت رمز الدخول؟
        </button>
      }
    >
      {!candidates || candidates.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--hs-fs-body)', color: 'var(--hs-text-muted)', lineHeight: 1.8 }}>
          لا يوجد مستخدم يملك رمز دخول بعد. استخدم «نسيت رمز الدخول؟» لاستعادة حساب المدير برمز
          الاستعادة.
        </p>
      ) : selected ? (
        <div className="hs-stack" style={{ gap: 'var(--hs-sp-8)' }}>
          <div className="hs-row" style={{ gap: 'var(--hs-sp-5)' }}>
            <InitialTile
              name={selected.name}
              size={44}
              bg="var(--hs-ink)"
              border="var(--hs-ink)"
              fg="var(--hs-on-dark)"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--hs-fs-body-lg)', fontWeight: 600 }}>{selected.name}</div>
              <div style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)' }}>
                {selected.role}
              </div>
            </div>
            {candidates.length > 1 ? (
              <Button
                size="sm"
                onClick={() => {
                  setSelectedId(null);
                  setPin('');
                  setError(null);
                }}
              >
                تغيير
              </Button>
            ) : null}
          </div>

          <Field label="رمز الدخول" error={error ?? undefined}>
            {(props) => (
              <PinInput
                id={props.id}
                value={pin}
                onChange={setPin}
                onSubmit={() => void attempt()}
                label="رمز الدخول"
                invalid={Boolean(error)}
                autoFocus
              />
            )}
          </Field>

          <Button
            variant="primary"
            block
            disabled={busy || pin.length === 0}
            onClick={() => void attempt()}
          >
            {busy ? 'جارٍ التحقق…' : 'دخول'}
          </Button>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--hs-sp-4)' }}>
          {candidates.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(account.id);
                  setPin('');
                  setError(null);
                }}
                className="hs-row"
                style={{
                  width: '100%',
                  gap: 'var(--hs-sp-5)',
                  padding: 'var(--hs-sp-5) var(--hs-sp-6)',
                  minHeight: 'var(--hs-touch)',
                  border: '1px solid var(--hs-border)',
                  borderRadius: 'var(--hs-r-tile)',
                  background: 'var(--hs-surface-alt)',
                  cursor: 'pointer',
                  font: 'inherit',
                  textAlign: 'start',
                }}
              >
                <InitialTile name={account.name} size={38} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--hs-fs-body-lg)', fontWeight: 600 }}>
                    {account.name}
                  </span>
                  <span style={{ display: 'block', fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)' }}>
                    {account.role}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="hs-sr-only">{db ? '' : ''}</span>
    </AuthShell>
  );
}

function signInMessage(reason: string, retryInMs?: number): string {
  switch (reason) {
    case 'wrongPin':
      return 'رمز الدخول غير صحيح.';
    case 'locked': {
      const minutes = Math.max(1, Math.ceil((retryInMs ?? 0) / 60000));
      return `الحساب موقوف مؤقتاً بعد محاولات خاطئة. جرّب بعد ${num(minutes)} دقائق.`;
    }
    case 'suspended':
      return 'هذا الحساب موقوف. راجع المدير.';
    case 'noPin':
      return 'لم يُعيَّن رمز دخول لهذا الحساب بعد.';
    default:
      return 'تعذّر الدخول.';
  }
}

/** Restore the manager account with the code shown at setup. */
function RecoverOwner({ onCancel }: { onCancel: () => void }) {
  const { accounts, db } = useHaseeb();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    const invalid = validatePin(pin);
    if (invalid) {
      setError(invalid.message);
      return;
    }
    setBusy(true);
    try {
      const ok = await accounts!.resetOwnerPinWithRecoveryCode(code, pin);
      if (!ok) {
        setError('رمز الاستعادة غير صحيح.');
        return;
      }
      await db?.flush();
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّرت الاستعادة.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="تم تعيين رمز جديد" sub="ادخل الآن برمزك الجديد.">
        <Button variant="primary" block onClick={onCancel}>
          العودة لتسجيل الدخول
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="استعادة حساب المدير" sub="أدخل رمز الاستعادة الذي كتبته عند إنشاء الحساب.">
      <div className="hs-stack" style={{ gap: 'var(--hs-sp-8)' }}>
        <Field label="رمز الاستعادة">
          {(props) => (
            <input
              {...props}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="hs-input hs-num hs-signed"
              style={{ textAlign: 'center', letterSpacing: '0.12em', textTransform: 'uppercase' }}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoFocus
            />
          )}
        </Field>

        <Field label="رمز الدخول الجديد" error={error ?? undefined}>
          {(props) => (
            <PinInput
              id={props.id}
              value={pin}
              onChange={setPin}
              onSubmit={() => void submit()}
              label="رمز الدخول الجديد"
              invalid={Boolean(error)}
            />
          )}
        </Field>

        <div className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>
          <Button style={{ flex: 1 }} onClick={onCancel}>
            رجوع
          </Button>
          <Button variant="primary" style={{ flex: 1 }} disabled={busy} onClick={() => void submit()}>
            تعيين
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
