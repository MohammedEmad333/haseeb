/**
 * The printable tax invoice — «فاتورة ضريبية».
 *
 * This card is the print artifact: `print.css` hides the app chrome and lays
 * the card out on the page, so «طباعة» produces the document itself rather
 * than a screenshot of the app around it.
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/ui/primitives';
import type { InvoiceWithLines } from '@/db/types';
import type { BusinessProfile } from '@/db/types';
import { buildTaxQrPayload } from '@/lib/zatca';
import { dateFull, digits, money, num, percent } from '@/lib/format';

export function TaxInvoice({
  invoice,
  profile,
}: {
  invoice: InvoiceWithLines;
  profile: BusinessProfile | null;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const unit = profile?.currencyLabel ?? 'ج.م';
  const vatRate = profile?.vatRate ?? 14;

  useEffect(() => {
    let cancelled = false;
    const payload = buildTaxQrPayload({
      sellerName: profile?.name ?? 'حسيب',
      vatNumber: profile?.taxNumber ?? '',
      timestamp: invoice.issuedAt,
      total: (invoice.total / 100).toFixed(2),
      vat: (invoice.vat / 100).toFixed(2),
    });

    // Rendered locally by the bundled encoder — no QR service is contacted.
    QRCode.toDataURL(payload, { margin: 0, width: 144, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [invoice, profile]);

  return (
    <div>
      <div
        ref={cardRef}
        className="hs-print-target"
        style={{
          background: 'var(--hs-surface)',
          borderRadius: 'var(--hs-r-panel)',
          padding: 20,
          boxShadow: 'var(--hs-shadow-raised)',
        }}
      >
        <div className="hs-row" style={{ justifyContent: 'space-between', gap: 'var(--hs-sp-6)', alignItems: 'flex-start' }}>
          <div className="hs-row" style={{ gap: 'var(--hs-sp-5)' }}>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                background: 'var(--hs-surface-alt)',
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
                flex: 'none',
              }}
            >
              <img src="./assets/haseeb-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3 }} />
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{profile?.name ?? 'حسيب'}</div>
              <div className="hs-num" style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)', marginBlockStart: 2 }}>
                س.ت {profile?.commercialReg ? digits(profile.commercialReg) : '—'} · الرقم الضريبي{' '}
                {profile?.taxNumber ? digits(profile.taxNumber) : '—'}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'end' }}>
            <div style={{ fontSize: 'var(--hs-fs-body)', fontWeight: 600 }}>فاتورة ضريبية</div>
            <div className="hs-num" style={{ fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-text-muted)', marginBlockStart: 2 }}>
              #{invoice.invoiceNo}
            </div>
          </div>
        </div>

        <hr style={{ border: 0, borderBlockStart: '1px dashed var(--hs-border)', margin: 'var(--hs-sp-8) 0' }} />

        <div className="hs-row" style={{ gap: 'var(--hs-sp-11)', flexWrap: 'wrap' }}>
          <Meta label="العميل" value={invoice.customerName} />
          <Meta label="التاريخ" value={dateFull(invoice.issuedAt)} mono />
          <Meta label="الاستحقاق" value={invoice.dueAt ? dateFull(invoice.dueAt) : 'فوري'} mono />
        </div>

        <ul style={{ listStyle: 'none', margin: 'var(--hs-sp-9) 0 0', padding: 0, display: 'grid', gap: 'var(--hs-sp-5)' }}>
          {invoice.lines.map((line) => (
            <li key={line.id} className="hs-row" style={{ gap: 'var(--hs-sp-6)' }}>
              <span style={{ flex: 1, fontSize: 'var(--hs-fs-cell)' }}>{line.name}</span>
              <span className="hs-num hs-signed" style={{ fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-text-subtle)' }}>
                ×{num(line.qty)}
              </span>
              <span className="hs-num" style={{ fontSize: 'var(--hs-fs-cell)', fontWeight: 600, minWidth: 74, textAlign: 'end' }}>
                {money(line.total)}
              </span>
            </li>
          ))}
        </ul>

        <hr style={{ border: 0, borderBlockStart: '1px dashed var(--hs-border)', margin: 'var(--hs-sp-9) 0' }} />

        <div className="hs-row" style={{ justifyContent: 'space-between', gap: 'var(--hs-sp-9)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 'none' }}>
            {qr ? (
              <img
                src={qr}
                alt="رمز الاستجابة السريعة للفاتورة الضريبية"
                width={72}
                height={72}
                style={{ borderRadius: 2, boxShadow: '0 0 0 4px #fff, 0 0 0 5px var(--hs-border)' }}
              />
            ) : qrError ? (
              <span style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-danger-text)' }}>
                تعذّر توليد رمز QR
              </span>
            ) : (
              <span className="hs-skeleton" style={{ display: 'block', width: 72, height: 72, borderRadius: 2 }} />
            )}
          </div>

          <dl style={{ margin: 0, display: 'grid', gap: 'var(--hs-sp-4)', minWidth: 220 }}>
            <TotalRow label="الإجمالي قبل الضريبة" value={money(invoice.subtotal)} />
            <TotalRow
              label={`ضريبة القيمة المضافة ${percent(vatRate, vatRate % 1 === 0 ? 0 : 1)}`}
              value={money(invoice.vat)}
            />
            <TotalRow label="المستحق" value={`${money(invoice.total)} ${unit}`} strong />
          </dl>
        </div>
      </div>

      <div className="hs-row hs-no-print" style={{ gap: 'var(--hs-sp-4)', marginBlockStart: 'var(--hs-sp-7)' }}>
        <Button variant="action" style={{ flex: 1 }} onClick={() => window.print()}>
          طباعة
        </Button>
        <Button style={{ flex: 1 }} onClick={() => window.print()}>
          مشاركة PDF
        </Button>
      </div>
      <p className="hs-no-print" style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)', marginBlockStart: 'var(--hs-sp-5)', lineHeight: 1.7 }}>
        «مشاركة PDF» تفتح حوار الطباعة — اختر «حفظ كـ PDF». الفاتورة تُبنى على الجهاز ولا تُرسَل
        إلى أي خدمة.
      </p>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)' }}>{label}</div>
      <div className={mono ? 'hs-num' : undefined} style={{ fontSize: 'var(--hs-fs-cell)', fontWeight: 500, marginBlockStart: 2 }}>
        {value}
      </div>
    </div>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="hs-row" style={{ justifyContent: 'space-between', gap: 'var(--hs-sp-8)' }}>
      <dt style={{ fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-text-muted)' }}>{label}</dt>
      <dd
        className="hs-num"
        style={{
          margin: 0,
          fontSize: strong ? 20 : 'var(--hs-fs-cell)',
          fontWeight: 600,
          color: strong ? 'var(--hs-emerald)' : 'var(--hs-ink)',
        }}
      >
        {value}
      </dd>
    </div>
  );
}
