/** Parse EDI date (CCYYMMDD or YYMMDD) to Y-m-d. */
export function parseEdiDate(date?: string | null): string | null {
  if (!date) return null;
  const trimmed = date.trim();
  if (trimmed.length === 8) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  if (trimmed.length === 6) {
    const yy = Number.parseInt(trimmed.slice(0, 2), 10);
    const year = yy > 50 ? `19${trimmed.slice(0, 2)}` : `20${trimmed.slice(0, 2)}`;
    return `${year}-${trimmed.slice(2, 4)}-${trimmed.slice(4, 6)}`;
  }
  return null;
}

/** Parse EDI time (HHMM…) to H:i:s. */
export function parseEdiTime(time?: string | null): string | null {
  if (!time || time.trim().length < 4) return null;
  const trimmed = time.trim();
  return `${trimmed.slice(0, 2)}:${trimmed.slice(2, 4)}:00`;
}

/** Convert Y-m-d to a UTC midnight Date for Prisma `@db.Date`. */
export function toPrismaDate(isoDate?: string | null): Date | null {
  if (!isoDate) return null;
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Convert H:i:s to a Date for Prisma `@db.Time`. */
export function toPrismaTime(isoTime?: string | null): Date | null {
  if (!isoTime) return null;
  return new Date(`1970-01-01T${isoTime}.000Z`);
}

/** Format Prisma Date / DateTime as Y-m-d (UTC). */
export function formatPrismaDate(value?: Date | null): string | null {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
