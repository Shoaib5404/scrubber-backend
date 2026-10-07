import { ClaimIssue } from '../types';

/** Laravel ProcedureCodeHelper::isRecognizedFormat */
export function isRecognizedProcedureFormat(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (c === '') return false;
  return /^\d{5}$/.test(c) || /^[A-Z]\d{4}$/.test(c) || /^\d{4}[A-Z]$/.test(c);
}

/** Laravel ProcedureCodeHelper::typeLabelForCptError */
export function typeLabelForCptError(code: string): string {
  const c = code.trim().toUpperCase();
  if (/^\d{5}$/.test(c)) return 'CPT';
  if (/^[A-Z]\d{4}$/.test(c)) return 'HCPCS';
  return 'Procedure';
}
