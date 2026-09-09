/**
 * Moving the books between devices.
 *
 * حسيب has no server, so there is no account that follows the shop from the
 * phone to the desktop. What crosses instead is a file: everything in the
 * ledger, sealed with a passphrase the owner chooses. That is the honest
 * trade — nothing to breach, nothing to subscribe to, and a transfer that is
 * a deliberate act rather than a background process.
 *
 * Import is a replacement, not a merge, and the screen says so before it
 * happens: two devices that each sold the last unit cannot both be right, and
 * guessing which one is would be worse than asking.
 */

import { useRef, useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { Button, Card, CardBody, CardHead, Field, Input } from '@/ui/primitives';
import {
  MIN_PASSPHRASE_LENGTH,
  backupFilename,
  exportBackup,
  readBackup,
  restoreBackup,
  type BackupManifest,
} from '@/lib/backup';
import { readFileBytes, saveFile, type SaveResult } from '@/lib/files';
import { NOUNS, counted, dateAndTime } from '@/lib/format';

export function DataTransfer() {
  return (
    <Card panel style={{ minWidth: 0 }}>
      <CardHead
        title="نقل البيانات بين الأجهزة"
        sub="ملف واحد مشفّر بكلمة سر تختارها — بدون سيرفر وبدون إنترنت"
      />
      <CardBody className="hs-stack" style={{ gap: 'var(--hs-sp-10)' }}>
        <ExportPanel />
        <div style={{ borderBlockStart: '1px dashed var(--hs-border)' }} />
        <ImportPanel />
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ExportPanel() {
  const { db, ops, profile } = useHaseeb();
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ manifest: BackupManifest; save: SaveResult } | null>(null);

  const run = async (): Promise<void> => {
    setError(null);
    if (passphrase !== confirm) {
      setError('كلمتا السر غير متطابقتين.');
      return;
    }
    if (!db) return;

    setBusy(true);
    try {
      const { bytes, manifest } = await exportBackup(db, passphrase);
      const save = await saveFile(backupFilename(profile?.name ?? 'حسيب'), bytes);
      await ops?.recordBackup(`تصدير نسخة مشفّرة (${describe(manifest)})`);
      await db.flush();
      setDone({ manifest, save });
      setPassphrase('');
      setConfirm('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hs-stack" style={{ gap: 'var(--hs-sp-6)' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 'var(--hs-fs-cell)', fontWeight: 600 }}>تصدير نسخة</h3>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-muted)', lineHeight: 1.8 }}>
          كلمة السر لا تُحفظ في أي مكان. من ينسى كلمة سر الملف لا يستطيع أحد فتحه له — ولا نحن.
        </p>
      </div>

      <Field label="كلمة سر الملف" hint={`${counted(MIN_PASSPHRASE_LENGTH, NOUNS.letter)} على الأقل.`}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        )}
      </Field>

      <Field label="تأكيد كلمة السر" error={error ?? undefined}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
      </Field>

      <div className="hs-row" style={{ gap: 'var(--hs-sp-4)', flexWrap: 'wrap' }}>
        <Button variant="primary" disabled={busy || passphrase.length === 0} onClick={() => void run()}>
          {busy ? 'جارٍ التصدير…' : 'تصدير نسخة مشفّرة'}
        </Button>
      </div>

      {done ? (
        <p
          role="status"
          style={{ margin: 0, fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-mint-text)', lineHeight: 1.9 }}
        >
          {savedWhere(done.save)} — {describe(done.manifest)}.
        </p>
      ) : null}
    </section>
  );
}

function savedWhere(save: SaveResult): string {
  if (save.via === 'shared') return 'تم إنشاء الملف وفتح قائمة الإرسال';
  if (save.via === 'file') return `حُفظ الملف في ${save.location ?? 'مجلد المستندات'}`;
  return 'نُزِّل الملف على هذا الجهاز';
}

// ---------------------------------------------------------------------------

function ImportPanel() {
  const { db } = useHaseeb();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [preview, setPreview] = useState<BackupManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState<BackupManifest | null>(null);

  const inspect = async (): Promise<void> => {
    setError(null);
    setPreview(null);
    if (!file) {
      setError('اختر ملف النسخة أولاً.');
      return;
    }
    setBusy(true);
    try {
      const { manifest } = await readBackup(await readFileBytes(file), passphrase);
      setPreview(manifest);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (): Promise<void> => {
    if (!file || !db) return;
    setBusy(true);
    setError(null);
    try {
      const manifest = await restoreBackup(db, await readFileBytes(file), passphrase);
      setRestored(manifest);
      setPreview(null);
      setFile(null);
      setPassphrase('');
      if (input.current) input.current.value = '';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hs-stack" style={{ gap: 'var(--hs-sp-6)' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 'var(--hs-fs-cell)', fontWeight: 600 }}>استيراد نسخة</h3>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-muted)', lineHeight: 1.8 }}>
          الاستيراد <strong>يستبدل</strong> كل ما على هذا الجهاز — المبيعات والمخزن والديون
          والمستخدمين ورموز دخولهم. لا يُدمج مع البيانات الحالية.
        </p>
      </div>

      <Field label="ملف النسخة (‎.hsb)">
        {(props) => (
          <input
            {...props}
            ref={input}
            type="file"
            accept=".hsb,application/octet-stream"
            className="hs-input"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setRestored(null);
              setError(null);
            }}
          />
        )}
      </Field>

      <Field label="كلمة سر الملف" error={error ?? undefined}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setPreview(null);
            }}
          />
        )}
      </Field>

      {preview ? (
        <div
          style={{
            border: '1px solid var(--hs-warn-border, var(--hs-border))',
            background: 'var(--hs-warn-bg)',
            borderRadius: 'var(--hs-r-card)',
            padding: 'var(--hs-sp-7)',
          }}
        >
          <div style={{ fontSize: 'var(--hs-fs-cell)', fontWeight: 600 }}>
            نسخة «{preview.business}» — {dateAndTime(preview.createdAt)}
          </div>
          <div style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-warn-text)', marginBlockStart: 4, lineHeight: 1.9 }}>
            {describe(preview)}.
          </div>
          <div className="hs-row" style={{ gap: 'var(--hs-sp-4)', marginBlockStart: 'var(--hs-sp-7)', flexWrap: 'wrap' }}>
            <Button variant="action" disabled={busy} onClick={() => void apply()}>
              {busy ? 'جارٍ الاستبدال…' : 'استبدال بيانات هذا الجهاز'}
            </Button>
            <Button onClick={() => setPreview(null)}>تراجع</Button>
          </div>
        </div>
      ) : (
        <div className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>
          <Button disabled={busy || !file || passphrase.length === 0} onClick={() => void inspect()}>
            {busy ? 'جارٍ الفحص…' : 'فحص الملف'}
          </Button>
        </div>
      )}

      {restored ? (
        <p
          role="status"
          style={{ margin: 0, fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-mint-text)', lineHeight: 1.9 }}
        >
          استُبدلت البيانات بنسخة «{restored.business}». رموز الدخول الآن هي رموز الجهاز الذي
          صُدِّرت منه.
        </p>
      ) : null}
    </section>
  );
}

/** A one-line inventory of the file: items, sales, invoices, customers, users. */
function describe(manifest: BackupManifest): string {
  const c = manifest.counts;
  return [
    counted(c.products ?? 0, NOUNS.item),
    counted(c.sales ?? 0, NOUNS.sale),
    counted(c.invoices ?? 0, NOUNS.invoice),
    counted(c.customers ?? 0, NOUNS.customer),
    counted(c.staff ?? 0, NOUNS.user),
  ].join(' · ');
}
