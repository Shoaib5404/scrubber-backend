import { CobBlock } from './loop-segment-scope';
import { EdiSegment } from '../types';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

export type ParsedServiceLine = {
  index: number;
  lx: EdiSegment;
  sv1: EdiSegment;
  segments: EdiSegment[];
  serviceDate: EdiSegment | null;
  svdSegments: EdiSegment[];
};

export type ParsedCobBlockMeta = CobBlock & {
  oi: EdiSegment | null;
  otherSubscriberNm1: EdiSegment | null;
  otherPayerNm1: EdiSegment | null;
};

export type ClaimDiagnosisEntry = { qualifier: string; code: string };

export function claimRefSegments(claimSegments: EdiSegment[]): EdiSegment[] {
  return claimSegments.filter((s) => s.id === 'REF');
}

export function claimHasRefQualifier(claimSegments: EdiSegment[], qualifier: string): boolean {
  for (const ref of claimRefSegments(claimSegments)) {
    if (el(ref, 1) === qualifier) return true;
  }
  return false;
}

export function clmControlNumber(clm: EdiSegment): string {
  return el(clm, 1);
}

export function clmTotalCharge(clm: EdiSegment): string {
  return el(clm, 2);
}

export function clmPlaceOfService(clm: EdiSegment, componentSeparator: string): string | null {
  const raw = el(clm, 5);
  if (raw === '') return null;
  const parts = raw.split(componentSeparator);
  return parts[0] ?? null;
}

export function clmFrequencyCode(clm: EdiSegment, componentSeparator: string): string | null {
  const raw = el(clm, 5);
  if (raw === '') return null;
  const parts = raw.split(componentSeparator);
  const last = parts[parts.length - 1];
  return last && last !== '' ? last : null;
}

export function parseAmount(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(value) && !/^-?\d*\.\d+$/.test(value)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function extractServiceLines(claimSegments: EdiSegment[]): ParsedServiceLine[] {
  const lines: ParsedServiceLine[] = [];
  let lineIndex = 0;
  let currentLx: EdiSegment | null = null;
  let buffer: EdiSegment[] = [];

  const flush = () => {
    if (currentLx == null) return;
    let sv1: EdiSegment | null = null;
    let serviceDate: EdiSegment | null = null;
    const svdSegments: EdiSegment[] = [];
    for (const seg of buffer) {
      if (seg.id === 'SV1') sv1 = seg;
      if (seg.id === 'DTP' && el(seg, 1) === '472') serviceDate = seg;
      if (seg.id === 'SVD') svdSegments.push(seg);
    }
    lines.push({
      index: lineIndex++,
      lx: currentLx,
      sv1: sv1 ?? { id: 'SV1', elements: ['SV1'], index: currentLx.index, raw: 'SV1' },
      segments: buffer,
      serviceDate,
      svdSegments,
    });
  };

  for (const segment of claimSegments) {
    if (segment.id === 'LX') {
      flush();
      currentLx = segment;
      buffer = [segment];
      continue;
    }
    if (currentLx != null) {
      buffer.push(segment);
    }
  }
  flush();

  return lines;
}

export function serviceLineChargeAmount(line: ParsedServiceLine): string {
  return el(line.sv1, 2);
}

export function serviceLineNumber(line: ParsedServiceLine): string {
  return el(line.lx, 1);
}

export function serviceLineUnits(line: ParsedServiceLine): string {
  return el(line.sv1, 4);
}

export function serviceLineDiagnosisPointers(
  line: ParsedServiceLine,
  componentSeparator: string,
): number[] {
  const raw = el(line.sv1, 7);
  if (raw === '') return [];
  const pointers: number[] = [];
  for (const part of raw.split(componentSeparator)) {
    const trimmed = part.trim();
    if (trimmed !== '' && /^\d+$/.test(trimmed)) {
      pointers.push(Number(trimmed));
    }
  }
  return pointers;
}

export function claimHiSegments(claimSegments: EdiSegment[]): EdiSegment[] {
  return claimSegments.filter((s) => s.id === 'HI');
}

export function claimHasDtpQualifier(claimSegments: EdiSegment[], qualifier: string): boolean {
  for (const seg of claimSegments) {
    if (seg.id === 'DTP' && el(seg, 1) === qualifier) return true;
  }
  return false;
}

export function claimDiagnoses(
  claimSegments: EdiSegment[],
  componentSeparator: string,
): ClaimDiagnosisEntry[] {
  const diagnoses: ClaimDiagnosisEntry[] = [];
  for (const hi of claimHiSegments(claimSegments)) {
    for (let i = 1; i < hi.elements.length; i++) {
      const value = hi.elements[i] ?? '';
      if (value === '') continue;
      let qualifier = value;
      let code = '';
      if (value.includes(componentSeparator)) {
        [qualifier, code] = value.split(componentSeparator, 2);
      } else if (value.includes('>')) {
        [qualifier, code] = value.split('>', 2);
      }
      diagnoses.push({
        qualifier: qualifier.trim().toUpperCase(),
        code: code.trim().toUpperCase(),
      });
    }
  }
  return diagnoses;
}

export function parseCobBlockMeta(block: CobBlock): ParsedCobBlockMeta {
  let oi: EdiSegment | null = null;
  let otherSubscriberNm1: EdiSegment | null = null;
  let otherPayerNm1: EdiSegment | null = null;
  for (const segment of block.segments) {
    if (segment.id === 'OI') oi = segment;
    if (segment.id === 'NM1' && el(segment, 1) === 'IL') otherSubscriberNm1 = segment;
    if (segment.id === 'NM1' && el(segment, 1) === 'PR') otherPayerNm1 = segment;
  }
  return { ...block, oi, otherSubscriberNm1, otherPayerNm1 };
}

export function cobBlockOtherPayerId(block: ParsedCobBlockMeta): string | null {
  if (!block.otherPayerNm1) return null;
  const id = el(block.otherPayerNm1, 9);
  return id === '' ? null : id;
}

/** Primary payer SBR in loop 2000B (after HL*22, before first CLM). */
export function primarySbr(bodySegments: EdiSegment[]): EdiSegment | null {
  let pastSubscriberHl = false;
  for (const segment of bodySegments) {
    if (segment.id === 'HL' && el(segment, 3) === '22') {
      pastSubscriberHl = true;
      continue;
    }
    if (segment.id === 'CLM') break;
    if (pastSubscriberHl && segment.id === 'SBR') return segment;
  }
  return null;
}

export function lineHasDtpQualifier(segments: EdiSegment[], qualifier: string): boolean {
  for (const segment of segments) {
    if (segment.id === 'DTP' && el(segment, 1) === qualifier) return true;
  }
  return false;
}

export function firstSegmentAfter(
  segments: EdiSegment[],
  afterIndex: number,
  type: string,
): EdiSegment | null {
  for (const segment of segments) {
    if (segment.index <= afterIndex) continue;
    if (segment.id === type) return segment;
  }
  return null;
}
