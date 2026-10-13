/** CMS place of service code checks for CLM05-1 (Laravel Edi837PlaceOfServiceValidator). */

const VALID_CODES = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '31', '32', '33', '34',
  '41', '42', '49', '50', '51', '52', '53', '54', '55', '56',
  '57', '58', '60', '61', '62', '65', '71', '72', '81', '99',
] as const;

const INPATIENT_CODES = ['21', '22', '23', '31', '32', '33', '34', '51', '61'] as const;

export function isValidPlaceOfService(code: string | null | undefined): boolean {
  if (code == null || code === '') {
    return false;
  }
  const normalized = code.trim().padStart(2, '0');
  return (VALID_CODES as readonly string[]).includes(normalized);
}

export function isInpatientPlaceOfService(code: string | null | undefined): boolean {
  if (code == null || code === '') {
    return false;
  }
  const normalized = code.trim().padStart(2, '0');
  return (INPATIENT_CODES as readonly string[]).includes(normalized);
}

export function normalizePlaceOfService(code: string | null | undefined): string | null {
  if (code == null || code.trim() === '') {
    return null;
  }
  return code.trim().padStart(2, '0');
}
