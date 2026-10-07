/** Laravel TaxonomyCodeHelper::normalizeCode */
export function normalizeTaxonomyCode(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return null;
  }

  const code = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (code === '' || code.length !== 10) {
    return null;
  }

  return code;
}

/** Laravel TaxonomyCodeHelper::normalizeSpecialtyName */
export function normalizeTaxonomySpecialtyName(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const name = String(raw)
    .trim()
    .replace(/\s+/g, ' ');
  return name !== '' ? name : null;
}
