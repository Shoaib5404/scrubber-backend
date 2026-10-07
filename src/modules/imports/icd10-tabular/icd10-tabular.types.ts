/**
 * Port of Laravel App\Services\ImportLibs\Icd10Parser\DescriptionType — int-backed values stored
 * in `icd10_tabular_code_descriptions.description_type`.
 */
export const DescriptionType = {
  Default: 1,
  IncludeNote: 2,
  AdditionalCodeNote: 3,
  Exclude1Note: 4,
  Exclude2Note: 5,
  InclusionTerm: 6,
  ShortDescription: 7,
  CodeAlsoNote: 8,
  Notes: 9,
  CodeFirstNote: 10,
} as const;

export type DescriptionTypeValue = (typeof DescriptionType)[keyof typeof DescriptionType];

export interface DiagnosisDescription {
  description: string;
  descriptionType: DescriptionTypeValue;
}

/** Port of Laravel App\Services\ImportLibs\Icd10Parser\DiagnosisView (in-memory parse tree node). */
export interface DiagnosisNode {
  code: string;
  isSection: boolean;
  isChapter: boolean;
  isBillable: boolean;
  descriptions: DiagnosisDescription[];
  diagnosis: DiagnosisNode[];
}

export function createDiagnosisNode(): DiagnosisNode {
  return {
    code: '',
    isSection: false,
    isChapter: false,
    isBillable: false,
    descriptions: [],
    diagnosis: [],
  };
}
