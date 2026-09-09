/**
 * First run: create the manager account.
 *
 * The recovery code is shown once, here, and nowhere else. With no server
 * there is no reset e-mail — if the owner forgets the passcode and has no
 * code, the books are unreachable. So the screen refuses to move on until the
 * owner confirms they have written it down.
 */

import { useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { useSession } from '@/state/SessionProvider';
import { Button, Field, Input } from '@/ui/primitives';
import { AuthShell, PinInput } from './AuthShell';
import { validatePin } from '@/domain/pin';

export function OwnerSetup() {
  const { accounts, db } = useHaseeb();
  const { signIn } = useSession();

  const [name, setName] = useState('المدير');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<{ code: string; id: string } | null>(null);
  const [written, setWritten] = useState(false);

  const create = async (): Promise<void> => {
    setError(null);
    if (name.trim().length < 2) {
      setError('اكتب اسم المدير.');
      return;
    }
    const invalid = validatePin(pin);
    if (invalid) {
      setError(invalid.message);
      return;
    }
    if (pin !== confirm) {
      setError('الرمزان غير متطابقين.');
      return;
    }

    setBusy(true);
    try {
      const result = await accounts!.createOwner(name.trim(), pin);
      await db?.flush();
      setRecovery({ code: result.recoveryCode, id: result.account.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إنشاء الحساب.');
    } finally {
      setBusy(false);
    }
  };

  if (recovery) {
    return (
      <AuthShell title="رمز الاستعادة" sub="اكتبه في مكان آمن الآن. لن يظهر مرة أخرى.">
        <div
          style={{
            background: 'var(--hs-warn-bg)',
            border: '1px solid var(--hs-warn-border)',
            borderRadius: 'var(--hs-r-tile)',
            padding: 'var(--hs-sp-8)',
            textAlign: 'center',
          }}
        >
          <div
            className="hs-num"
            style={{
              // Sized to the viewport and allowed to wrap: nineteen wide-spaced
              // characters do not fit across a 390px phone, and a recovery code
              // that runs off the edge of the one screen it is ever shown on is
              // a recovery code the owner cannot write down.
              fontSize: 'clamp(16px, 5vw, 22px)',
              fontWeight: 600,
              letterSpacing: '0.1em',
              color: 'var(--hs-warn-text)',
              direction: 'ltr',
              unicodeBidi: 'isolate',
              overflowWrap: 'anywhere',
            }}
          >
            {recovery.code}
          </div>
        </div>

        <p
          style={{
            fontSize: 'var(--hs-fs-body)',
            color: 'var(--hs-text-muted)',
            lineHeight: 1.8,
            marginBlockStart: 'var(--hs-sp-8)',
          }}
        >
          البرنامج يعمل بالكامل على جهازك، فلا يوجد بريد لاستعادة الرمز. لو نسيت رمز الدخول، هذا
          الرمز هو الطريقة الوحيدة للرجوع إلى حساباتك.
        </p>

        <label
          className="hs-row hs-check-row"
          style={{ gap: 'var(--hs-sp-5)', cursor: 'pointer', marginBlockStart: 'var(--hs-sp-7)' }}
        >
          <input
            type="checkbox"
            className="hs-check"
            checked={written}
            onChange={(event) => setWritten(event.target.checked)}
          />
          <span style={{ fontSize: 'var(--hs-fs-body)', fontWeight: 600 }}>
            كتبتُ الرمز واحتفظتُ به في مكان آمن
          </span>
        </label>

        <div style={{ marginBlockStart: 'var(--hs-sp-9)' }}>
          <Button
            variant="primary"
            block
            disabled={!written}
            onClick={() => void signIn(recovery.id, pin)}
          >
            الدخول إلى حسيب
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="إنشاء حساب المدير"
      sub="حساب واحد له كل الصلاحيات. تضيف باقي الموظفين بعد الدخول."
    >
      <div className="hs-stack" style={{ gap: 'var(--hs-sp-8)' }}>
        <Field label="اسم المدير">
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثال: محمد عماد"
              autoFocus
            />
          )}
        </Field>

        <Field label="رمز الدخول" hint="من أربع إلى اثنتي عشرة خانة، بلا تكرار أو تتابع.">
          {(props) => (
            <PinInput
              id={props.id}
              value={pin}
              onChange={setPin}
              label="رمز الدخول"
              invalid={Boolean(error)}
            />
          )}
        </Field>

        <Field label="تأكيد رمز الدخول">
          {(props) => (
            <PinInput
              id={props.id}
              value={confirm}
              onChange={setConfirm}
              onSubmit={() => void create()}
              label="تأكيد رمز الدخول"
              invalid={Boolean(error)}
            />
          )}
        </Field>

        {error ? (
          <span className="hs-field__error" role="alert">
            {error}
          </span>
        ) : null}

        <Button variant="primary" block disabled={busy} onClick={() => void create()}>
          {busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
        </Button>
      </div>
    </AuthShell>
  );
}
