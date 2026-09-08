/**
 * Tax-invoice QR payload.
 *
 * The GCC/ZATCA convention is a base64 TLV structure carrying five fields:
 * seller name, VAT registration number, timestamp, invoice total and VAT
 * amount. Encoding it properly is what makes the QR scannable by a tax
 * inspector's app rather than a decorative square — and it is generated on
 * the device, so it works offline.
 */

export interface TaxQrFields {
  sellerName: string;
  vatNumber: string;
  /** ISO-8601 timestamp of issue. */
  timestamp: string;
  /** Invoice total including VAT, as a decimal string. */
  total: string;
  /** VAT amount, as a decimal string. */
  vat: string;
}

function tlv(tag: number, value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > 255) {
    throw new RangeError(`QR field ${tag} is too long for a single TLV block`);
  }
  const out = new Uint8Array(2 + bytes.length);
  out[0] = tag;
  out[1] = bytes.length;
  out.set(bytes, 2);
  return out;
}

export function buildTaxQrPayload(fields: TaxQrFields): string {
  const blocks = [
    tlv(1, fields.sellerName),
    tlv(2, fields.vatNumber),
    tlv(3, fields.timestamp),
    tlv(4, fields.total),
    tlv(5, fields.vat),
  ];
  const total = blocks.reduce((n, b) => n + b.length, 0);
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    buffer.set(block, offset);
    offset += block.length;
  }
  return base64(buffer);
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === 'function') return btoa(binary);
  // Node fallback, for tests.
  return Buffer.from(bytes).toString('base64');
}
