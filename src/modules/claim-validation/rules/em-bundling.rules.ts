import { ClaimIssue } from '../types';

export const EM_BDL_001 = 'EM-BDL-001';
export const EM_BDL_002 = 'EM-BDL-002';
export const EM_BDL_003 = 'EM-BDL-003';
export const EM_BDL_004 = 'EM-BDL-004';
export const EM_BDL_005 = 'EM-BDL-005';
export const EM_BDL_006 = 'EM-BDL-006';
export const EM_BDL_007 = 'EM-BDL-007';
export const EM_BDL_008 = 'EM-BDL-008';
export const EM_BDL_009 = 'EM-BDL-009';
export const EM_BDL_010 = 'EM-BDL-010';
export const EM_BDL_011 = 'EM-BDL-011';
export const EM_BDL_012 = 'EM-BDL-012';
export const EM_BDL_013 = 'EM-BDL-013';
export const EM_BDL_014 = 'EM-BDL-014';

const MEDICARE_FILING_INDICATORS: readonly string[] = ['MA', 'MB'];

const AUDIO_VIDEO_TELEMEDICINE: readonly string[] = [
  '98000', '98001', '98002', '98003', '98004', '98005', '98006', '98007',
];

const AUDIO_ONLY_TELEMEDICINE: readonly string[] = [
  '98008', '98009', '98010', '98011', '98012', '98013', '98014', '98015',
];

const OFFICE_OUTPATIENT: readonly string[] = [
  '99202', '99203', '99204', '99205',
  '99211', '99212', '99213', '99214', '99215',
];

const OFFICE_NEW: readonly string[] = ['99202', '99203', '99204', '99205'];

const OFFICE_ESTABLISHED: readonly string[] = ['99211', '99212', '99213', '99214', '99215'];

const HOSPITAL_INITIAL: readonly string[] = ['99221', '99222', '99223'];

const HOSPITAL_SUBSEQUENT: readonly string[] = ['99231', '99232', '99233'];

const HOSPITAL_DISCHARGE: readonly string[] = ['99238', '99239'];

const OBSERVATION_SAME_DAY: readonly string[] = ['99234', '99235', '99236'];

const NURSING_FACILITY_INITIAL: readonly string[] = ['99304', '99305', '99306'];

const NURSING_FACILITY_SUBSEQUENT: readonly string[] = ['99307', '99308', '99309', '99310'];

const CONSULTATION: readonly string[] = [
  '99242', '99243', '99244', '99245',
  '99252', '99253', '99254', '99255',
];

const CRITICAL_CARE: readonly string[] = ['99291'];

const ED_EM: readonly string[] = ['99281', '99282', '99283', '99284', '99285'];

const PROLONGED_NON_FACE: readonly string[] = ['99358', '99359'];

const PROLONGED_ADDON: readonly string[] = ['99417'];

const PROLONGED_ADDON_BASES: readonly string[] = [
  '99205', '99215',
  '98003', '98004', '98005', '98006', '98007',
  '98011', '98012', '98013', '98014', '98015',
];

const PREVENTIVE: readonly string[] = [
  '99381', '99382', '99383', '99384', '99385', '99386', '99387',
  '99391', '99392', '99393', '99394', '99395', '99396', '99397',
];

const BRIEF_CHECKIN = '98016';

const BRIEF_CHECKIN_RELATED_EM: readonly string[] = [
  '99202', '99203', '99204', '99205',
  '99211', '99212', '99213', '99214', '99215',
  '98000', '98001', '98002', '98003', '98004', '98005', '98006', '98007',
  '98008', '98009', '98010', '98011', '98012', '98013', '98014', '98015',
];

const FACE_TO_FACE_EM_FOR_PROLONGED: readonly string[] = [
  '99202', '99203', '99204', '99205',
  '99211', '99212', '99213', '99214', '99215',
  '99221', '99222', '99223', '99231', '99232', '99233',
  '99234', '99235', '99236', '99238', '99239',
  '99281', '99282', '99283', '99284', '99285',
  '99291',
  '99304', '99305', '99306', '99307', '99308', '99309', '99310',
  '99381', '99382', '99383', '99384', '99385', '99386', '99387',
  '99391', '99392', '99393', '99394', '99395', '99396', '99397',
  '98000', '98001', '98002', '98003', '98004', '98005', '98006', '98007',
  '98008', '98009', '98010', '98011', '98012', '98013', '98014', '98015',
];

export type EmBundlingServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  serviceDateFrom: string | Date | null;
  renderingProviderNpi: string | null;
  modifier1: string | null;
  modifier2: string | null;
  modifier3: string | null;
  modifier4: string | null;
};

export type EmBundlingClaimInput = {
  claimFilingIndicator: string | null;
  renderingProviderNpi: string | null;
};

/** Related E&M on other claims (Laravel DB join in validateBriefCheckInAcrossClaims). */
export type EmBundlingCrossClaimRelatedLine = {
  procedureCode: string;
  serviceDateFrom: string | Date;
};

type IndexedLine = {
  line: EmBundlingServiceLineInput;
  code: string;
  dos: string;
  modifiers: string[];
  renderingNpi: string;
};

/**
 * Laravel EmBundlingRules — E&M bundling / mutually exclusive combinations.
 *
 * @param briefCheckInRelatedOnOtherClaims Preloaded related E&M lines from other claims for the
 *   same member within the brief check-in window (Laravel queries `service_lines` + `claims`).
 */
export function validateEmBundling(
  lines: EmBundlingServiceLineInput[],
  claim: EmBundlingClaimInput,
  briefCheckInRelatedOnOtherClaims: readonly EmBundlingCrossClaimRelatedLine[] = [],
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  if (lines.length === 0) return errors;

  const indexed = indexLines(lines);
  if (indexed.length === 0) return errors;

  errors.push(...validateMutuallyExclusivePairs(indexed));
  errors.push(...validateBriefCheckIn(indexed, briefCheckInRelatedOnOtherClaims));
  errors.push(...validateObservationSameDayExclusivity(indexed));
  errors.push(...validateMedicareConsultation(indexed, claim));
  errors.push(...validateCriticalCareWithEd(indexed, claim));
  errors.push(...validateProlongedNonFaceSameDate(indexed));
  errors.push(...validateProlongedAddonBase(indexed));
  errors.push(...validatePreventiveWithProblemEm(indexed));

  return errors;
}

function indexLines(lines: EmBundlingServiceLineInput[]): IndexedLine[] {
  const indexed: IndexedLine[] = [];

  for (const line of lines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    const dos = dosKeyBundling(line.serviceDateFrom);
    if (code === '' || dos === null) continue;

    indexed.push({
      line,
      code,
      dos,
      modifiers: modifiersOnLineBundling(line),
      renderingNpi: normalizeNpi(String(line.renderingProviderNpi ?? '')),
    });
  }

  return indexed;
}

function validateMutuallyExclusivePairs(indexed: IndexedLine[]): ClaimIssue[] {
  const pairs: Array<{
    rule: string;
    setA: readonly string[];
    setB: readonly string[];
    message: string;
    sameProvider?: boolean;
  }> = [
    {
      rule: EM_BDL_001,
      setA: AUDIO_ONLY_TELEMEDICINE,
      setB: OFFICE_OUTPATIENT,
      message:
        'Audio-only telemedicine code(s) %s cannot be billed with office/outpatient E&M code(s) %s on the same date/encounter.',
    },
    {
      rule: EM_BDL_002,
      setA: AUDIO_VIDEO_TELEMEDICINE,
      setB: OFFICE_OUTPATIENT,
      message:
        'Audio-video telemedicine code(s) %s cannot be billed with office/outpatient E&M code(s) %s on the same date/encounter.',
    },
    {
      rule: EM_BDL_003,
      setA: AUDIO_VIDEO_TELEMEDICINE,
      setB: AUDIO_ONLY_TELEMEDICINE,
      message:
        'Audio-video telemedicine code(s) %s cannot be billed with audio-only telemedicine code(s) %s on the same encounter.',
    },
    {
      rule: EM_BDL_005,
      setA: OFFICE_NEW,
      setB: OFFICE_ESTABLISHED,
      message:
        'New patient E&M code(s) %s cannot be billed with established patient E&M code(s) %s on the same visit.',
    },
    {
      rule: EM_BDL_006,
      setA: HOSPITAL_INITIAL,
      setB: HOSPITAL_SUBSEQUENT,
      message:
        'Initial hospital care code(s) %s cannot be billed with subsequent hospital care code(s) %s on the same date for the same provider.',
      sameProvider: true,
    },
    {
      rule: EM_BDL_007,
      setA: HOSPITAL_INITIAL,
      setB: HOSPITAL_DISCHARGE,
      message:
        'Initial hospital care code(s) %s cannot be billed with discharge code(s) %s for a same-day admit/discharge. Use initial only if under 8 hours, or 99234-99236 if over 8 hours.',
    },
    {
      rule: EM_BDL_009,
      setA: NURSING_FACILITY_INITIAL,
      setB: NURSING_FACILITY_SUBSEQUENT,
      message:
        'Initial nursing facility care code(s) %s cannot be billed with subsequent nursing facility care code(s) %s on the same date.',
    },
  ];

  const errors: ClaimIssue[] = [];

  for (const pair of pairs) {
    const setA = recordFromList(pair.setA);
    const setB = recordFromList(pair.setB);
    const requireSameProvider = Boolean(pair.sameProvider);

    const byDos: Record<
      string,
      {
        a: Array<{ line: EmBundlingServiceLineInput; code: string; renderingNpi: string }>;
        b: Array<{ line: EmBundlingServiceLineInput; code: string; renderingNpi: string }>;
      }
    > = {};

    for (const row of indexed) {
      const inA = Boolean(setA[row.code]);
      const inB = Boolean(setB[row.code]);
      if (!inA && !inB) continue;

      if (!byDos[row.dos]) {
        byDos[row.dos] = { a: [], b: [] };
      }

      const entry = {
        line: row.line,
        code: row.code,
        renderingNpi: row.renderingNpi,
      };

      if (inA) byDos[row.dos].a.push(entry);
      if (inB) byDos[row.dos].b.push(entry);
    }

    for (const dos of Object.keys(byDos)) {
      const bucket = byDos[dos];
      if (bucket.a.length === 0 || bucket.b.length === 0) continue;

      if (requireSameProvider) {
        let matched = false;
        for (const aRow of bucket.a) {
          for (const bRow of bucket.b) {
            if (sameRenderingProvider(aRow.renderingNpi, bRow.renderingNpi)) {
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
        if (!matched) continue;
      }

      const codesA = [...new Set(bucket.a.map((r) => r.code))];
      const codesB = [...new Set(bucket.b.map((r) => r.code))];
      const line = bucket.a[0].line;

      errors.push(
        bundlingError(
          pair.rule,
          line,
          formatPairMessage(pair.message, codesA.join(', '), codesB.join(', ')),
        ),
      );
    }
  }

  return errors;
}

function validateObservationSameDayExclusivity(indexed: IndexedLine[]): ClaimIssue[] {
  const obsSet = recordFromList(OBSERVATION_SAME_DAY);
  const conflictSet = recordFromList([...HOSPITAL_INITIAL, ...HOSPITAL_DISCHARGE]);

  const byDos: Record<
    string,
    { obs: string[]; conflict: string[]; line: EmBundlingServiceLineInput }
  > = {};

  for (const row of indexed) {
    const isObs = Boolean(obsSet[row.code]);
    const isConflict = Boolean(conflictSet[row.code]);
    if (!isObs && !isConflict) continue;

    if (!byDos[row.dos]) {
      byDos[row.dos] = { obs: [], conflict: [], line: row.line };
    }

    if (isObs && !byDos[row.dos].obs.includes(row.code)) {
      byDos[row.dos].obs.push(row.code);
    }
    if (isConflict && !byDos[row.dos].conflict.includes(row.code)) {
      byDos[row.dos].conflict.push(row.code);
    }
  }

  const errors: ClaimIssue[] = [];
  for (const dos of Object.keys(byDos)) {
    const bucket = byDos[dos];
    if (bucket.obs.length === 0 || bucket.conflict.length === 0) continue;

    errors.push(
      bundlingError(
        EM_BDL_008,
        bucket.line,
        `Same-day observation/admit-discharge code(s) ${bucket.obs.join(', ')} cannot be billed with initial or discharge code(s) ${bucket.conflict.join(', ')}.`,
      ),
    );
  }

  return errors;
}

function validateBriefCheckIn(
  indexed: IndexedLine[],
  crossClaimRelated: readonly EmBundlingCrossClaimRelatedLine[],
): ClaimIssue[] {
  const checkInLines: IndexedLine[] = [];
  const relatedByDos: Record<string, string[]> = {};

  for (const row of indexed) {
    if (row.code === BRIEF_CHECKIN) {
      checkInLines.push(row);
      continue;
    }

    if (BRIEF_CHECKIN_RELATED_EM.includes(row.code)) {
      if (!relatedByDos[row.dos]) relatedByDos[row.dos] = [];
      relatedByDos[row.dos].push(row.code);
    }
  }

  if (checkInLines.length === 0) return [];

  const errors: ClaimIssue[] = [];
  const reported: Record<string, true> = {};

  for (const checkIn of checkInLines) {
    const dos = checkIn.dos;
    const line = checkIn.line;

    if (relatedByDos[dos]) {
      const key = `${dos}|same`;
      if (!reported[key]) {
        reported[key] = true;
        errors.push(
          bundlingError(
            EM_BDL_004,
            line,
            `Brief check-in 98016 cannot be billed with related E&M code(s) ${uniqueJoin(relatedByDos[dos])} on the same date/encounter.`,
          ),
        );
      }
    }

    for (let offset = 1; offset <= 7; offset += 1) {
      const priorDos = addDaysYmdBundling(dos, -offset);
      if (!relatedByDos[priorDos]) continue;

      const key = `${priorDos}|prior`;
      if (reported[key]) continue;
      reported[key] = true;

      errors.push(
        bundlingError(
          EM_BDL_004,
          line,
          `Brief check-in 98016 cannot be billed when a related E&M (${uniqueJoin(relatedByDos[priorDos])}) occurred in the prior 7 days (DOS ${priorDos}).`,
        ),
      );
    }

    const nextDos = addDaysYmdBundling(dos, 1);
    if (relatedByDos[nextDos]) {
      const key = `${nextDos}|next`;
      if (!reported[key]) {
        reported[key] = true;
        errors.push(
          bundlingError(
            EM_BDL_004,
            line,
            `Brief check-in 98016 cannot be billed when a related E&M (${uniqueJoin(relatedByDos[nextDos])}) occurs within 24 hours (DOS ${nextDos}).`,
          ),
        );
      }
    }
  }

  errors.push(...validateBriefCheckInAcrossClaims(checkInLines, crossClaimRelated, reported));

  return errors;
}

function validateBriefCheckInAcrossClaims(
  checkInLines: IndexedLine[],
  crossClaimRelated: readonly EmBundlingCrossClaimRelatedLine[],
  reported: Record<string, true>,
): ClaimIssue[] {
  if (crossClaimRelated.length === 0 || checkInLines.length === 0) {
    return [];
  }

  const relatedByDos: Record<string, string[]> = {};
  for (const related of crossClaimRelated) {
    const relatedDos = dosKeyBundling(related.serviceDateFrom);
    if (relatedDos === null) continue;
    const code = String(related.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '') continue;
    if (!relatedByDos[relatedDos]) relatedByDos[relatedDos] = [];
    relatedByDos[relatedDos].push(code);
  }

  const errors: ClaimIssue[] = [];

  for (const checkIn of checkInLines) {
    const dos = checkIn.dos;
    const line = checkIn.line;

    for (let offset = 1; offset <= 7; offset += 1) {
      const priorDos = addDaysYmdBundling(dos, -offset);
      if (!relatedByDos[priorDos]) continue;

      const key = `${priorDos}|prior`;
      if (reported[key]) continue;
      reported[key] = true;

      errors.push(
        bundlingError(
          EM_BDL_004,
          line,
          `Brief check-in 98016 cannot be billed when a related E&M (${uniqueJoin(relatedByDos[priorDos])}) occurred in the prior 7 days (DOS ${priorDos}).`,
        ),
      );
    }

    const nextDos = addDaysYmdBundling(dos, 1);
    if (relatedByDos[nextDos]) {
      const key = `${nextDos}|next`;
      if (!reported[key]) {
        reported[key] = true;
        errors.push(
          bundlingError(
            EM_BDL_004,
            line,
            `Brief check-in 98016 cannot be billed when a related E&M (${uniqueJoin(relatedByDos[nextDos])}) occurs within 24 hours (DOS ${nextDos}).`,
          ),
        );
      }
    }

    if (relatedByDos[dos]) {
      const key = `${dos}|same`;
      if (!reported[key]) {
        reported[key] = true;
        errors.push(
          bundlingError(
            EM_BDL_004,
            line,
            `Brief check-in 98016 cannot be billed with related E&M code(s) ${uniqueJoin(relatedByDos[dos])} on the same date/encounter.`,
          ),
        );
      }
    }
  }

  return errors;
}

function validateMedicareConsultation(
  indexed: IndexedLine[],
  claim: EmBundlingClaimInput,
): ClaimIssue[] {
  const indicator = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (!MEDICARE_FILING_INDICATORS.includes(indicator)) return [];

  const consultSet = recordFromList(CONSULTATION);
  const errors: ClaimIssue[] = [];
  const seen: Record<string, true> = {};

  for (const row of indexed) {
    if (!consultSet[row.code]) continue;
    if (seen[row.code]) continue;
    seen[row.code] = true;

    errors.push(
      bundlingError(
        EM_BDL_010,
        row.line,
        `Consultation code ${row.code} is not billable to Medicare (MA/MB). Bill the equivalent office/outpatient or hospital E&M instead.`,
      ),
    );
  }

  return errors;
}

function validateCriticalCareWithEd(
  indexed: IndexedLine[],
  claim: EmBundlingClaimInput,
): ClaimIssue[] {
  const criticalSet = recordFromList(CRITICAL_CARE);
  const edSet = recordFromList(ED_EM);
  const claimNpi = normalizeNpi(String(claim.renderingProviderNpi ?? ''));

  const byDos: Record<
    string,
    {
      critical: Array<{ line: EmBundlingServiceLineInput; code: string; npi: string }>;
      ed: Array<{ line: EmBundlingServiceLineInput; code: string; npi: string }>;
    }
  > = {};

  for (const row of indexed) {
    const isCritical = Boolean(criticalSet[row.code]);
    const isEd = Boolean(edSet[row.code]);
    if (!isCritical && !isEd) continue;

    const npi = row.renderingNpi !== '' ? row.renderingNpi : claimNpi;
    if (!byDos[row.dos]) {
      byDos[row.dos] = { critical: [], ed: [] };
    }

    const entry = { line: row.line, code: row.code, npi };

    if (isCritical) byDos[row.dos].critical.push(entry);
    if (isEd) byDos[row.dos].ed.push(entry);
  }

  const errors: ClaimIssue[] = [];

  for (const dos of Object.keys(byDos)) {
    const bucket = byDos[dos];
    if (bucket.critical.length === 0 || bucket.ed.length === 0) continue;

    let matched = false;
    for (const criticalRow of bucket.critical) {
      for (const edRow of bucket.ed) {
        if (npisMatchOrUnknown(criticalRow.npi, edRow.npi)) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) continue;

    const criticalCodes = [...new Set(bucket.critical.map((r) => r.code))];
    const edCodes = [...new Set(bucket.ed.map((r) => r.code))];

    errors.push(
      bundlingError(
        EM_BDL_011,
        bucket.critical[0].line,
        `Critical care code(s) ${criticalCodes.join(', ')} generally cannot be billed with ED E&M code(s) ${edCodes.join(', ')} by the same physician on the same date.`,
      ),
    );
  }

  return errors;
}

function validateProlongedNonFaceSameDate(indexed: IndexedLine[]): ClaimIssue[] {
  const prolongedSet = recordFromList(PROLONGED_NON_FACE);
  const faceSet = recordFromList(FACE_TO_FACE_EM_FOR_PROLONGED);

  const byDos: Record<
    string,
    { prolonged: string[]; face: string[]; line: EmBundlingServiceLineInput }
  > = {};

  for (const row of indexed) {
    const isProlonged = Boolean(prolongedSet[row.code]);
    const isFace = Boolean(faceSet[row.code]);
    if (!isProlonged && !isFace) continue;

    if (!byDos[row.dos]) {
      byDos[row.dos] = { prolonged: [], face: [], line: row.line };
    }

    if (isProlonged && !byDos[row.dos].prolonged.includes(row.code)) {
      byDos[row.dos].prolonged.push(row.code);
    }
    if (isFace && !byDos[row.dos].face.includes(row.code)) {
      byDos[row.dos].face.push(row.code);
    }
  }

  const errors: ClaimIssue[] = [];
  for (const dos of Object.keys(byDos)) {
    const bucket = byDos[dos];
    if (bucket.prolonged.length === 0 || bucket.face.length === 0) continue;

    errors.push(
      bundlingError(
        EM_BDL_012,
        bucket.line,
        `Non-face-to-face prolonged service code(s) ${bucket.prolonged.join(', ')} cannot be billed on the same date as related face-to-face E&M code(s) ${bucket.face.join(', ')}.`,
      ),
    );
  }

  return errors;
}

function validateProlongedAddonBase(indexed: IndexedLine[]): ClaimIssue[] {
  const addonSet = recordFromList(PROLONGED_ADDON);
  const baseSet = recordFromList(PROLONGED_ADDON_BASES);

  const byDos: Record<
    string,
    { addons: Array<{ line: EmBundlingServiceLineInput; code: string }>; hasValidBase: boolean }
  > = {};

  for (const row of indexed) {
    if (!byDos[row.dos]) {
      byDos[row.dos] = { addons: [], hasValidBase: false };
    }

    if (addonSet[row.code]) {
      byDos[row.dos].addons.push({ line: row.line, code: row.code });
    }

    if (baseSet[row.code]) {
      byDos[row.dos].hasValidBase = true;
    }
  }

  const errors: ClaimIssue[] = [];
  for (const dos of Object.keys(byDos)) {
    const bucket = byDos[dos];
    if (bucket.addons.length === 0) continue;
    if (bucket.hasValidBase) continue;

    const addon = bucket.addons[0];
    errors.push(
      bundlingError(
        EM_BDL_013,
        addon.line,
        'Prolonged service add-on 99417 is only billable with highest-level office/telemedicine codes 99205, 99215, 98003-98007, or 98011-98015.',
      ),
    );
  }

  return errors;
}

function validatePreventiveWithProblemEm(indexed: IndexedLine[]): ClaimIssue[] {
  const preventiveSet = recordFromList(PREVENTIVE);
  const problemSet = recordFromList(OFFICE_OUTPATIENT);

  const byDos: Record<
    string,
    {
      preventive: string[];
      problem: Array<{ line: EmBundlingServiceLineInput; code: string; modifiers: string[] }>;
      line: EmBundlingServiceLineInput;
    }
  > = {};

  for (const row of indexed) {
    const isPreventive = Boolean(preventiveSet[row.code]);
    const isProblem = Boolean(problemSet[row.code]);
    if (!isPreventive && !isProblem) continue;

    if (!byDos[row.dos]) {
      byDos[row.dos] = { preventive: [], problem: [], line: row.line };
    }

    if (isPreventive && !byDos[row.dos].preventive.includes(row.code)) {
      byDos[row.dos].preventive.push(row.code);
    }

    if (isProblem) {
      byDos[row.dos].problem.push({
        line: row.line,
        code: row.code,
        modifiers: row.modifiers,
      });
    }
  }

  const errors: ClaimIssue[] = [];
  for (const dos of Object.keys(byDos)) {
    const bucket = byDos[dos];
    if (bucket.preventive.length === 0 || bucket.problem.length === 0) continue;

    const missing25: string[] = [];
    let problemLine = bucket.problem[0].line;
    for (const problem of bucket.problem) {
      if (!problem.modifiers.includes('25')) {
        missing25.push(problem.code);
        problemLine = problem.line;
      }
    }

    if (missing25.length === 0) continue;

    errors.push(
      bundlingError(
        EM_BDL_014,
        problemLine,
        `Preventive code(s) ${bucket.preventive.join(', ')} billed with problem E&M code(s) ${[...new Set(missing25)].join(', ')} on the same date require modifier 25 on the problem E&M.`,
      ),
    );
  }

  return errors;
}

function bundlingError(rule: string, line: EmBundlingServiceLineInput, message: string): ClaimIssue {
  return {
    rule,
    field: `service_lines.${line.lineNumber}.procedure_code`,
    message: `Line ${line.lineNumber}: ${message}`,
    severity: 'error',
  };
}

function formatPairMessage(template: string, codesA: string, codesB: string): string {
  return template.replace('%s', codesA).replace('%s', codesB);
}

function uniqueJoin(codes: string[]): string {
  return [...new Set(codes)].join(', ');
}

function recordFromList(codes: readonly string[]): Record<string, true> {
  return Object.fromEntries(codes.map((c) => [c, true as const])) as Record<string, true>;
}

function dosKeyBundling(from: string | Date | null | undefined): string | null {
  if (from == null) return null;
  if (from instanceof Date) return formatYmdUtcBundling(from);

  const s = String(from).trim();
  if (s === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatYmdUtcBundling(parsed);
}

function formatYmdUtcBundling(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysYmdBundling(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d + days));
  return formatYmdUtcBundling(date);
}

function modifiersOnLineBundling(line: EmBundlingServiceLineInput): string[] {
  return [line.modifier1, line.modifier2, line.modifier3, line.modifier4]
    .map((raw) => normalizeModifierBundling(raw))
    .filter((m) => m !== '');
}

function normalizeModifierBundling(modifier: string | null | undefined): string {
  const m = String(modifier ?? '')
    .trim()
    .toUpperCase();
  if (m === '') return '';
  return m.padStart(2, '0');
}

function normalizeNpi(npi: string): string {
  return npi.replace(/\D+/g, '');
}

function sameRenderingProvider(npiA: string, npiB: string): boolean {
  if (npiA === '' || npiB === '') return true;
  return npiA === npiB;
}

function npisMatchOrUnknown(npiA: string, npiB: string): boolean {
  if (npiA === '' || npiB === '') return true;
  return npiA === npiB;
}
