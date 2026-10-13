/**
 * Port of Laravel Edi837FieldFormatValidator — shared date/amount checks.
 */
export class FieldFormatValidator {
  static isValidD8(value: string | null | undefined): boolean {
    if (value == null || value.length !== 8 || !/^\d{8}$/.test(value)) return false;
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6));
    const d = Number(value.slice(6, 8));
    const parsed = new Date(Date.UTC(y, m - 1, d));
    return (
      parsed.getUTCFullYear() === y &&
      parsed.getUTCMonth() === m - 1 &&
      parsed.getUTCDate() === d
    );
  }

  static isValidYyMmDd(value: string | null | undefined): boolean {
    return FieldFormatValidator.parseYyMmDd(value) !== null;
  }

  /** Returns local calendar Date at start of day, or null. */
  static parseYyMmDd(value: string | null | undefined): Date | null {
    if (value == null || value.length !== 6 || !/^\d{6}$/.test(value)) return null;
    const year = Number(value.slice(0, 2));
    const fullYear = year > 50 ? 1900 + year : 2000 + year;
    const m = Number(value.slice(2, 4));
    const d = Number(value.slice(4, 6));
    const parsed = new Date(fullYear, m - 1, d);
    if (
      parsed.getFullYear() !== fullYear ||
      parsed.getMonth() !== m - 1 ||
      parsed.getDate() !== d
    ) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  static isValidAmount(value: string | null | undefined): boolean {
    if (value == null || value === '') return false;
    return /^(?:\d+(\.\d{1,2})?|\.\d{1,2})$/.test(value);
  }

  static parseRd8(value: string | null | undefined): [string | null, string | null] {
    if (value == null || !value.includes('-')) return [null, null];
    const [from, to] = value.split('-', 2);
    return [from ?? null, to ?? null];
  }

  static todayStart(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
