/**
 * The primitive kit every screen is assembled from.
 *
 * These carry the design tokens and the accessibility semantics — roles on
 * tables, tabs and switches; a focus ring on everything interactive — so no
 * screen has to remember them.
 */

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useId,
} from 'react';
import './ui.css';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'action' | 'secondary' | 'glass' | 'mint';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
  size?: 'md' | 'sm';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', block, size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'hs-btn',
        `hs-btn--${variant}`,
        block && 'hs-btn--block',
        size === 'sm' && 'hs-btn--sm',
        className,
      )}
      {...rest}
    />
  );
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  dark?: boolean;
  panel?: boolean;
  lift?: boolean;
}

export function Card({ dark, panel, lift, className, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        'hs-card',
        dark && 'hs-card--dark hs-on-dark',
        panel && 'hs-card--panel',
        lift && 'hs-card--lift',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHead({
  title,
  sub,
  actions,
  as: Heading = 'h2',
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className="hs-card__head">
      <div>
        <Heading className="hs-card__title">{title}</Heading>
        {sub ? <p className="hs-card__sub">{sub}</p> : null}
      </div>
      {actions ? <div className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('hs-card__body', className)} {...rest} />;
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  bg: string;
  fg: string;
  dot?: string;
  pill?: boolean;
}

export function Badge({ bg, fg, dot, pill, children, className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx('hs-badge', pill && 'hs-badge--pill', className)}
      style={{ background: bg, color: fg }}
      {...rest}
    >
      {dot ? <span className="hs-badge__dot" style={{ background: dot }} aria-hidden /> : null}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Chip / filter chip
// ---------------------------------------------------------------------------

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  selected: boolean;
  accent?: 'ink' | 'emerald';
}

export function Chip({ selected, accent = 'ink', className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx('hs-chip', accent === 'emerald' && 'hs-chip--emerald', className)}
      {...rest}
    />
  );
}

/** A single-select chip group — the pattern used for every filter row. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  accent,
}: {
  options: readonly (T | { value: T; label: string })[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  accent?: 'ink' | 'emerald';
}) {
  const normalised = options.map((o) =>
    typeof o === 'string' ? { value: o as T, label: o } : o,
  );

  return (
    <div role="group" aria-label={label} className="hs-row" style={{ gap: 'var(--hs-sp-3)', flexWrap: 'wrap' }}>
      {normalised.map((option) => (
        <Chip
          key={option.value}
          selected={option.value === value}
          accent={accent}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="hs-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          id={`tab-${tab.value}`}
          aria-selected={tab.value === value}
          aria-controls={`panel-${tab.value}`}
          tabIndex={tab.value === value ? 0 : -1}
          className="hs-tab"
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            // Arrow keys move between tabs, mirrored for RTL by the browser's
            // own key semantics: End/Home stay absolute.
            const index = tabs.findIndex((t) => t.value === value);
            if (event.key === 'ArrowLeft') onChange(tabs[(index + 1) % tabs.length].value);
            if (event.key === 'ArrowRight') onChange(tabs[(index - 1 + tabs.length) % tabs.length].value);
            if (event.key === 'Home') onChange(tabs[0].value);
            if (event.key === 'End') onChange(tabs[tabs.length - 1].value);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void | Promise<void>;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="hs-toggle"
      onClick={() => void onChange(!checked)}
    />
  );
}

// ---------------------------------------------------------------------------
// Meter
// ---------------------------------------------------------------------------

export function Meter({
  value,
  color,
  height = 4,
  onDark,
  label,
}: {
  /** 0–1. */
  value: number;
  color: string;
  height?: number;
  onDark?: boolean;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={cx('hs-meter', onDark && 'hs-meter--on-dark')}
      style={{ height }}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="hs-meter__fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Range slider
// ---------------------------------------------------------------------------

export function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  label,
  ...rest
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type'>) {
  return (
    <input
      type="range"
      className="hs-range"
      value={value}
      min={min}
      max={max}
      aria-label={label}
      onChange={(event) => onChange(Number(event.target.value))}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label className="hs-field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <span className="hs-field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="hs-field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx('hs-input', className)} {...rest} />;
  },
);

export function Select({
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('hs-input', className)} {...rest} />;
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function Skeleton({
  height = 14,
  width = '100%',
  radius,
}: {
  height?: number | string;
  width?: number | string;
  radius?: number;
}) {
  return (
    <div
      className="hs-skeleton"
      style={{ height, width, borderRadius: radius }}
      aria-hidden
    />
  );
}

/** A skeleton stand-in for a card, shown while the database opens. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <CardBody style={{ paddingBlockStart: 'var(--hs-sp-9)' }}>
        <Skeleton height={16} width="45%" radius={6} />
        <div style={{ height: 'var(--hs-sp-6)' }} />
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} style={{ marginBlockEnd: 'var(--hs-sp-4)' }}>
            <Skeleton height={12} width={`${90 - i * 12}%`} radius={6} />
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="hs-empty">
      <span className="hs-empty__title">{title}</span>
      <p className="hs-empty__body">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="hs-error" role="alert">
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          marginBlockStart: 6,
          background: 'var(--hs-danger-solid)',
          borderRadius: 2,
          flex: 'none',
        }}
      />
      <div>
        <strong style={{ fontWeight: 600 }}>{title}</strong>
        {detail ? <div style={{ marginBlockStart: 'var(--hs-sp-1)' }}>{detail}</div> : null}
        {action ? <div style={{ marginBlockStart: 'var(--hs-sp-5)' }}>{action}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
