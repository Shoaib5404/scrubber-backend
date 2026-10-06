import { ClaimIssue } from '../types';

/** Laravel ProcedureCodeHelper::isRecognizedFormat */
export function isRecognizedProcedureFormat(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (c === '') return false;
  return /^\d{5}$/.test(c) || /^[A-Z]\d{4}$/.test(c) || /^\d{4}[A-Z]$/.test(c);
}
