/** The dark brand panel every auth screen sits on. */

import type { ReactNode } from 'react';

export function AuthShell({
  title,
  sub,
  children,
  footer,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--hs-ink)',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--hs-sp-9)',
      }}
    >
      <div style={{ width: 'min(420px, 100%)' }}>
        <div
          className="hs-stack"
          style={{ alignItems: 'center', gap: 'var(--hs-sp-6)', marginBlockEnd: 'var(--hs-sp-11)' }}
        >
          <span
            style={{
              width: 68,
              height: 68,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 20,
              background: 'var(--hs-on-dark)',
              boxShadow: '0 18px 40px -18px rgba(2,6,23,.9)',
              overflow: 'hidden',
            }}
          >
            <img
              src="./assets/haseeb-icon.png"
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5 }}
            />
          </span>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: 'var(--hs-on-dark)' }}>
              {title}
            </h1>
            {sub ? (
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 'var(--hs-fs-body)',
                  color: 'var(--hs-on-dark-subtle)',
                  lineHeight: 1.7,
                }}
              >
                {sub}
              </p>
            ) : null}
          </div>
        </div>

        <div
          style={{
            background: 'var(--hs-surface)',
            borderRadius: 'var(--hs-r-hero)',
            padding: 'var(--hs-sp-12)',
            boxShadow: 'var(--hs-shadow-modal)',
          }}
        >
          {children}
        </div>

        {footer ? (
          <div style={{ marginBlockStart: 'var(--hs-sp-8)', textAlign: 'center' }}>{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/** A numeric passcode field: large, centred, and never shown in the clear. */
export function PinInput({
  value,
  onChange,
  onSubmit,
  label,
  autoFocus,
  invalid,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  label: string;
  autoFocus?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  return (
    <input
      id={id}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      aria-label={label}
      aria-invalid={invalid}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\s/g, ''))}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onSubmit) onSubmit();
      }}
      className="hs-input hs-num"
      style={{
        textAlign: 'center',
        fontSize: 26,
        letterSpacing: '0.4em',
        paddingInline: 'var(--hs-sp-6)',
        direction: 'ltr',
      }}
    />
  );
}
