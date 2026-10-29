/** Client-side GS1 validation mirrors the backend so users get instant feedback. */
export function isValidGtin(raw: string): boolean {
  const code = raw.replace(/\s|-/g, '');
  if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) return false;
  const digits = code.length === 12 ? `0${code}` : code;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) sum += Number(body[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

export function barcodeProblem(raw: string): string | null {
  const code = raw.replace(/\s|-/g, '');
  if (!code) return 'Enter the number printed under the barcode.';
  if (!/^\d+$/.test(code)) return 'Barcodes contain digits only.';
  if (![8, 12, 13].includes(code.length)) return 'Supported barcodes have 8, 12 or 13 digits (EAN-8, UPC-A, EAN-13).';
  if (!isValidGtin(code)) return 'The check digit does not match. Please re-check the number.';
  return null;
}

export const PRODUCT_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
