export function validateNpiLuhn(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;
  const prefix = '80840' + npi;
  let sum = 0;
  let alternate = true;
  for (let i = prefix.length - 1; i >= 0; i--) {
    let n = Number(prefix[i]);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}
