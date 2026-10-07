/**
 * Legacy chapter pseudo-codes keyed by the XML `<chapter><name>` id (e.g. `"1"`, `"19"`) — not
 * ICD-10-CM diagnosis codes themselves. Port of Laravel
 * App\Services\ImportLibs\Icd10Parser\Icd10TabularParser::mapChapterCode (originally
 * ICD10-Lib-Parser `GetChapterCode`).
 */
const CHAPTER_CODE_BY_ID: Readonly<Record<string, string>> = {
  '1': 'ID',
  '2': 'NEO',
  '3': 'HEM',
  '4': 'END',
  '5': 'PSY',
  '6': 'NEU',
  '7': 'EYE',
  '8': 'EAR',
  '9': 'CV',
  '10': 'RES',
  '11': 'GI',
  '12': 'SKN',
  '13': 'MUS',
  '14': 'GU',
  '15': 'OB',
  '16': 'PER',
  '17': 'CON',
  '18': 'SX',
  '19': 'INJ',
  '20': 'EXT',
  '21': 'Z',
  '22': 'U',
};

/** Laravel Icd10TabularParser::mapChapterCode — unknown ids map to '' (not null/undefined). */
export function mapChapterCode(chapterId: string): string {
  return CHAPTER_CODE_BY_ID[chapterId.trim().toLowerCase()] ?? '';
}

/**
 * Port of Laravel App\Console\Commands\ImportIcd10Tabular::CHAPTER_CODE_RANGES — used by
 * `icd10:tabular-import --update-chapter-code-ranges` to rewrite chapter abbreviation codes
 * (e.g. `ID`) to ICD-10-CM chapter code ranges (e.g. `A00-B99`).
 */
export const CHAPTER_CODE_RANGES: Readonly<Record<string, string>> = {
  ID: 'A00-B99',
  NEO: 'C00-D49',
  HEM: 'D50-D89',
  END: 'E00-E89',
  PSY: 'F01-F99',
  NEU: 'G00-G99',
  EYE: 'H00-H59',
  EAR: 'H60-H95',
  CV: 'I00-I99',
  RES: 'J00-J99',
  GI: 'K00-K95',
  SKN: 'L00-L99',
  MUS: 'M00-M99',
  GU: 'N00-N99',
  OB: 'O00-O9A',
  PER: 'P00-P96',
  CON: 'Q00-Q99',
  SX: 'R00-R99',
  INJ: 'S00-T88',
  EXT: 'V00-Y99',
  Z: 'Z00-Z99',
  U: 'U00-U85',
};
