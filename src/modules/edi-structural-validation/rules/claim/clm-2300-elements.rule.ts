import { validateLoopSegmentElements } from '../../support/loop-element-validate';
import { bodySegmentsInTransaction, eachTransaction, extractClaims } from '../../support/loop-segment-scope';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const LOOP_KEY = 'loop_2300';
const RULE_ID = 'CLM-2300-ELEMENTS';
const GROUP = 'claim';

const DTP_SPEC: Record<string, string> = {
  '431': 'DTP_431',
  '454': 'DTP_454',
  '304': 'DTP_304',
  '453': 'DTP_453',
  '439': 'DTP_439',
  '484': 'DTP_484',
  '455': 'DTP_455',
  '471': 'DTP_471',
  '314': 'DTP_314',
  '360': 'DTP_314',
  '361': 'DTP_314',
  '297': 'DTP_297',
  '296': 'DTP_296',
  '435': 'DTP_435',
  '096': 'DTP_096',
  '090': 'DTP_090',
  '091': 'DTP_090',
  '444': 'DTP_444',
  '050': 'DTP_050',
};

const REF_SPEC: Record<string, string> = {
  '4N': 'REF_4N',
  F5: 'REF_F5',
  EW: 'REF_EW',
  '9F': 'REF_9F',
  G1: 'REF_G1',
  F8: 'REF_F8',
  X4: 'REF_X4',
  '9A': 'REF_9A',
  '9C': 'REF_9C',
  LX: 'REF_LX',
  D9: 'REF_D9',
  EA: 'REF_EA',
  P4: 'REF_P4',
  '1J': 'REF_1J',
};

const CRC_SPEC: Record<string, string> = {
  '07': 'CRC_07',
  E1: 'CRC_70',
  E2: 'CRC_70',
  E3: 'CRC_70',
  '75': 'CRC_09',
  ZZ: 'CRC_11',
};

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function segmentsIn2300(claimSegments: EdiSegment[]): EdiSegment[] {
  const segments: EdiSegment[] = [];
  for (const segment of claimSegments) {
    const type = segment.id;
    if (type === 'NM1' || type === 'SBR' || type === 'LX') break;
    segments.push(segment);
  }
  return segments;
}

function compositeQualifier(
  segment: EdiSegment,
  position: number,
  componentSeparator: string,
): string {
  const raw = el(segment, position);
  if (raw === '') return '';
  const parts = raw.split(componentSeparator);
  return (parts[0] ?? '').trim().toUpperCase();
}

function hiSpecKey(segment: EdiSegment, componentSeparator: string): string | null {
  const qualifier = compositeQualifier(segment, 1, componentSeparator);
  switch (qualifier) {
    case 'ABK':
    case 'BK':
      return 'HI_BK';
    case 'BP':
      return 'HI_BP';
    case 'BG':
      return 'HI_BG';
    default:
      return null;
  }
}

function specKeyForSegment(
  segment: EdiSegment,
  componentSeparator: string,
): string | null {
  const type = segment.id;
  switch (type) {
    case 'CLM':
      return 'CLM';
    case 'PWK':
      return 'PWK';
    case 'CN1':
      return 'CN1';
    case 'K3':
      return 'K3';
    case 'NTE':
      return 'NTE';
    case 'CR1':
      return 'CR1';
    case 'CR2':
      return 'CR2';
    case 'HCP':
      return 'HCP';
    case 'DTP':
      return DTP_SPEC[el(segment, 1)] ?? null;
    case 'AMT':
      return el(segment, 1) === 'F5' ? 'AMT_F5' : null;
    case 'REF':
      return REF_SPEC[el(segment, 1).toUpperCase()] ?? null;
    case 'CRC':
      return CRC_SPEC[el(segment, 1).toUpperCase()] ?? null;
    case 'HI':
      return hiSpecKey(segment, componentSeparator);
    default:
      return null;
  }
}

function ediCodeFromSpecKey(specKey: string): string {
  return specKey.split('_')[0] ?? specKey;
}

function unknownSegmentIssue(
  segment: EdiSegment,
  fg: number,
  tx: number,
): Edi837ValidationIssue {
  const type = segment.id;
  const qual = el(segment, 1).toUpperCase();
  const field = `${type}01`;
  let message: string;
  switch (type) {
    case 'DTP':
      message = `DTP01 '${qual}' is not valid in loop 2300`;
      break;
    case 'REF':
      message = `REF01 '${qual}' is not valid in loop 2300`;
      break;
    case 'CRC':
      message = `CRC01 '${qual}' is not valid in loop 2300`;
      break;
    case 'AMT':
      message = `AMT01 '${qual}' is not valid in loop 2300 (allowed: F5)`;
      break;
    case 'HI':
      message = `HI01 qualifier '${qual}' is not valid in loop 2300`;
      break;
    default:
      message = `Segment ${type} is not used in loop 2300`;
  }
  return issue(RULE_ID, 'error', message, GROUP, {
    segment: type,
    segment_index: segment.index,
    functional_group_index: fg,
    transaction_set_index: tx,
    field,
  });
}

function validateClmComposites(
  clm: EdiSegment,
  componentSeparator: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const clm05 = el(clm, 5);
  if (clm05 !== '') {
    const parts = clm05.split(componentSeparator);
    const qualifier = (parts[1] ?? '').trim().toUpperCase();
    if (qualifier !== '' && qualifier !== 'B') {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `CLM05-2 must be B (Place of Service Codes for Professional Claims), got '${qualifier}'`,
          GROUP,
          {
            segment: 'CLM',
            segment_index: clm.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: 'CLM05-2',
          },
        ),
      );
    }
    const frequency = (parts[2] ?? '').trim();
    const allowedFrequency = ['1', '6', '7', '8'];
    if (frequency !== '' && !allowedFrequency.includes(frequency)) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `CLM05-3 must be one of [${allowedFrequency.join(', ')}], got '${frequency}'`,
          GROUP,
          {
            segment: 'CLM',
            segment_index: clm.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: 'CLM05-3',
          },
        ),
      );
    }
  }

  const clm11 = el(clm, 11);
  if (clm11 === '') return issues;

  const causes = clm11.split(componentSeparator);
  const code1 = (causes[0] ?? '').trim().toUpperCase();
  const code2 = (causes[1] ?? '').trim().toUpperCase();
  const code3 = (causes[2] ?? '').trim().toUpperCase();
  const state = (causes[3] ?? '').trim().toUpperCase();
  const allowed = ['AA', 'EM', 'OA'];

  if (code1 !== '' && !allowed.includes(code1)) {
    issues.push(
      issue(RULE_ID, 'error', `CLM11-1 must be one of [AA, EM, OA], got '${code1}'`, GROUP, {
        segment: 'CLM',
        segment_index: clm.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'CLM11-1',
      }),
    );
  }
  if (code2 !== '' && !allowed.includes(code2)) {
    issues.push(
      issue(RULE_ID, 'error', `CLM11-2 must be one of [AA, EM, OA], got '${code2}'`, GROUP, {
        segment: 'CLM',
        segment_index: clm.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'CLM11-2',
      }),
    );
  }
  if (code3 !== '') {
    issues.push(
      issue(RULE_ID, 'error', 'CLM11-3 is not used and must not be sent', GROUP, {
        segment: 'CLM',
        segment_index: clm.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'CLM11-3',
      }),
    );
  }
  const country = (causes[4] ?? '').trim().toUpperCase();
  const needsAccidentState =
    (code1 === 'AA' || code2 === 'AA') &&
    (country === '' || ['US', 'USA', 'CA', 'CAN'].includes(country));
  if (needsAccidentState && state === '') {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'CLM11-4 (auto accident state/province) is required when CLM11-1 or CLM11-2 is AA',
        GROUP,
        {
          segment: 'CLM',
          segment_index: clm.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'CLM11-4',
        },
      ),
    );
  }

  return issues;
}

function validateClm11RequiresAccidentDate(
  clm: EdiSegment,
  loopSegments: EdiSegment[],
  componentSeparator: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const clm11 = el(clm, 11);
  let hasAccidentDtp = false;
  for (const segment of loopSegments) {
    if (segment.id === 'DTP' && el(segment, 1) === '439') {
      hasAccidentDtp = true;
      break;
    }
  }

  if (hasAccidentDtp && clm11 === '') {
    return [
      issue(RULE_ID, 'error', 'CLM11 is required when DTP*439 (accident date) is present', GROUP, {
        segment: 'CLM',
        segment_index: clm.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'CLM11',
      }),
    ];
  }

  if (clm11 === '') return [];

  const causes = clm11.split(componentSeparator);
  const needsAccidentDate =
    ['AA', 'OA'].includes((causes[0] ?? '').trim().toUpperCase()) ||
    ['AA', 'OA'].includes((causes[1] ?? '').trim().toUpperCase());

  if (needsAccidentDate && !hasAccidentDtp) {
    return [
      issue(
        RULE_ID,
        'error',
        'DTP*439 accident date is required when CLM11-1 or CLM11-2 is AA or OA',
        GROUP,
        {
          segment: 'CLM',
          segment_index: clm.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'DTP439',
        },
      ),
    ];
  }

  return [];
}

function hiQualifierValues(specKey: string, position: number): string[] {
  switch (specKey) {
    case 'HI_BK':
      return position === 1 ? ['ABK', 'BK'] : ['ABF', 'BF'];
    case 'HI_BP':
      return position === 1 ? ['BP'] : ['BO'];
    case 'HI_BG':
      return ['BG'];
    default:
      return [];
  }
}

function validateHiComposites(
  hi: EdiSegment,
  specKey: string,
  componentSeparator: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const maxPosition = specKey === 'HI_BP' ? 2 : 12;

  for (let position = 1; position <= maxPosition; position++) {
    const raw = el(hi, position);
    if (raw === '') continue;

    const parts = raw.split(componentSeparator);
    const qualifier = (parts[0] ?? '').trim().toUpperCase();
    const code = (parts[1] ?? '').trim();
    const padded = String(position).padStart(2, '0');
    const allowed = hiQualifierValues(specKey, position);

    if (qualifier !== '' && allowed.length > 0 && !allowed.includes(qualifier)) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `HI${padded}-1 must be one of [${allowed.join(', ')}], got '${qualifier}'`,
          GROUP,
          {
            segment: 'HI',
            segment_index: hi.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: `HI${padded}-1`,
          },
        ),
      );
    }

    if (qualifier !== '' && code === '') {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `HI${padded}-2 is required when HI${padded} is present`,
          GROUP,
          {
            segment: 'HI',
            segment_index: hi.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: `HI${padded}-2`,
          },
        ),
      );
    }
  }

  return issues;
}

function validatePwkAttachmentControl(
  pwk: EdiSegment,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const pwk02 = el(pwk, 2).toUpperCase();
  const pwk05 = el(pwk, 5);
  const pwk06 = el(pwk, 6);
  const needsControl = ['BM', 'EL', 'EM', 'FX', 'FT'].includes(pwk02);

  if (needsControl && pwk05 === '') {
    issues.push(
      issue(RULE_ID, 'error', 'PWK05 is required when PWK02 is BM, EL, EM, FX, or FT', GROUP, {
        segment: 'PWK',
        segment_index: pwk.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'PWK05',
      }),
    );
  }
  if (needsControl && pwk06 === '') {
    issues.push(
      issue(RULE_ID, 'error', 'PWK06 is required when PWK02 is BM, EL, EM, FX, or FT', GROUP, {
        segment: 'PWK',
        segment_index: pwk.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'PWK06',
      }),
    );
  }
  if (pwk02 === 'AA' && (pwk05 !== '' || pwk06 !== '')) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'PWK05 and PWK06 must not be sent when PWK02 is AA (available on request)',
        GROUP,
        {
          segment: 'PWK',
          segment_index: pwk.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'PWK05',
        },
      ),
    );
  }

  return issues;
}

function validateDisabilityDateFormat(
  dtp: EdiSegment,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const qualifier = el(dtp, 1);
  const format = el(dtp, 2).toUpperCase();
  if (format === '') return [];

  if (qualifier === '314' && format !== 'RD8') {
    return [
      issue(RULE_ID, 'error', `DTP02 must be RD8 when DTP01 is 314, got '${format}'`, GROUP, {
        segment: 'DTP',
        segment_index: dtp.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'DTP02',
      }),
    ];
  }

  if (['360', '361'].includes(qualifier) && format !== 'D8') {
    return [
      issue(RULE_ID, 'error', `DTP02 must be D8 when DTP01 is 360 or 361, got '${format}'`, GROUP, {
        segment: 'DTP',
        segment_index: dtp.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'DTP02',
      }),
    ];
  }

  return [];
}

function validateClaim(
  ctx: Edi837RuleContext,
  claim: { clm: EdiSegment; segments: EdiSegment[] },
  doc: EdiDocument,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const loopSegments = segmentsIn2300(claim.segments);
  const counts: Record<string, number> = {};
  let hasClm = false;
  let hasHiBk = false;
  const componentSeparator = doc.componentSeparator;

  for (const segment of loopSegments) {
    const type = segment.id;
    if (type === 'CLM') hasClm = true;
    if (type === 'HI' && ['ABK', 'BK'].includes(compositeQualifier(segment, 1, componentSeparator))) {
      hasHiBk = true;
    }

    const specKey = specKeyForSegment(segment, componentSeparator);
    if (specKey == null) {
      issues.push(unknownSegmentIssue(segment, fg, tx));
      continue;
    }

    counts[specKey] = (counts[specKey] ?? 0) + 1;
    issues.push(
      ...validateLoopSegmentElements(
        ctx,
        segment,
        LOOP_KEY,
        specKey,
        RULE_ID,
        GROUP,
        fg,
        tx,
        type,
      ),
    );

    if (type === 'CLM') {
      issues.push(
        ...validateClmComposites(segment, componentSeparator, fg, tx),
        ...validateClm11RequiresAccidentDate(segment, loopSegments, componentSeparator, fg, tx),
      );
    }
    if (type === 'PWK') {
      issues.push(...validatePwkAttachmentControl(segment, fg, tx));
    }
    if (specKey === 'DTP_314') {
      issues.push(...validateDisabilityDateFormat(segment, fg, tx));
    }
    if (type === 'HI') {
      issues.push(...validateHiComposites(segment, specKey, componentSeparator, fg, tx));
    }
  }

  if (!hasClm) {
    issues.push(
      issue(RULE_ID, 'error', 'Claim Information (CLM) is required in loop 2300', GROUP, {
        segment: 'CLM',
        segment_index: claim.clm.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'CLM',
      }),
    );
  }

  const hiSpec = ctx.spec.loopSegmentSpec(LOOP_KEY, 'HI_BK') as { required?: boolean } | null;
  if (hiSpec?.required === true && !hasHiBk) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Health Care Diagnosis Code (HI with ABK or BK) is required in loop 2300',
        GROUP,
        {
          segment: 'CLM',
          segment_index: claim.clm.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'HI',
        },
      ),
    );
  }

  for (const [specKey, count] of Object.entries(counts)) {
    const spec = (ctx.spec.loopSegmentSpec(LOOP_KEY, specKey) ?? {}) as {
      max_occurs?: number;
      repeatable?: boolean;
    };
    const maxOccurs = spec.max_occurs ?? (spec.repeatable ? null : 1);
    if (typeof maxOccurs === 'number' && count > maxOccurs) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `Loop 2300 ${specKey} may occur at most ${maxOccurs} time(s), got ${count}`,
          GROUP,
          {
            segment: ediCodeFromSpecKey(specKey),
            segment_index: claim.clm.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: specKey,
          },
        ),
      );
    }
  }

  return issues;
}

export function clm2300ElementsRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        for (const claim of extractClaims(body)) {
          issues.push(...validateClaim(ctx, claim, doc, tx.functionalGroupIndex, tx.transactionSetIndex));
        }
      }
      return issues;
    },
  };
}
