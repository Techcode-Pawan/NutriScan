/**
 * GS1 barcode normalisation (thesis Table 3.2, step 1): keep numeric EAN-8, UPC-A and EAN-13
 * codes, convert UPC-A to 13 digits with a leading zero, and verify the check digit.
 */
export type BarcodeResult =
  | { valid: true; gtin: string; format: 'EAN-8' | 'EAN-13' | 'UPC-A' }
  | { valid: false; reason: string };

export function gs1CheckDigitValid(digits: string): boolean {
  const body = digits.slice(0, -1);
  const check = Number(digits[digits.length - 1]);
  let sum = 0;
  // Weights alternate 3,1,3,1... starting from the digit next to the check digit.
  for (let i = body.length - 1, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) {
    sum += Number(body[i]) * w;
  }
  return (10 - (sum % 10)) % 10 === check;
}

export function normalizeBarcode(raw: unknown): BarcodeResult {
  if (raw === null || raw === undefined) return { valid: false, reason: 'empty' };
  const code = String(raw).trim().replace(/[\s-]/g, '');
  if (code.length === 0) return { valid: false, reason: 'empty' };
  if (!/^\d+$/.test(code)) return { valid: false, reason: 'non-numeric' };
  let candidate = code;
  let format: 'EAN-8' | 'EAN-13' | 'UPC-A';
  if (code.length === 8) format = 'EAN-8';
  else if (code.length === 12) {
    format = 'UPC-A';
    candidate = `0${code}`;
  } else if (code.length === 13) format = 'EAN-13';
  else if (code.length === 14 && code.startsWith('0')) {
    // GTIN-14 with a leading packaging-indicator zero is the same item as its EAN-13
    format = 'EAN-13';
    candidate = code.slice(1);
  } else return { valid: false, reason: `unsupported length ${code.length}` };
  if (!gs1CheckDigitValid(candidate)) return { valid: false, reason: 'check digit mismatch' };
  return { valid: true, gtin: candidate, format };
}
