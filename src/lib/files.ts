/**
 * Getting a file out of the app, and back into another one.
 *
 * The browser and a phone disagree about what "save this file" means. A
 * browser downloads it; an Android WebView has no download folder of its own
 * and an `<a download>` there quietly does nothing. So on a phone the bytes
 * are written through the platform's own filesystem and then handed to the
 * share sheet — which is also what makes the transfer to the second device a
 * two-tap operation instead of a file-manager expedition.
 */

/** True on Android and iOS under Capacitor. Read from the global, so a plain
 * web build never pulls the native plugins into its bundle. */
function isNative(): boolean {
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof capacitor?.isNativePlatform === 'function' && capacitor.isNativePlatform();
}

export interface SaveResult {
  /** How the file left the app, so the UI can say where to look for it. */
  via: 'download' | 'shared' | 'file';
  /** Where it landed on a phone; absent in a browser. */
  location?: string;
}

export async function saveFile(
  filename: string,
  bytes: Uint8Array,
  mime = 'application/octet-stream',
): Promise<SaveResult> {
  if (isNative()) return saveNative(filename, bytes);

  // Copied first, so the Blob owns a plain ArrayBuffer whatever the bytes
  // were a view onto.
  const buffer = bytes.slice().buffer as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { via: 'download' };
}

async function saveNative(filename: string, bytes: Uint8Array): Promise<SaveResult> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: toBase64(bytes),
    directory: Directory.Documents,
    recursive: true,
  });

  // The share sheet is optional: if the device has nothing to share with, the
  // file is still saved and the UI says where.
  try {
    const { Share } = await import('@capacitor/share');
    const { value } = await Share.canShare();
    if (value) {
      await Share.share({ title: filename, url: uri, dialogTitle: 'إرسال النسخة الاحتياطية' });
      return { via: 'shared', location: uri };
    }
  } catch {
    // A cancelled share sheet is not a failed save.
  }
  return { via: 'file', location: uri };
}

/** Chunked so a multi-megabyte backup does not blow the argument limit. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
