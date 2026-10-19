import fs from 'node:fs';
import path from 'node:path';

const backendRoot = path.resolve(import.meta.dirname, '..');
const claimRoot = path.join(backendRoot, 'src/modules/claim-validation');
const docPath = path.resolve(
  backendRoot,
  '../scrubber-documentation/docs/08-validation/business-rule-catalog.md',
);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) acc.push(full);
  }
  return acc;
}

const codeRe = /['"]([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)['"]/g;
const codes = new Set();
for (const file of walk(claimRoot)) {
  const text = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = codeRe.exec(text))) codes.add(match[1]);
}

const descriptions = new Map();
const markdown = fs.readFileSync(docPath, 'utf8');
const rowRe = /\|\s*`([^`]+)`\s*\|\s*([^|\n]+)\|/g;
let row;
while ((row = rowRe.exec(markdown))) {
  const key = row[1].trim();
  const text = row[2].trim().replace(/\s+/g, ' ');
  if (key.includes(' through ')) continue;
  if (!key.includes('`') && /^[A-Z0-9-]+$/.test(key)) descriptions.set(key, text);
}

const zipPeople = [
  ['BILL', 'Billing provider'],
  ['PAT', 'Patient'],
  ['FAC', 'Service facility'],
  ['SUB', 'Subscriber'],
  ['OSUB', 'Other subscriber'],
  ['OPAT', 'Other patient'],
];
for (const [suffix, label] of zipPeople) {
  descriptions.set(
    `ZIP-${suffix}-001`,
    `The ${label.toLowerCase()} ZIP code must be a real USPS ZIP.`,
  );
  descriptions.set(
    `ZIP-STATE-${suffix}-001`,
    `The ${label.toLowerCase()} state must match the ZIP code.`,
  );
  descriptions.set(
    `ZIP-CITY-${suffix}-001`,
    `The ${label.toLowerCase()} city must match the USPS city for that ZIP code. An acceptable alternate city is a warning.`,
  );
}
descriptions.set(
  'ZIP-CITY-001',
  'Fallback when a city check has no more specific rule code. The city must match the USPS city for the ZIP code.',
);
descriptions.set('CITY-BILL-001', 'The billing provider city name must be in an acceptable form.');
descriptions.set('CITY-SUB-001', 'The subscriber city name must be in an acceptable form.');
descriptions.set('CITY-FAC-001', 'The service facility city name must be in an acceptable form.');
for (let i = 1; i <= 14; i += 1) {
  const key = `EM-BDL-${String(i).padStart(3, '0')}`;
  descriptions.set(
    key,
    'Same-day evaluation-and-management bundling. This code is one specific pairing, such as a problem visit with a procedure or brief check-in 98016 with a related visit.',
  );
}

const impact = {
  'DOS-FUT-001':
    'A future date of service stops the rest of the business rules. Turning this off lets the remaining rules run.',
  'CPT-001':
    'An unknown procedure is normally left out of later clinical checks. Turning this off lets those later checks run on the line.',
  'REQ-007':
    'A line with no procedure code is normally left out of later clinical checks. Turning this off lets those later checks run on the line.',
};

function categoryFor(key) {
  if (key.startsWith('REQ-') || key.startsWith('FMT-') || key === 'BUS-005') return 'Required fields';
  if (key.startsWith('DOS-') || key.startsWith('DTP-') || key.startsWith('DOB-') || key === 'ADM-POS-001') {
    return 'Dates';
  }
  if (key.startsWith('ZIP-') || key.startsWith('CITY-') || key === 'ADDR-001') return 'Address';
  if (
    key.startsWith('MID-') ||
    key === 'CS-SSN-001' ||
    key === 'VAL-OPT-001'
  ) {
    return 'Member ID';
  }
  if (
    key.startsWith('NPI-') ||
    key.startsWith('REF-') ||
    key.startsWith('TAX-') ||
    key.startsWith('TIN-') ||
    key === 'SSN-001'
  ) {
    return 'Provider identity';
  }
  if (
    key.startsWith('ICD-') ||
    key.startsWith('NCD-') ||
    key.startsWith('AETNA-') ||
    key.startsWith('CIGNA-')
  ) {
    return 'Diagnosis';
  }
  if (
    key.startsWith('CPT-') ||
    key.startsWith('HCPCS-') ||
    key === 'AOC-001' ||
    key === 'UHC-PA-001' ||
    key === 'REQ-007'
  ) {
    return 'Procedure';
  }
  if (key.startsWith('NDC-') || key.startsWith('AMT-') || key === 'UNIT-DAY-001' || key === 'REQ-006' || key === 'REQ-008') {
    return 'Line amount and drug';
  }
  if (key.startsWith('AGE-') || key.startsWith('GEN-') || key.startsWith('ANE-')) {
    return 'Age, gender, and anesthesia';
  }
  if (key.startsWith('MOD-') || key.startsWith('SURG-') || key.startsWith('RAD-')) return 'Modifiers';
  if (key.startsWith('EM-') || key.startsWith('WELL-') || key.startsWith('VAC-') || key === 'MCR-VAC-001') {
    return 'Evaluation and management';
  }
  if (key.startsWith('NCCI-') || key.startsWith('MUE')) return 'NCCI and units';
  if (key.startsWith('POS-') || key.startsWith('UHC-POS')) return 'Place of service';
  if (key.startsWith('COB-')) return 'Other insurance';
  if (key.startsWith('SBR-') || key.startsWith('ITC-') || key === 'BCBS-001' || key === 'AARP-PRI-001') {
    return 'Filing and subscriber';
  }
  return 'Claim details';
}

function severityFor(key) {
  if (key === 'LAB-CLIA-002') return 'info';
  if (key === 'MOD-EP-001' || key === 'MOD-EP-002' || key === 'ICD-EX2-001') return 'warning';
  if (key.startsWith('ZIP-CITY-')) return 'warning';
  return 'error';
}

const entries = [...codes].sort().map((key) => ({
  ruleKey: key,
  name: key,
  description: impact[key] ?? descriptions.get(key) ?? 'Business validation rule.',
  category: categoryFor(key),
  severity: severityFor(key),
}));

const missing = entries.filter((entry) => entry.description === 'Business validation rule.');
if (missing.length) {
  console.error('Missing descriptions', missing.map((entry) => entry.ruleKey).join(', '));
  process.exit(1);
}

const out = `/* Generated by scripts/generate-business-rule-catalog.mjs. Do not edit by hand. */
export type BusinessRuleCatalogEntry = {
  ruleKey: string;
  name: string;
  description: string;
  category: string;
  severity: 'error' | 'warning' | 'info';
};

export const BUSINESS_RULE_CATALOG: readonly BusinessRuleCatalogEntry[] = ${JSON.stringify(entries, null, 2)};
`;

const target = path.join(backendRoot, 'src/modules/business-rules/business-rule.catalog.ts');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out);
console.log('wrote', entries.length, 'rules');
