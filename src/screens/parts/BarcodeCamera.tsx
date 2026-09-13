import { useEffect, useRef, useState } from 'react';
import { BarcodeDetector } from 'barcode-detector/ponyfill';
import { Button } from '@/ui/primitives';

export function BarcodeCamera({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let frame = 0;
    let stream: MediaStream | null = null;
    const detector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
    });

    const start = async (): Promise<void> => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('هذا الجهاز لا يدعم تشغيل الكاميرا من المتصفح.');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
        if (!live || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const detect = async (): Promise<void> => {
          if (!live || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const code = results[0]?.rawValue.trim();
            if (code) {
              live = false;
              onDetected(code);
              return;
            }
          } catch {
            // A frame can fail while the camera is focusing; keep scanning.
          }
          frame = requestAnimationFrame(() => void detect());
        };
        frame = requestAnimationFrame(() => void detect());
      } catch (cause) {
        if (!live) return;
        const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
        setError(
          denied
            ? 'لم يتم السماح باستخدام الكاميرا. امنح حسيب إذن الكاميرا ثم حاول مجدداً.'
            : cause instanceof Error
              ? cause.message
              : 'تعذّر تشغيل الكاميرا.',
        );
      }
    };

    void start();
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onClose, onDetected]);

  return (
    <>
      <div className="hs-drawer__scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ماسح الباركود بالكاميرا"
        style={{
          position: 'fixed',
          insetBlockStart: '50%',
          insetInlineStart: '50%',
          transform: 'translate(50%, -50%)',
          zIndex: 62,
          width: 'min(520px, 94vw)',
          background: 'var(--hs-ink)',
          color: 'var(--hs-on-dark)',
          borderRadius: 'var(--hs-r-panel)',
          padding: 'var(--hs-sp-7)',
          boxShadow: 'var(--hs-shadow-modal)',
        }}
      >
        <div className="hs-row" style={{ justifyContent: 'space-between', gap: 'var(--hs-sp-5)', marginBlockEnd: 'var(--hs-sp-6)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--hs-fs-section)' }}>امسح باركود الصنف</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--hs-on-dark-subtle)', fontSize: 'var(--hs-fs-label)' }}>
              وجّه الكاميرا إلى الباركود وسيُضاف الصنف تلقائياً.
            </p>
          </div>
          <Button variant="glass" size="sm" onClick={onClose}>إغلاق</Button>
        </div>

        {error ? (
          <div className="hs-error" role="alert">{error}</div>
        ) : (
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--hs-r-control)', background: '#000', aspectRatio: '4 / 3' }}>
            <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div
              aria-hidden
              style={{
                position: 'absolute',
                insetBlockStart: '32%',
                insetInline: '8%',
                height: '36%',
                border: '3px solid var(--hs-mint)',
                borderRadius: 14,
                boxShadow: '0 0 0 999px rgba(0,0,0,.28)',
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
