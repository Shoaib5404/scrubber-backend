import { DescriptionType } from '../../../src/modules/imports/icd10-tabular/icd10-tabular.types';
import {
  assembleNotesByNormalizedCode,
  icdLookupCandidates,
  normalizeIcdCode,
  withIcdDot,
} from '../../../src/modules/claim-validation/support/icd-tabular-notes';

describe('ICD tabular notes helpers (M1)', () => {
  it('normalizes and dots ICD codes', () => {
    expect(normalizeIcdCode('e11.9')).toBe('E119');
    expect(withIcdDot('E119')).toBe('E11.9');
    expect(withIcdDot('A00')).toBe('A00');
  });

  it('builds dotted + undotted lookup candidates', () => {
    expect(icdLookupCandidates(['E11.9', 'e11.9']).sort()).toEqual(['E11.9', 'E119'].sort());
  });

  it('assembles notes from leaf + ancestor holders', () => {
    const notes = assembleNotesByNormalizedCode(
      [
        { id: 10, code: 'E11.9', isBillable: true },
        { id: 11, code: 'E119', isBillable: true },
      ],
      new Map([
        [10, [10, 2, 1]],
        [11, [11]],
      ]),
      [
        {
          icd10TabularCodeId: 1,
          descriptionType: DescriptionType.Exclude1Note,
          description: 'Excludes1 chapter',
        },
        {
          icd10TabularCodeId: 10,
          descriptionType: DescriptionType.CodeFirstNote,
          description: 'Code first leaf',
        },
        {
          icd10TabularCodeId: 11,
          descriptionType: DescriptionType.AdditionalCodeNote,
          description: 'Use additional',
        },
      ],
    );

    expect(notes.E119?.[DescriptionType.Exclude1Note]).toEqual(['Excludes1 chapter']);
    expect(notes.E119?.[DescriptionType.CodeFirstNote]).toEqual(['Code first leaf']);
    expect(notes.E119?.[DescriptionType.AdditionalCodeNote]).toEqual(['Use additional']);
  });
});
