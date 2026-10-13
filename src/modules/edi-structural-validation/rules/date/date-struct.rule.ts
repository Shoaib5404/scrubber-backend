import { FieldFormatValidator } from '../../support/field-format.validator';
import { headerSegmentsInTransaction, bodySegmentsInTransaction, eachTransaction, extractClaims } from '../../support/loop-segment-scope';
import { PatientBirthDateResolver } from '../../support/patient-birth-date.resolver';
import { clmPlaceOfService, extractServiceLines } from '../../support/parsed-claim.helpers';
import { isInpatientPlaceOfService, normalizePlaceOfService } from '../../support/place-of-service.validator';
import {
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'DATE-STRUCT';
const GROUP = 'date';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function validateD8Value(
  segment: EdiSegment,
  segmentType: string,
  field: string,
  value: string,
  fg: number,
  tx: number,
  rejectFuture = false,
): Edi837ValidationIssue[] {
  if (value.length !== 8 || !/^\d{8}$/.test(value)) {
    return [
      issue(RULE_ID, 'error', `${field} must be a CCYYMMDD date (8 digits)`, GROUP, {
        segment: segmentType,
        segment_index: segment.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field,
      }),
    ];
  }

  if (!FieldFormatValidator.isValidD8(value)) {
    return [
      issue(RULE_ID, 'error', `${field} is not a valid calendar date`, GROUP, {
        segment: segmentType,
        segment_index: segment.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field,
      }),
    ];
  }

  if (rejectFuture) {
    const parsed = PatientBirthDateResolver.parseD8(value);
    if (parsed && parsed.getTime() > todayStart().getTime()) {
      return [
        issue(
          RULE_ID,
          'error',
          `${field} transaction creation date cannot be in the future`,
          GROUP,
          {
            segment: segmentType,
            segment_index: segment.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field,
          },
        ),
      ];
    }
  }

  return [];
}

function validateDtp(segment: EdiSegment, fg: number, tx: number): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const format = el(segment, 2);
  const value = el(segment, 3);

  if (value === '') return issues;

  if (format === 'D8') {
    issues.push(...validateD8Value(segment, 'DTP', 'DTP03', value, fg, tx));
  } else if (format === 'RD8') {
    const [from, to] = FieldFormatValidator.parseRd8(value);
    if (!from || !to) {
      issues.push(
        issue(RULE_ID, 'error', 'DTP RD8 date range must use CCYYMMDD-CCYYMMDD format', GROUP, {
          segment: 'DTP',
          segment_index: segment.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'DTP03',
        }),
      );
      return issues;
    }

    issues.push(...validateD8Value(segment, 'DTP', 'DTP03-from', from, fg, tx));
    issues.push(...validateD8Value(segment, 'DTP', 'DTP03-to', to, fg, tx));

    if (FieldFormatValidator.isValidD8(from) && FieldFormatValidator.isValidD8(to)) {
      const fromDate = PatientBirthDateResolver.parseD8(from);
      const toDate = PatientBirthDateResolver.parseD8(to);
      if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
        issues.push(
          issue(
            RULE_ID,
            'error',
            'DTP RD8 date range start must be on or before the end date',
            GROUP,
            {
              segment: 'DTP',
              segment_index: segment.index,
              functional_group_index: fg,
              transaction_set_index: tx,
              field: 'DTP03',
            },
          ),
        );
      }
    }
  }

  return issues;
}

function validateSegmentDates(segment: EdiSegment, fg: number, tx: number): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];

  if (segment.id === 'DTP') {
    issues.push(...validateDtp(segment, fg, tx));
  }

  if (segment.id === 'DMG') {
    const format = el(segment, 1);
    const date = el(segment, 2);
    if (format !== '' && format !== 'D8') {
      issues.push(
        issue(RULE_ID, 'error', 'DMG date must use D8 (CCYYMMDD) format', GROUP, {
          segment: 'DMG',
          segment_index: segment.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'DMG01',
        }),
      );
    } else if (date !== '') {
      issues.push(...validateD8Value(segment, 'DMG', 'DMG02', date, fg, tx));
    }
  }

  return issues;
}

function validateClaimDateRelationships(
  claimSegments: EdiSegment[],
  clm: EdiSegment,
  componentSeparator: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const pos = normalizePlaceOfService(clmPlaceOfService(clm, componentSeparator));

  if (pos && isInpatientPlaceOfService(pos) && !claimSegments.some((s) => s.id === 'DTP' && el(s, 1) === '435')) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        `Admission date (DTP*435) is required for inpatient place of service ${pos}`,
        GROUP,
        {
          segment: 'CLM',
          segment_index: clm.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'DTP435',
        },
      ),
    );
  }

  let admissionDate: Date | null = null;
  let earliestServiceDate: Date | null = null;

  for (const segment of claimSegments) {
    if (segment.id === 'DTP' && el(segment, 1) === '435') {
      admissionDate = PatientBirthDateResolver.parseD8(el(segment, 3));
    }
  }

  for (const line of extractServiceLines(claimSegments)) {
    const dtp = line.serviceDate;
    if (!dtp) continue;
    const serviceDate = PatientBirthDateResolver.parseD8(el(dtp, 3));
    if (!serviceDate) continue;
    if (!earliestServiceDate || serviceDate.getTime() < earliestServiceDate.getTime()) {
      earliestServiceDate = serviceDate;
    }
  }

  if (
    admissionDate &&
    earliestServiceDate &&
    earliestServiceDate.getTime() < admissionDate.getTime()
  ) {
    issues.push(
      issue(
        RULE_ID,
        'warning',
        'Service date (DTP*472) should not be before admission date (DTP*435)',
        GROUP,
        {
          segment: 'DTP',
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'DTP472',
        },
      ),
    );
  }

  return issues;
}

export function dateStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      const componentSeparator = doc.componentSeparator;

      for (const tx of eachTransaction(doc)) {
        const fg = tx.functionalGroupIndex;
        const ti = tx.transactionSetIndex;
        const header = headerSegmentsInTransaction(tx.segments);

        for (const segment of header) {
          if (segment.id === 'BHT') {
            const date = el(segment, 4);
            if (date !== '') {
              issues.push(
                ...validateD8Value(segment, 'BHT', 'BHT04', date, fg, ti, true),
              );
            }
          }
        }

        const body = bodySegmentsInTransaction(tx.segments);
        for (const segment of body) {
          issues.push(...validateSegmentDates(segment, fg, ti));
        }

        for (const claim of extractClaims(body)) {
          issues.push(
            ...validateClaimDateRelationships(
              claim.segments,
              claim.clm,
              componentSeparator,
              fg,
              ti,
            ),
          );
        }
      }

      return issues;
    },
  };
}
