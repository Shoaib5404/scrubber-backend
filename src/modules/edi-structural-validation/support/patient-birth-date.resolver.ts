import { EdiSegment } from '../types';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

/** Laravel Edi837PatientBirthDateResolver — patient DOB from hierarchy before a claim. */
export class PatientBirthDateResolver {
  resolve(bodySegments: EdiSegment[], claimSegmentIndex: number): Date | null {
    const contextHl = this.innermostHlBefore(bodySegments, claimSegmentIndex);
    if (!contextHl) return null;

    const dmg = this.findDmgInLoop(bodySegments, contextHl.index, claimSegmentIndex);
    if (!dmg) return null;

    return PatientBirthDateResolver.parseD8(el(dmg, 2));
  }

  private innermostHlBefore(bodySegments: EdiSegment[], beforeIndex: number): EdiSegment | null {
    let hl: EdiSegment | null = null;
    for (const segment of bodySegments) {
      if (segment.index >= beforeIndex) break;
      if (segment.id === 'HL') hl = segment;
    }
    return hl;
  }

  private findDmgInLoop(
    bodySegments: EdiSegment[],
    hlIndex: number,
    beforeIndex: number,
  ): EdiSegment | null {
    for (const segment of bodySegments) {
      if (segment.index <= hlIndex || segment.index >= beforeIndex) continue;
      if (segment.id === 'HL') break;
      if (segment.id === 'DMG') return segment;
    }
    return null;
  }

  static parseD8(value: string | null | undefined): Date | null {
    if (value == null || value.length !== 8 || !/^\d{8}$/.test(value)) return null;
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6));
    const d = Number(value.slice(6, 8));
    const parsed = new Date(y, m - 1, d);
    if (
      parsed.getFullYear() !== y ||
      parsed.getMonth() !== m - 1 ||
      parsed.getDate() !== d
    ) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
}

export const patientBirthDateResolver = new PatientBirthDateResolver();
