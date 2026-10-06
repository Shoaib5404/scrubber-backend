import { Injectable } from '@nestjs/common';
  import { ParsedBatch, ParsedClaim, ParsedDiagnosis, ParsedServiceLine } from './types';

  /**
   * Nest port of Laravel ModelDrivenEdiParser (HL 20/22/23 hierarchy).
   * Focuses on claim/diagnosis/line extraction parity for golden tests.
   */
  @Injectable()
  export class ModelDrivenEdiParser {
    parse(content: string): ParsedBatch {
      if (content.length < 106 || !content.startsWith('ISA')) {
        throw new Error('EDI content too short to contain valid ISA segment');
      }
      if (content.slice(0, 3) !== 'ISA') {
        throw new Error('EDI file must start with ISA segment');
      }

      const elementSeparator = content[3];
      const segmentTerminator = content[105];
      const normalized = content.replace(/\r\n|\r|\n/g, '');
      const segments = normalized
        .split(segmentTerminator)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((raw) => raw.split(elementSeparator));

      if (segments.length === 0) {
        throw new Error('No valid segments found in EDI file');
      }

      const isa = segments.find((s) => s[0] === 'ISA');
      const gs = segments.find((s) => s[0] === 'GS');
      const claims = this.parseClaims(segments);

      return {
        claims,
        isaSenderId: isa?.[6]?.trim() ?? null,
        isaReceiverId: isa?.[8]?.trim() ?? null,
        isaControlNumber: isa?.[13]?.trim() ?? null,
        gsControlNumber: gs?.[6]?.trim() ?? null,
        parseErrors: [],
      };
    }

    private parseClaims(segments: string[][]): ParsedClaim[] {
      const claims: ParsedClaim[] = [];
      let billingProviderName: string | null = null;
      let billingProviderNpi: string | null = null;
      let subscriberLastName: string | null = null;
      let subscriberFirstName: string | null = null;
      let subscriberMemberId: string | null = null;
      let subscriberDob: string | null = null;
      let subscriberGender: string | null = null;
      let payerName: string | null = null;
      let payerId: string | null = null;
      let patientLastName: string | null = null;
      let patientFirstName: string | null = null;
      let stControl: string | null = null;
      let current: ParsedClaim | null = null;
      let lineNumber = 0;
      let pendingLine: ParsedServiceLine | null = null;

      const flushLine = () => {
        if (current && pendingLine) {
          current.serviceLines.push(pendingLine);
          pendingLine = null;
        }
      };

      for (const el of segments) {
        const id = el[0];
        if (id === 'ST') {
          stControl = el[2] ?? null;
        } else if (id === 'HL') {
          // hierarchy marker — state carried on NM1/SBR/CLM
        } else if (id === 'NM1') {
          const qual = el[1];
          if (qual === '85') {
            billingProviderName = [el[3], el[4]].filter(Boolean).join(' ').trim() || el[3] || null;
            billingProviderNpi = el[9] ?? null;
          } else if (qual === 'IL') {
            subscriberLastName = el[3] ?? null;
            subscriberFirstName = el[4] ?? null;
            subscriberMemberId = el[9] ?? null;
          } else if (qual === 'PR') {
            payerName = el[3] ?? null;
            payerId = el[9] ?? null;
          } else if (qual === 'QC') {
            patientLastName = el[3] ?? null;
            patientFirstName = el[4] ?? null;
          }
        } else if (id === 'DMG') {
          subscriberDob = el[2] ?? null;
          subscriberGender = el[3] ?? null;
        } else if (id === 'CLM') {
          flushLine();
          current = {
            claimId: el[1] ?? `CLAIM-${claims.length + 1}`,
            totalCharge: Number(el[2] ?? 0) || 0,
            placeOfService: el[5]?.split(':')[0] ?? null,
            frequencyCode: el[5]?.split(':')[2] ?? null,
            billingProviderName,
            billingProviderNpi,
            subscriberLastName,
            subscriberFirstName,
            subscriberMemberId,
            subscriberDob,
            subscriberGender,
            payerName,
            payerId,
            patientLastName,
            patientFirstName,
            diagnoses: [],
            serviceLines: [],
            stControlNumber: stControl,
          };
          claims.push(current);
          lineNumber = 0;
        } else if (id === 'HI' && current) {
          current.diagnoses.push(...this.parseHi(el, current.diagnoses.length));
        } else if (id === 'LX' && current) {
          flushLine();
          lineNumber = Number(el[1] ?? lineNumber + 1) || lineNumber + 1;
          pendingLine = {
            lineNumber,
            procedureCode: '',
            modifiers: [],
            chargeAmount: 0,
            units: 1,
            serviceDateFrom: null,
            placeOfService: current.placeOfService,
            diagnosisPointers: [],
          };
        } else if (id === 'SV1' && current) {
          if (!pendingLine) {
            lineNumber += 1;
            pendingLine = {
              lineNumber,
              procedureCode: '',
              modifiers: [],
              chargeAmount: 0,
              units: 1,
              serviceDateFrom: null,
              placeOfService: current.placeOfService,
              diagnosisPointers: [],
            };
          }
          const proc = (el[1] ?? '').split(':');
          pendingLine.procedureCode = proc[1] ?? proc[0] ?? '';
          pendingLine.modifiers = proc.slice(2, 6).filter(Boolean);
          pendingLine.chargeAmount = Number(el[2] ?? 0) || 0;
          pendingLine.units = Number(el[4] ?? 1) || 1;
          if (el[5]) pendingLine.placeOfService = el[5];
          if (el[7]) {
            pendingLine.diagnosisPointers = el[7]
              .split(':')
              .map((x) => Number(x))
              .filter((n) => Number.isFinite(n));
          }
        } else if (id === 'DTP' && pendingLine && (el[1] === '472' || el[1] === '879')) {
          pendingLine.serviceDateFrom = el[3] ?? null;
        }
      }
      flushLine();
      return claims;
    }

    private parseHi(el: string[], startSeq: number): ParsedDiagnosis[] {
      const out: ParsedDiagnosis[] = [];
      let seq = startSeq;
      for (let i = 1; i < el.length; i++) {
        const part = el[i];
        if (!part) continue;
        const [qual, code] = part.split(':');
        if (!code) continue;
        seq += 1;
        out.push({
          sequence: seq,
          code: code.replace(/\./g, ''),
          qualifier: qual,
          type: seq === 1 ? 'principal' : 'other',
        });
      }
      return out;
    }
  }
