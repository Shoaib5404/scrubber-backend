import { ClaimIssue } from '../types';

export type LineStatusUpdate = {
  id: number;
  lineNumber: number;
  status: string;
  validationErrors: ClaimIssue[];
};

/** Laravel ServiceLineValidationStatusUpdater */
export function buildServiceLineStatusUpdates(
  lines: Array<{ id: number; lineNumber: number }>,
  errors: ClaimIssue[],
  warnings: ClaimIssue[],
): LineStatusUpdate[] {
  return lines.map((line) => {
    const prefix = `service_lines.${line.lineNumber}`;
    const lineErrors = errors.filter(
      (e) => e.field === prefix || (e.field?.startsWith(`${prefix}.`) ?? false),
    );
    const lineWarnings = warnings.filter(
      (w) => w.field === prefix || (w.field?.startsWith(`${prefix}.`) ?? false),
    );
    const status = lineErrors.length ? 'error' : lineWarnings.length ? 'warning' : 'valid';
    return {
      id: line.id,
      lineNumber: line.lineNumber,
      status,
      validationErrors: [...lineErrors, ...lineWarnings],
    };
  });
}
