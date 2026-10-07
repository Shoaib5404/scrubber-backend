import { DOMParser, Document as XmlDocument } from '@xmldom/xmldom';
import { readFile } from 'fs/promises';
import { DescriptionType, DescriptionTypeValue, DiagnosisNode, createDiagnosisNode } from './icd10-tabular.types';

/** Minimal DOM surface used by this parser (satisfied by `@xmldom/xmldom`). */
interface XmlNode {
  nodeType: number;
  tagName?: string;
  textContent: string | null;
  childNodes: { length: number; [index: number]: XmlNode };
  getAttribute?(name: string): string | null;
}
type XmlElement = XmlNode & { tagName: string; getAttribute(name: string): string | null };

const ELEMENT_NODE = 1;

export type Icd10TabularWarn = (message: string) => void;

const defaultWarn: Icd10TabularWarn = (message) => {
  // eslint-disable-next-line no-console
  console.warn(message);
};

function trim(value: string | null): string {
  return (value ?? '').trim();
}

function elementChildren(node: XmlNode): XmlElement[] {
  const out: XmlElement[] = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes[i];
    if (child && child.nodeType === ELEMENT_NODE) {
      out.push(child as XmlElement);
    }
  }
  return out;
}

function firstDirectChildElement(el: XmlNode, tag: string): XmlElement | null {
  for (let i = 0; i < el.childNodes.length; i += 1) {
    const child = el.childNodes[i];
    if (child && child.nodeType === ELEMENT_NODE && (child as XmlElement).tagName === tag) {
      return child as XmlElement;
    }
  }
  return null;
}

/** Laravel Icd10TabularParser::appendNoteChildren — ALL element children, not only `<note>`. */
function appendNoteChildren(target: DiagnosisNode, wrapper: XmlElement, type: DescriptionTypeValue): void {
  for (const child of elementChildren(wrapper)) {
    target.descriptions.push({ description: trim(child.textContent), descriptionType: type });
  }
}

/** Laravel Icd10TabularParser::firstInnerTextFromNoteLike. */
function firstInnerTextFromNoteLike(wrapper: XmlElement): string {
  for (const child of elementChildren(wrapper)) {
    if (child.tagName === 'note') {
      return trim(child.textContent);
    }
  }
  return trim(wrapper.textContent);
}

/** Laravel Icd10TabularParser::appendRightChar (str_pad with STR_PAD_RIGHT). */
export function appendRightChar(input: string, character: string, totalSize: number): string {
  if (input.length >= totalSize) {
    return input;
  }
  return input + character.repeat(totalSize - input.length);
}

/**
 * Laravel Icd10TabularParser::processSevenChrDef — exact phrase matching against the Laravel
 * list. The first two phrase checks below overlap by design (the plural "...codes in
 * subcategory" phrase is checked first because it is also a superstring-match candidate for the
 * singular "...to code" phrase that follows); preserve this check order.
 */
type SevenChrDefResolution =
  | { action: 'immediate' }
  | { action: 'defer'; node: XmlElement }
  | { action: 'none' };

const SEVEN_CHR_DEFER_PATTERNS: readonly string[] = [
  '7th character is to be added to each code from category',
  '7th character is to be added to each code from subcategory',
  '7th characters is to be assigned to each code under category',
  '7th characters is to be assigned to each code under subcategory',
  '7th character is to be added to subcategory',
  '7th character is to be added to all codes from category',
  '7th character is to be added to all codes from subcategories',
  '7th character is to be added to each code from subcategories',
  '7th characters is to be assigned to each code in subcategory',
];

function resolveSevenChrDef(sevenChrNote: string, sevenChrDefEl: XmlElement): SevenChrDefResolution {
  if (sevenChrNote.includes('7th characters is to be assigned to codes in subcategory')) {
    return { action: 'defer', node: sevenChrDefEl };
  }
  if (sevenChrNote.includes('7th characters is to be assigned to code')) {
    return { action: 'immediate' };
  }
  if (sevenChrNote.includes('7th character is to be added to code')) {
    return { action: 'immediate' };
  }
  for (const pattern of SEVEN_CHR_DEFER_PATTERNS) {
    if (sevenChrNote.includes(pattern)) {
      return { action: 'defer', node: sevenChrDefEl };
    }
  }
  return { action: 'none' };
}

/** Laravel Icd10TabularParser::addExtensionSyntheticChildren / the inline duplicate in parseDiagnosis. */
function addExtensionSyntheticChildren(xNode: XmlElement, diag: DiagnosisNode, sevenChrDefEl: XmlElement): void {
  for (const node of elementChildren(sevenChrDefEl)) {
    if (node.tagName !== 'extension') {
      continue;
    }
    const dg = createDiagnosisNode();
    const char = node.getAttribute('char') ?? '';
    if (diag.code.includes('.')) {
      dg.code = appendRightChar(diag.code, 'X', 7) + char;
    } else {
      const padded = appendRightChar(diag.code, 'X', 6) + char;
      dg.code = `${padded.slice(0, 3)}.${padded.slice(3)}`;
    }
    const descEl = firstDirectChildElement(xNode, 'desc');
    const baseDesc = descEl !== null ? trim(descEl.textContent) : '';
    dg.descriptions.push({
      description: `${baseDesc}, ${trim(node.textContent)}`,
      descriptionType: DescriptionType.Default,
    });
    diag.diagnosis.push(dg);
  }
}

/** Laravel Icd10TabularParser::parseDiagnosis. */
function parseDiagnosis(
  xNode: XmlElement,
  parent: DiagnosisNode,
  sevenChrExtNode: XmlElement | null,
  warn: Icd10TabularWarn,
): void {
  const diag = createDiagnosisNode();
  let sevenChrNote = '';
  let sevenChrDef: XmlElement | null = null;

  if (sevenChrExtNode !== null && firstDirectChildElement(xNode, 'diag') !== null) {
    sevenChrDef = sevenChrExtNode;
  }

  for (const child of elementChildren(xNode)) {
    switch (child.tagName) {
      case 'name':
        diag.code = trim(child.textContent);
        break;
      case 'desc':
        diag.descriptions.push({ description: trim(child.textContent), descriptionType: DescriptionType.Default });
        break;
      case 'includes':
        appendNoteChildren(diag, child, DescriptionType.IncludeNote);
        break;
      case 'inclusionTerm':
        appendNoteChildren(diag, child, DescriptionType.InclusionTerm);
        break;
      case 'useAdditionalCode':
        appendNoteChildren(diag, child, DescriptionType.AdditionalCodeNote);
        break;
      case 'codeAlso':
        appendNoteChildren(diag, child, DescriptionType.CodeAlsoNote);
        break;
      case 'excludes1':
        appendNoteChildren(diag, child, DescriptionType.Exclude1Note);
        break;
      case 'excludes2':
        appendNoteChildren(diag, child, DescriptionType.Exclude2Note);
        break;
      case 'codeFirst':
        appendNoteChildren(diag, child, DescriptionType.CodeFirstNote);
        break;
      case 'notes':
        appendNoteChildren(diag, child, DescriptionType.Notes);
        break;
      case 'sevenChrNote':
        sevenChrNote = firstInnerTextFromNoteLike(child);
        break;
      case 'sevenChrDef': {
        const resolution = resolveSevenChrDef(sevenChrNote, child);
        switch (resolution.action) {
          case 'immediate':
            addExtensionSyntheticChildren(xNode, diag, child);
            break;
          case 'defer':
            sevenChrDef = resolution.node;
            break;
          case 'none':
            warn(
              `icd10:tabular-import: sevenChrDef present but sevenChrNote unmatched for code ` +
                `"${diag.code}": "${sevenChrNote}"`,
            );
            break;
          default: {
            const unhandled: never = resolution;
            throw new Error(`Unhandled sevenChrDef resolution: ${JSON.stringify(unhandled)}`);
          }
        }
        break;
      }
      case 'diag':
        parseDiagnosis(child, diag, sevenChrDef, warn);
        break;
      default:
        break;
    }
  }

  if (sevenChrExtNode !== null && firstDirectChildElement(xNode, 'diag') === null) {
    addExtensionSyntheticChildren(xNode, diag, sevenChrExtNode);
  }

  parent.diagnosis.push(diag);
}

/** Laravel Icd10TabularParser::parseSection. */
function parseSection(chapter: DiagnosisNode, sectionEl: XmlElement, warn: Icd10TabularWarn): void {
  const diagSection = createDiagnosisNode();
  diagSection.isSection = true;
  diagSection.code = sectionEl.getAttribute('id') ?? '';

  for (const child of elementChildren(sectionEl)) {
    switch (child.tagName) {
      case 'desc':
        diagSection.descriptions.push({
          description: trim(child.textContent),
          descriptionType: DescriptionType.Default,
        });
        break;
      case 'includes':
        appendNoteChildren(diagSection, child, DescriptionType.IncludeNote);
        break;
      case 'inclusionTerm':
        appendNoteChildren(diagSection, child, DescriptionType.InclusionTerm);
        break;
      case 'useAdditionalCode':
        appendNoteChildren(diagSection, child, DescriptionType.AdditionalCodeNote);
        break;
      case 'codeAlso':
        appendNoteChildren(diagSection, child, DescriptionType.CodeAlsoNote);
        break;
      case 'excludes1':
        appendNoteChildren(diagSection, child, DescriptionType.Exclude1Note);
        break;
      case 'excludes2':
        appendNoteChildren(diagSection, child, DescriptionType.Exclude2Note);
        break;
      case 'codeFirst':
        appendNoteChildren(diagSection, child, DescriptionType.CodeFirstNote);
        break;
      case 'notes':
        appendNoteChildren(diagSection, child, DescriptionType.Notes);
        break;
      case 'diag':
        parseDiagnosis(child, diagSection, null, warn);
        break;
      default:
        break;
    }
  }

  chapter.diagnosis.push(diagSection);
}

/** Laravel Icd10TabularParser::parseChapter. */
function parseChapter(xNode: XmlElement, warn: Icd10TabularWarn): DiagnosisNode {
  const diagnosis = createDiagnosisNode();
  diagnosis.isChapter = true;

  for (const child of elementChildren(xNode)) {
    switch (child.tagName) {
      case 'name':
        diagnosis.code = trim(child.textContent);
        break;
      case 'desc':
        diagnosis.descriptions.push({
          description: trim(child.textContent),
          descriptionType: DescriptionType.Default,
        });
        break;
      case 'includes':
        appendNoteChildren(diagnosis, child, DescriptionType.IncludeNote);
        break;
      case 'useAdditionalCode':
        appendNoteChildren(diagnosis, child, DescriptionType.AdditionalCodeNote);
        break;
      case 'codeAlso':
        appendNoteChildren(diagnosis, child, DescriptionType.CodeAlsoNote);
        break;
      case 'excludes1':
        appendNoteChildren(diagnosis, child, DescriptionType.Exclude1Note);
        break;
      case 'excludes2':
        appendNoteChildren(diagnosis, child, DescriptionType.Exclude2Note);
        break;
      case 'codeFirst':
        appendNoteChildren(diagnosis, child, DescriptionType.CodeFirstNote);
        break;
      case 'notes':
        appendNoteChildren(diagnosis, child, DescriptionType.Notes);
        break;
      case 'section':
        parseSection(diagnosis, child, warn);
        break;
      default:
        break;
    }
  }

  return diagnosis;
}

/**
 * Laravel Icd10TabularParser::parseFile — root must be `ICD10CM.tabular`; only direct `<chapter>`
 * children are parsed (`<version>`, `<introduction>`, `<sectionIndex>`, etc. are ignored).
 */
export function parseIcd10TabularXml(xml: string, warn: Icd10TabularWarn = defaultWarn): DiagnosisNode[] {
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level === 'fatalError') {
        throw new Error(message);
      }
    },
  });

  let doc: XmlDocument;
  try {
    doc = parser.parseFromString(xml, 'text/xml');
  } catch (e) {
    throw new Error(`Failed to parse ICD-10 tabular XML: ${e instanceof Error ? e.message : String(e)}`);
  }

  const root = doc.documentElement as unknown as XmlElement | null;
  if (root === null || root.tagName !== 'ICD10CM.tabular') {
    throw new Error('Expected root element ICD10CM.tabular');
  }

  const chapters: DiagnosisNode[] = [];
  for (const child of elementChildren(root)) {
    if (child.tagName === 'chapter') {
      chapters.push(parseChapter(child, warn));
    }
  }
  return chapters;
}

export async function parseIcd10TabularFile(filePath: string, warn: Icd10TabularWarn = defaultWarn): Promise<DiagnosisNode[]> {
  const xml = await readFile(filePath, 'utf8');
  return parseIcd10TabularXml(xml, warn);
}
