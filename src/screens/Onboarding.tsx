/**
 * A. تسجيل المنشأة — business registration.
 *
 * Three steps, all local: the identity that prints on every invoice, the tax
 * details, and the confirmation that creates the encrypted database. Nothing
 * here contacts a server, which is the promise the left panel makes.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHaseeb } from '@/state/HaseebProvider';
import { Button, Chip, Field, Input, Select } from '@/ui/primitives';
import { num } from '@/lib/format';
import { DEFAULT_VAT_RATE } from '@/domain/tax';

const BUSINESS_TYPES = ['بقالة / سوبرماركت', 'مخبز', 'ملابس', 'قطع غيار', 'مطعم / كافيه'];

const CURRENCIES = [
  { code: 'EGP', label: 'جنيه مصري — ج.م', symbol: 'ج.م' },
  { code: 'SAR', label: 'ريال سعودي — ر.س', symbol: 'ر.س' },
  { code: 'AED', label: 'درهم إماراتي — د.إ', symbol: 'د.إ' },
];

const BENEFITS = [
  'يعمل دون إنترنت — قاعدة بيانات محلية مشفّرة',
  'نفس الحساب على الجوال والويب وسطح المكتب',
  'مزامنة مشفّرة اختيارية عند الحاجة',
];

interface Errors {
  name?: string;
  phone?: string;
  taxNumber?: string;
  confirm?: string;
}

export function Onboarding() {
  const { ops, db } = useHaseeb();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0]);
  const [currency, setCurrency] = useState(CURRENCIES[0].code);
  const [phone, setPhone] = useState('');
  const [commercialReg, setCommercialReg] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [vatRate, setVatRate] = useState(String(DEFAULT_VAT_RATE));
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const validateStep = (target: number): boolean => {
    const next: Errors = {};
    if (target >= 2) {
      if (name.trim().length < 2) next.name = 'اكتب اسم المنشأة كما يظهر على الفواتير.';
      // Egyptian mobile numbers are 11 digits starting 01; other markets vary,
      // so the rule is a length check rather than a strict national pattern.
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 8) next.phone = 'رقم الجوال غير مكتمل.';
    }
    if (target >= 3 && taxNumber.trim() && taxNumber.replace(/\D/g, '').length < 6) {
      next.taxNumber = 'الرقم الضريبي قصير — راجعه أو اتركه فارغاً.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (): void => {
    if (!validateStep(3)) return;
    if (!confirmed) {
      setErrors({ confirm: 'أكّد إنشاء قاعدة البيانات المحلية للمتابعة.' });
      return;
    }
    const chosen = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0];
    ops?.saveProfile({
      name: name.trim(),
      businessType,
      currencyCode: chosen.code,
      currencyLabel: chosen.symbol,
      phone: phone.trim(),
      commercialReg: commercialReg.trim(),
      taxNumber: taxNumber.trim(),
      vatRate: Number(vatRate) || DEFAULT_VAT_RATE,
      onboardedAt: new Date().toISOString(),
    });
    void db?.flush();
    navigate('/', { replace: true });
  };

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--hs-page)', padding: 'var(--hs-sp-11)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))',
          gap: 'var(--hs-sp-9)',
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        <BrandPanel />

        <section
          style={{
            background: 'var(--hs-surface)',
            border: '1px solid var(--hs-border-card)',
            borderRadius: 'var(--hs-r-hero)',
            padding: 'var(--hs-sp-12)',
            boxShadow: 'var(--hs-shadow-modal)',
          }}
        >
          <div className="hs-row" style={{ gap: 'var(--hs-sp-3)', marginBlockEnd: 'var(--hs-sp-10)' }}>
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 'var(--hs-r-pill)',
                  background: s <= step ? 'var(--hs-emerald)' : 'var(--hs-text-dim)',
                  transition: 'background var(--hs-motion)',
                }}
              />
            ))}
            <span className="hs-num" style={{ fontSize: 'var(--hs-fs-meta)', color: 'var(--hs-text-subtle)' }}>
              {num(step)} / {num(3)}
            </span>
          </div>

          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>تسجيل المنشأة</h1>
          <p style={{ margin: '5px 0 var(--hs-sp-10)', fontSize: 'var(--hs-fs-body)', color: 'var(--hs-text-muted)' }}>
            هذه البيانات تظهر على فواتيرك وتقاريرك.
          </p>

          <div className="hs-stack" style={{ gap: 'var(--hs-sp-9)' }}>
            {step === 1 ? (
              <>
                <Field label="اسم الشركة/المحل التجاري" error={errors.name}>
                  {(props) => (
                    <Input
                      {...props}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="مثال: مؤسسة النور التجارية"
                      autoComplete="organization"
                    />
                  )}
                </Field>

                <div>
                  <span className="hs-field__label">نوع النشاط التجاري</span>
                  <div className="hs-row" style={{ gap: 'var(--hs-sp-3)', flexWrap: 'wrap' }}>
                    {BUSINESS_TYPES.map((type) => (
                      <Chip
                        key={type}
                        accent="emerald"
                        selected={type === businessType}
                        onClick={() => setBusinessType(type)}
                      >
                        {type}
                      </Chip>
                    ))}
                  </div>
                </div>

                <Field label="العملة">
                  {(props) => (
                    <Select {...props} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="رقم الجوال" error={errors.phone}>
                  {(props) => (
                    <Input
                      {...props}
                      className="hs-input hs-num"
                      type="tel"
                      inputMode="tel"
                      dir="ltr"
                      style={{ textAlign: 'end' }}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01xxxxxxxxx"
                      autoComplete="tel"
                    />
                  )}
                </Field>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Field label="السجل التجاري" hint="اختياري — يظهر أعلى الفاتورة الضريبية.">
                  {(props) => (
                    <Input
                      {...props}
                      className="hs-input hs-num"
                      value={commercialReg}
                      onChange={(e) => setCommercialReg(e.target.value)}
                      placeholder="448291"
                    />
                  )}
                </Field>

                <Field label="الرقم الضريبي" error={errors.taxNumber} hint="يُطبع على كل فاتورة ضريبية.">
                  {(props) => (
                    <Input
                      {...props}
                      className="hs-input hs-num"
                      value={taxNumber}
                      onChange={(e) => setTaxNumber(e.target.value)}
                      placeholder="302199487"
                    />
                  )}
                </Field>

                <Field label="نسبة ضريبة القيمة المضافة (٪)">
                  {(props) => (
                    <Input
                      {...props}
                      className="hs-input hs-num"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                    />
                  )}
                </Field>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Summary
                  rows={[
                    ['اسم المنشأة', name || '—'],
                    ['النشاط', businessType],
                    ['العملة', CURRENCIES.find((c) => c.code === currency)?.label ?? '—'],
                    ['رقم الجوال', phone || '—'],
                    ['الرقم الضريبي', taxNumber || '—'],
                  ]}
                />

                <button
                  type="button"
                  onClick={() => {
                    setConfirmed((c) => !c);
                    setErrors((e) => ({ ...e, confirm: undefined }));
                  }}
                  aria-pressed={confirmed}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--hs-sp-5)',
                    textAlign: 'start',
                    width: '100%',
                    background: 'var(--hs-mint-bg)',
                    border: '1px solid var(--hs-mint-border)',
                    borderRadius: 15,
                    padding: 15,
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 20,
                      height: 20,
                      flex: 'none',
                      borderRadius: 6,
                      marginBlockStart: 2,
                      background: confirmed ? 'var(--hs-emerald)' : 'transparent',
                      border: `1.5px solid var(--hs-emerald)`,
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 12,
                    }}
                  >
                    {confirmed ? '✓' : ''}
                  </span>
                  <span>
                    <span style={{ display: 'block', fontSize: 'var(--hs-fs-body)', fontWeight: 600, color: 'var(--hs-emerald-deep)' }}>
                      تأكيد إنشاء قاعدة البيانات المحلية
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 'var(--hs-fs-label)',
                        color: 'var(--hs-emerald-dark)',
                        lineHeight: 1.7,
                        marginBlockStart: 4,
                      }}
                    >
                      ستُنشأ قاعدة بيانات مشفّرة على هذا الجهاز. تعمل كل الشاشات دون إنترنت،
                      والمزامنة المشفّرة اختيارية تماماً.
                    </span>
                  </span>
                </button>
                {errors.confirm ? (
                  <span className="hs-field__error" role="alert">
                    {errors.confirm}
                  </span>
                ) : null}
              </>
            ) : null}

            <div className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>
              {step > 1 ? (
                <Button onClick={() => setStep((s) => s - 1)}>السابق</Button>
              ) : null}
              {step < 3 ? (
                <Button
                  variant="primary"
                  block
                  style={{ padding: 15, fontSize: 14.5, fontWeight: 600, borderRadius: 15, boxShadow: 'var(--hs-shadow-cta)' }}
                  onClick={() => {
                    if (validateStep(step + 1)) setStep((s) => s + 1);
                  }}
                >
                  التالي
                </Button>
              ) : (
                <Button
                  variant="primary"
                  block
                  style={{ padding: 15, fontSize: 14.5, fontWeight: 600, borderRadius: 15, boxShadow: 'var(--hs-shadow-cta)' }}
                  onClick={submit}
                >
                  إنشاء المنشأة والمتابعة
                </Button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <section
      className="hs-on-dark"
      style={{
        background: 'var(--hs-ink)',
        borderRadius: 'var(--hs-r-hero)',
        padding: 'var(--hs-sp-13)',
        minHeight: 500,
        position: 'relative',
        overflow: 'hidden',
        color: 'var(--hs-on-dark)',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          width: 240,
          height: 240,
          insetBlockStart: -70,
          insetInlineEnd: -70,
          background: 'radial-gradient(circle at 40% 40%, rgba(16,185,129,.32), transparent 68%)',
        }}
      />
      <div style={{ position: 'relative' }}>
        <span
          style={{
            width: 76,
            height: 76,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 'var(--hs-r-hero)',
            background: 'var(--hs-on-dark)',
            boxShadow: '0 18px 40px -18px rgba(2,6,23,.9)',
            overflow: 'hidden',
          }}
        >
          <img src="./assets/haseeb-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} />
        </span>

        <h2 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.4px', margin: 'var(--hs-sp-11) 0 0' }}>
          أهلاً بك في حسيب
        </h2>
        <p
          style={{
            fontSize: 15,
            color: 'var(--hs-on-dark-subtle)',
            lineHeight: 1.8,
            maxWidth: 360,
            margin: 'var(--hs-sp-6) 0 var(--hs-sp-12)',
          }}
        >
          حساباتك بدقة.. وأمان. أنشئ حساب منشأتك في دقيقة، وستعمل بياناتك محلياً على جهازك دون
          الحاجة لإنترنت.
        </p>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--hs-sp-7)' }}>
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="hs-row" style={{ gap: 'var(--hs-sp-5)' }}>
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  flex: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 8,
                  background: 'rgba(16,185,129,.16)',
                  border: '1px solid rgba(16,185,129,.35)',
                }}
              >
                <span style={{ width: 7, height: 7, background: 'var(--hs-mint)' }} />
              </span>
              <span style={{ fontSize: 'var(--hs-fs-body)', color: 'var(--hs-on-dark-muted)' }}>{benefit}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Summary({ rows }: { rows: readonly [string, string][] }) {
  return (
    <dl
      style={{
        margin: 0,
        background: 'var(--hs-surface-alt)',
        border: '1px solid var(--hs-border)',
        borderRadius: 'var(--hs-r-tile)',
        padding: 'var(--hs-sp-6) var(--hs-sp-8)',
        display: 'grid',
        gap: 'var(--hs-sp-4)',
      }}
    >
      {rows.map(([label, value]) => (
        <div key={label} className="hs-row" style={{ justifyContent: 'space-between', gap: 'var(--hs-sp-6)' }}>
          <dt style={{ fontSize: 'var(--hs-fs-label)', color: 'var(--hs-text-muted)' }}>{label}</dt>
          <dd style={{ margin: 0, fontSize: 'var(--hs-fs-cell)', fontWeight: 600 }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
