/** CMS NPI Luhn checksum (80840 prefix). */
export class NpiValidator {
  validateLuhn(npi: string): boolean {
    if (npi.length !== 10) {
      return false;
    }

    const prefixed = `80840${npi}`;
    let sum = 0;
    let alternate = false;

    for (let i = prefixed.length - 1; i >= 0; i--) {
      let n = Number(prefixed[i]);
      if (!Number.isFinite(n)) return false;

      if (alternate) {
        n *= 2;
        if (n > 9) {
          n = (n % 10) + 1;
        }
      }

      sum += n;
      alternate = !alternate;
    }

    return sum % 10 === 0;
  }
}

export const npiValidator = new NpiValidator();
