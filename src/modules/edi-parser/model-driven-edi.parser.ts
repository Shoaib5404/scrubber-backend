import { Injectable } from '@nestjs/common';
import { parseEdiDate, parseEdiTime } from './edi-date.util';
import {
  normalizeOtherSubscriberEntry,
  OtherSubscriberEntry,
} from './other-subscriber-normalizer';
import { sbrClaimFilingIndicator } from './sbr-segment';
import { ParsedBatch, ParsedClaim, ParsedDiagnosis, ParsedServiceLine } from './types';

type Addr = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

function emptyAddr(): Addr {
  return { line1: null, line2: null, city: null, state: null, zip: null };
}

function fullAddress(a: Addr): string | null {
  const parts = [a.line1, a.line2, a.city, a.state, a.zip].filter(
    (p): p is string => Boolean(p && String(p).trim()),
  );
  return parts.length ? parts.join(', ') : null;
}

function applyN3(addr: Addr, el: string[]): void {
  addr.line1 = el[1]?.trim() || null;
  addr.line2 = el[2]?.trim() || null;
}

function applyN4(addr: Addr, el: string[]): void {
  addr.city = el[1]?.trim() || null;
  addr.state = el[2]?.trim() || null;
  addr.zip = el[3]?.trim() || null;
}

/**
 * Claim-level Loop 2300 DTP qualifier → ParsedClaim date field.
 * Laravel ModelDrivenEdiParser::extractClaimLevelDates.
 */
const CLAIM_LEVEL_DATE_QUALIFIERS: Readonly<
  Record<string, keyof Pick<ParsedClaim,
    | 'onsetOfIllnessDate'
    | 'lastMenstrualPeriodDate'
    | 'initialTreatmentDate'
    | 'lastSeenDate'
    | 'accidentDate'
    | 'lastXrayDate'
    | 'admissionDate'
    | 'dischargeDate'
    | 'hearingVisionPrescriptionDate'
    | 'disabilityStartDate'
    | 'disabilityEndDate'
    | 'lastWorkedDate'
    | 'authorizedReturnToWorkDate'
    | 'assumedCareDate'
    | 'relinquishedCareDate'
  >>
> = {
  '431': 'onsetOfIllnessDate',
  '484': 'lastMenstrualPeriodDate',
  '454': 'initialTreatmentDate',
  '304': 'lastSeenDate',
  '439': 'accidentDate',
  '455': 'lastXrayDate',
  '435': 'admissionDate',
  '096': 'dischargeDate',
  '471': 'hearingVisionPrescriptionDate',
  '360': 'disabilityStartDate',
  '361': 'disabilityEndDate',
  '297': 'lastWorkedDate',
  '296': 'authorizedReturnToWorkDate',
  '090': 'assumedCareDate',
  '091': 'relinquishedCareDate',
};

function parseDtpValue(format: string | undefined, raw: string | undefined): {
  from: string | null;
  to: string | null;
} {
  const value = (raw ?? '').trim();
  if (!value) return { from: null, to: null };
  if ((format ?? '').toUpperCase() === 'RD8' && value.includes('-')) {
    const [a, b] = value.split('-', 2);
    return { from: a?.slice(0, 8) ?? null, to: b?.slice(0, 8) ?? null };
  }
  return { from: value.slice(0, 8), to: null };
}

/**
 * Nest port of Laravel ModelDrivenEdiParser (HL 20/22/23 hierarchy).
 * Extracts claim/subscriber/billing/line fields needed for rule parity.
 */
@Injectable()
export class ModelDrivenEdiParser {
  parse(content: string): ParsedBatch {
    if (content.length < 106 || !content.startsWith('ISA')) {
      throw new Error('EDI content too short to contain valid ISA segment');
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
    const bht = segments.find((s) => s[0] === 'BHT');
    const claims = this.parseClaims(segments);

    return {
      claims,
      isaSenderId: isa?.[6]?.trim() ?? null,
      isaReceiverId: isa?.[8]?.trim() ?? null,
      isaDate: parseEdiDate(isa?.[9] ?? null),
      isaTime: parseEdiTime(isa?.[10] ?? null),
      isaControlNumber: isa?.[13]?.trim() ?? null,
      bhtDate: parseEdiDate(bht?.[4] ?? null),
      gsSenderCode: gs?.[2]?.trim() ?? null,
      gsReceiverCode: gs?.[3]?.trim() ?? null,
      gsControlNumber: gs?.[6]?.trim() ?? null,
      gsVersionCode: gs?.[8]?.trim() ?? null,
      parseErrors: [],
    };
  }

  private parseClaims(segments: string[][]): ParsedClaim[] {
    const claims: ParsedClaim[] = [];

    let billingProviderName: string | null = null;
    let billingProviderNpi: string | null = null;
    let billingProviderTaxonomy: string | null = null;
    let billingAddr = emptyAddr();

    let subscriberLastName: string | null = null;
    let subscriberFirstName: string | null = null;
    let subscriberMemberId: string | null = null;
    let subscriberDob: string | null = null;
    let subscriberGender: string | null = null;
    let subscriberAddr = emptyAddr();
    let subscriberRelationship: string | null = null;
    let payerResponsibility: string | null = null;
    let claimFilingIndicator: string | null = null;
    let insuranceTypeCode: string | null = null;
    let subscriberGroupNumber: string | null = null;
    let subscriberGroupName: string | null = null;

    let payerName: string | null = null;
    let payerId: string | null = null;
    let payerAddr = emptyAddr();

    let patientLastName: string | null = null;
    let patientFirstName: string | null = null;
    let patientDob: string | null = null;
    let patientGender: string | null = null;
    let patientAddr = emptyAddr();
    let patientRelationship: string | null = null;

    let facilityAddr = emptyAddr();
    /**
     * Laravel ModelDrivenEdiParser::parseProviderFromSegments never resets its local
     * `$nm1` once the target entity NM1 (e.g. '77') is found, so EVERY subsequent N3/N4
     * in the claim-level segment window (CLM..first LX) overwrites the captured address —
     * even ones belonging to a later, unrelated NM1 (e.g. COB-loop NM1*IL). Replicated here
     * verbatim for Nest/Laravel parity rather than "corrected" to the intended scoping.
     */
    let facilitySeenInHeader = false;

    let stControl: string | null = null;
    let current: ParsedClaim | null = null;
    let lineNumber = 0;
    let pendingLine: ParsedServiceLine | null = null;
    let lastNm1: string | null = null;
    let inClaimBody = false;

    const flushLine = () => {
      if (current && pendingLine) {
        current.serviceLines.push(pendingLine);
        pendingLine = null;
      }
    };

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const el = segments[segIdx];
      const id = el[0];

      if (id === 'ST') {
        stControl = el[2] ?? null;
      } else if (id === 'HL') {
        const level = el[3] ?? '';
        if (level === '20') {
          billingProviderName = null;
          billingProviderNpi = null;
          billingProviderTaxonomy = null;
          billingAddr = emptyAddr();
        } else if (level === '22') {
          subscriberLastName = null;
          subscriberFirstName = null;
          subscriberMemberId = null;
          subscriberDob = null;
          subscriberGender = null;
          subscriberAddr = emptyAddr();
          subscriberRelationship = null;
          payerResponsibility = null;
          claimFilingIndicator = null;
          insuranceTypeCode = null;
          subscriberGroupNumber = null;
          subscriberGroupName = null;
          payerName = null;
          payerId = null;
          payerAddr = emptyAddr();
          patientLastName = null;
          patientFirstName = null;
          patientDob = null;
          patientGender = null;
          patientAddr = emptyAddr();
          patientRelationship = null;
        }
        inClaimBody = false;
      } else if (id === 'SBR' && !inClaimBody) {
        // 2000B subscriber SBR (before CLM)
        payerResponsibility = el[1]?.trim() || null;
        subscriberRelationship = el[2]?.trim() || null;
        subscriberGroupNumber = el[3]?.trim() || null;
        subscriberGroupName = el[4]?.trim() || null;
        insuranceTypeCode = el[5]?.trim() || null;
        claimFilingIndicator = (el[9] ?? '').trim() || null;
      } else if (id === 'PAT' && !inClaimBody) {
        patientRelationship = el[1]?.trim() || null;
      } else if (id === 'NM1') {
        const qual = el[1];
        lastNm1 = qual;
        if (qual === '85') {
          billingProviderName = [el[3], el[4]].filter(Boolean).join(' ').trim() || el[3] || null;
          billingProviderNpi = el[9] ?? null;
          billingAddr = emptyAddr();
        } else if (qual === 'IL' && !inClaimBody) {
          subscriberLastName = el[3] ?? null;
          subscriberFirstName = el[4] ?? null;
          subscriberMemberId = el[9] ?? null;
          subscriberAddr = emptyAddr();
        } else if (qual === 'PR' && !inClaimBody) {
          payerName = el[3] ?? null;
          payerId = el[9] ?? null;
          payerAddr = emptyAddr();
        } else if (qual === 'QC') {
          patientLastName = el[3] ?? null;
          patientFirstName = el[4] ?? null;
          patientAddr = emptyAddr();
        } else if (qual === '77' && current) {
          current.facilityName = el[3] ?? null;
          current.facilityNpi = el[9] ?? null;
          facilityAddr = emptyAddr();
          current.facilityAddress = null;
          facilitySeenInHeader = true;
        }
      } else if (id === 'PRV') {
        const prvQual = (el[1] ?? '').toUpperCase();
        const refQual = (el[2] ?? '').toUpperCase();
        if (
          prvQual === 'BI' &&
          (refQual === '' || refQual === 'PXC' || refQual === 'ZZ')
        ) {
          const tax = (el[3] ?? '').trim();
          if (tax) billingProviderTaxonomy = tax;
        }
      } else if (id === 'N3') {
        if (lastNm1 === '85') applyN3(billingAddr, el);
        else if (lastNm1 === 'IL' && !inClaimBody) applyN3(subscriberAddr, el);
        else if (lastNm1 === 'PR' && !inClaimBody) applyN3(payerAddr, el);
        else if (lastNm1 === 'QC') applyN3(patientAddr, el);
        else if (facilitySeenInHeader && current && !pendingLine) {
          applyN3(facilityAddr, el);
          current.facilityAddress = fullAddress(facilityAddr);
        }
      } else if (id === 'N4') {
        if (lastNm1 === '85') applyN4(billingAddr, el);
        else if (lastNm1 === 'IL' && !inClaimBody) applyN4(subscriberAddr, el);
        else if (lastNm1 === 'PR' && !inClaimBody) applyN4(payerAddr, el);
        else if (lastNm1 === 'QC') applyN4(patientAddr, el);
        else if (facilitySeenInHeader && current && !pendingLine) {
          applyN4(facilityAddr, el);
          current.facilityAddress = fullAddress(facilityAddr);
        }
      } else if (id === 'DMG') {
        if (lastNm1 === 'QC') {
          patientDob = el[2] ?? null;
          patientGender = el[3] ?? null;
        } else {
          subscriberDob = el[2] ?? null;
          subscriberGender = el[3] ?? null;
        }
      } else if (id === 'CLM') {
        flushLine();
        inClaimBody = true;
        facilitySeenInHeader = false;
        facilityAddr = emptyAddr();
        const bodyEnd = this.indexOfFirstLxAfter(segments, segIdx);
        const otherSubscribers = this.parseOtherSubscribers(segments.slice(segIdx, bodyEnd));
        current = {
          claimId: el[1] ?? `CLAIM-${claims.length + 1}`,
          totalCharge: Number(el[2] ?? 0) || 0,
          placeOfService: el[5]?.split(':')[0] ?? null,
          frequencyCode: el[5]?.split(':')[2] ?? null,
          billingProviderName,
          billingProviderNpi,
          billingProviderTaxonomy,
          billingProviderAddress: fullAddress(billingAddr),
          billingProviderAddressLine1: billingAddr.line1,
          billingProviderAddressLine2: billingAddr.line2,
          billingProviderCity: billingAddr.city,
          billingProviderState: billingAddr.state,
          billingProviderZip: billingAddr.zip,
          subscriberLastName,
          subscriberFirstName,
          subscriberMemberId,
          subscriberDob,
          subscriberGender,
          subscriberAddress: fullAddress(subscriberAddr),
          subscriberRelationship,
          payerResponsibility,
          claimFilingIndicator,
          insuranceTypeCode,
          subscriberGroupNumber,
          subscriberGroupName,
          payerName,
          payerId,
          payerAddress: fullAddress(payerAddr),
          patientLastName,
          patientFirstName,
          patientDob,
          patientGender,
          patientAddress: fullAddress(patientAddr),
          patientRelationship,
          originalReferenceNumber: null,
          priorAuthNumber: null,
          referralNumber: null,
          diagnoses: [],
          serviceLines: [],
          otherSubscribers,
          stControlNumber: stControl,
        };
        claims.push(current);
        lineNumber = 0;
      } else if (id === 'REF' && current && inClaimBody && !pendingLine) {
        const qual = (el[1] ?? '').toUpperCase();
        const value = (el[2] ?? '').trim();
        if (!value) {
          // skip
        } else if (qual === 'F8' && !current.originalReferenceNumber) {
          current.originalReferenceNumber = value;
        } else if (qual === 'G1' && !current.priorAuthNumber) {
          current.priorAuthNumber = value;
        } else if (qual === '9F' && !current.referralNumber) {
          current.referralNumber = value;
        }
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
          serviceDateTo: null,
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
            serviceDateTo: null,
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
      } else if (id === 'DTP' && current && inClaimBody && !pendingLine) {
        const field = CLAIM_LEVEL_DATE_QUALIFIERS[el[1] ?? ''];
        if (field) {
          const { from } = parseDtpValue(el[2], el[3]);
          current[field] = from;
        }
      } else if (id === 'DTP' && pendingLine && (el[1] === '472' || el[1] === '879')) {
        const { from, to } = parseDtpValue(el[2], el[3]);
        pendingLine.serviceDateFrom = from;
        pendingLine.serviceDateTo = to;
      } else if (id === 'LIN' && pendingLine) {
        pendingLine.ndcCode = el[3] ?? null;
      } else if (id === 'CTP' && pendingLine) {
        pendingLine.ndcQuantity = Number(el[4] ?? '0') || 0;
        pendingLine.ndcUnit = el[5] ?? null;
      }
    }
    flushLine();
    return claims;
  }

  private indexOfFirstLxAfter(segments: string[][], fromIndex: number): number {
    for (let i = fromIndex + 1; i < segments.length; i++) {
      if (segments[i][0] === 'LX') {
        return i;
      }
    }
    return segments.length;
  }

  /**
   * Parse 2320 other subscriber COB blocks from claim segments (CLM through LX).
   */
  private parseOtherSubscribers(segments: string[][]): OtherSubscriberEntry[] {
    const blocks: OtherSubscriberEntry[] = [];
    let sbr: string[] | null = null;
    let subscriberNm1: string[] | null = null;
    let subscriberN3: string[] | null = null;
    let subscriberN4: string[] | null = null;
    let patientNm1: string[] | null = null;
    let patientN3: string[] | null = null;
    let patientN4: string[] | null = null;
    let payerNm1: string[] | null = null;
    let payerN3: string[] | null = null;
    let payerN4: string[] | null = null;
    let remittanceDate: string | null = null;
    let subscriberSsn: string | null = null;
    let payerPaidAmount: string | null = null;
    let remainingPatientLiability: string | null = null;
    let payerClaimControlNumber: string | null = null;
    let lastNm1Type: string | null = null;

    const flushBlock = (): void => {
      if (sbr === null) {
        return;
      }

      blocks.push(
        this.buildOtherSubscriberEntry(
          sbr,
          subscriberNm1,
          subscriberN3,
          subscriberN4,
          payerNm1,
          payerN3,
          payerN4,
          remittanceDate,
          subscriberSsn,
          patientNm1,
          patientN3,
          patientN4,
          payerPaidAmount,
          remainingPatientLiability,
          payerClaimControlNumber,
        ),
      );

      sbr = null;
      subscriberNm1 = null;
      subscriberN3 = null;
      subscriberN4 = null;
      patientNm1 = null;
      patientN3 = null;
      patientN4 = null;
      payerNm1 = null;
      payerN3 = null;
      payerN4 = null;
      remittanceDate = null;
      subscriberSsn = null;
      payerPaidAmount = null;
      remainingPatientLiability = null;
      payerClaimControlNumber = null;
      lastNm1Type = null;
    };

    for (const elements of segments) {
      const segmentType = elements[0] ?? '';

      if (segmentType === 'LX') {
        break;
      }

      if (segmentType === 'SBR') {
        flushBlock();
        sbr = elements;
        continue;
      }

      if (sbr === null) {
        continue;
      }

      if (segmentType === 'NM1') {
        const entityCode = elements[1] ?? '';
        if (entityCode === 'IL') {
          subscriberNm1 = elements;
          subscriberN3 = null;
          subscriberN4 = null;
          subscriberSsn = null;
          lastNm1Type = 'IL';
        } else if (entityCode === 'QC') {
          patientNm1 = elements;
          patientN3 = null;
          patientN4 = null;
          lastNm1Type = 'QC';
        } else if (entityCode === 'PR') {
          payerNm1 = elements;
          payerN3 = null;
          payerN4 = null;
          payerClaimControlNumber = null;
          lastNm1Type = 'PR';
        }
        continue;
      }

      if (segmentType === 'N3') {
        if (lastNm1Type === 'IL') {
          subscriberN3 = elements;
        } else if (lastNm1Type === 'QC') {
          patientN3 = elements;
        } else if (lastNm1Type === 'PR') {
          payerN3 = elements;
        }
        continue;
      }

      if (segmentType === 'N4') {
        if (lastNm1Type === 'IL') {
          subscriberN4 = elements;
        } else if (lastNm1Type === 'QC') {
          patientN4 = elements;
        } else if (lastNm1Type === 'PR') {
          payerN4 = elements;
        }
        continue;
      }

      if (segmentType === 'DTP' && (elements[1] ?? '') === '573') {
        remittanceDate = this.extractDtpDateFromElements(elements);
        continue;
      }

      if (segmentType === 'AMT') {
        const qualifier = (elements[1] ?? '').trim().toUpperCase();
        const amount = (elements[2] ?? '').trim();
        if (amount === '') {
          continue;
        }
        if (qualifier === 'D') {
          payerPaidAmount = amount;
        } else if (qualifier === 'EAF') {
          remainingPatientLiability = amount;
        }
        continue;
      }

      if (
        segmentType === 'REF' &&
        (elements[1] ?? '') === 'SY' &&
        lastNm1Type === 'IL' &&
        subscriberNm1 !== null
      ) {
        subscriberSsn = (elements[2] ?? '').trim() || null;
        continue;
      }

      if (segmentType === 'REF' && (elements[1] ?? '') === 'F8' && lastNm1Type === 'PR') {
        payerClaimControlNumber = (elements[2] ?? '').trim() || null;
        continue;
      }
    }

    flushBlock();
    return blocks;
  }

  private buildOtherSubscriberEntry(
    sbr: string[],
    subscriberNm1: string[] | null,
    subscriberN3: string[] | null,
    subscriberN4: string[] | null,
    payerNm1: string[] | null,
    payerN3: string[] | null,
    payerN4: string[] | null,
    remittanceDate: string | null = null,
    subscriberSsn: string | null = null,
    patientNm1: string[] | null = null,
    patientN3: string[] | null = null,
    patientN4: string[] | null = null,
    payerPaidAmount: string | null = null,
    remainingPatientLiability: string | null = null,
    payerClaimControlNumber: string | null = null,
  ): OtherSubscriberEntry {
    return normalizeOtherSubscriberEntry({
      payer_responsibility: sbr[1] ?? null,
      relationship_code: sbr[2] ?? null,
      group_number: sbr[3] ?? null,
      group_name: sbr[4] ?? null,
      insurance_type_code: sbr[5] ?? null,
      claim_filing_indicator: sbrClaimFilingIndicator(sbr),
      last_name: subscriberNm1?.[3] ?? null,
      first_name: subscriberNm1?.[4] ?? null,
      middle_name: subscriberNm1?.[5] ?? null,
      member_id: subscriberNm1?.[9] ?? null,
      ssn: subscriberSsn,
      remittance_date: remittanceDate,
      address_line_1: subscriberN3?.[1] ?? null,
      address_line_2: subscriberN3?.[2] ?? null,
      city: subscriberN4?.[1] ?? null,
      state: subscriberN4?.[2] ?? null,
      zip_code: subscriberN4?.[3] ?? null,
      patient_last_name: patientNm1?.[3] ?? null,
      patient_first_name: patientNm1?.[4] ?? null,
      patient_middle_name: patientNm1?.[5] ?? null,
      patient_address_line_1: patientN3?.[1] ?? null,
      patient_address_line_2: patientN3?.[2] ?? null,
      patient_city: patientN4?.[1] ?? null,
      patient_state: patientN4?.[2] ?? null,
      patient_zip_code: patientN4?.[3] ?? null,
      payer_name: payerNm1?.[3] ?? null,
      payer_id: payerNm1?.[9] ?? null,
      has_other_payer_nm1: payerNm1 !== null ? 'Y' : null,
      payer_address_line_1: payerN3?.[1] ?? null,
      payer_address_line_2: payerN3?.[2] ?? null,
      payer_city: payerN4?.[1] ?? null,
      payer_state: payerN4?.[2] ?? null,
      payer_zip_code: payerN4?.[3] ?? null,
      payer_claim_control_number: payerClaimControlNumber,
      payer_paid_amount: payerPaidAmount,
      remaining_patient_liability: remainingPatientLiability,
    });
  }

  private extractDtpDateFromElements(elements: string[]): string | null {
    let value = (elements[3] ?? '').trim();
    if (value === '') {
      return null;
    }
    if (value.includes('-')) {
      value = value.split('-')[0] ?? value;
    }
    return value.length >= 8 ? value.slice(0, 8) : value;
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
