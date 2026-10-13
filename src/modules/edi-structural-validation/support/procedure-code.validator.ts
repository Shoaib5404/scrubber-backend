/**
 * Laravel Edi837ProcedureCodeValidator — SV101 composite structural checks.
 */

export type ProcedureFinding = {
  message: string;
  field: string;
  severity: 'error' | 'warning';
};

const ALLOWED_QUALIFIERS = new Set(['HC', 'IV', 'WK', 'ER', 'NU']);

export function parseProcedureComposite(
  value: string | null | undefined,
  componentSeparator: string,
): {
  qualifier: string | null;
  code: string | null;
  modifiers: string[];
  extra: string[];
} {
  if (value == null || value.trim() === '') {
    return { qualifier: null, code: null, modifiers: [], extra: [] };
  }

  const parts = value.split(componentSeparator);
  const qualifier =
    parts[0] != null && parts[0].trim() !== '' ? parts[0].trim().toUpperCase() : null;
  const code =
    parts[1] != null && parts[1].trim() !== '' ? parts[1].trim().toUpperCase() : null;

  const modifiers: string[] = [];
  for (let i = 2; i <= 5; i++) {
    if (parts[i] == null || parts[i]!.trim() === '') continue;
    modifiers.push(parts[i]!.trim().toUpperCase());
  }

  const extra: string[] = [];
  for (let i = 6; i < parts.length; i++) {
    if (parts[i] == null || parts[i]!.trim() === '') continue;
    extra.push(parts[i]!.trim());
  }

  return { qualifier, code, modifiers, extra };
}

export function validateProcedureComposite(
  value: string | null | undefined,
  componentSeparator: string,
): ProcedureFinding[] {
  const issues: ProcedureFinding[] = [];
  const parsed = parseProcedureComposite(value, componentSeparator);

  if (parsed.qualifier == null || parsed.code == null) {
    return [
      {
        message: 'SV101 procedure composite must include a qualifier and code (e.g. HC:99213)',
        field: 'SV101',
        severity: 'error',
      },
    ];
  }

  if (!ALLOWED_QUALIFIERS.has(parsed.qualifier)) {
    issues.push({
      message: `SV101 procedure qualifier '${parsed.qualifier}' is not a common 837P code set`,
      field: 'SV101-1',
      severity: 'error',
    });
  }

  if (!/^[A-Z0-9]{5}$/.test(parsed.code)) {
    issues.push({
      message: 'SV101 procedure code must be exactly 5 alphanumeric characters',
      field: 'SV101-2',
      severity: 'error',
    });
  }

  if (parsed.modifiers.length > 4) {
    issues.push({
      message: 'SV101 may contain at most 4 procedure modifiers',
      field: 'SV101',
      severity: 'error',
    });
  }

  parsed.modifiers.forEach((modifier, index) => {
    if (!/^[A-Z0-9]{2}$/.test(modifier)) {
      issues.push({
        message: `SV101 procedure modifier ${index + 1} '${modifier}' must be exactly 2 alphanumeric characters`,
        field: `SV101-${index + 3}`,
        severity: 'error',
      });
    }
  });

  if (parsed.extra.length > 0) {
    issues.push({
      message:
        'SV101 composite contains non-standard trailing data (e.g. procedure description); only qualifier, code, and up to 4 modifiers belong in SV101',
      field: 'SV101',
      severity: 'warning',
    });
  }

  return issues;
}
