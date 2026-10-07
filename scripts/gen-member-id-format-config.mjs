import fs from 'fs';

const php = fs.readFileSync(
  'c:/sites/neo-scrubber/app/Services/Validation/Rules/PayerAndEdiSpecificRules/Formats.php',
  'utf8',
);
const block = php.match(/public const MEMBER_ID_FORMAT_RULES = \[([\s\S]*?)\n    \];/)[1];
const entries = {};
const re =
  /^\s+'([^']+)'\s*=>\s*\[\s*\n\s*'rule_code'\s*=>\s*'([^']+)',\s*\n\s*'pattern'\s*=>\s*'([^']+)',\s*\n\s*'message'\s*=>\s*self::([A-Z_0-9]+),\s*\n\s*\],/gm;
let x;
while ((x = re.exec(block))) {
  entries[x[1]] = { ruleCode: x[2], pattern: x[3] };
}

const lines = [];
lines.push(`import { MEMBER_ID_MISSING_OR_INVALID_MESSAGE } from './payer-edi-messages';`);
lines.push('');
lines.push('export type MemberIdFormatRule = {');
lines.push('  ruleCode: string;');
lines.push('  pattern: RegExp;');
lines.push('  message: string;');
lines.push('};');
lines.push('');
lines.push('/** Laravel Formats::MEMBER_ID_FORMAT_RULES (payer EMC catalog). */');
lines.push('export const MEMBER_ID_FORMAT_RULES: Record<string, MemberIdFormatRule> = {');
for (const [payerId, def] of Object.entries(entries)) {
  const pat = def.pattern.replace(/^\//, '').replace(/\/i$/, '').replace(/\/$/, '');
  lines.push(`  '${payerId}': {`);
  lines.push(`    ruleCode: '${def.ruleCode}',`);
  lines.push(`    pattern: /${pat}/i,`);
  lines.push(`    message: MEMBER_ID_MISSING_OR_INVALID_MESSAGE,`);
  lines.push(`  },`);
}
lines.push('};');

const out =
  'c:/sites/Scrubber/scrubber-backend/src/modules/claim-validation/config/member-id-format-rules.config.ts';
fs.writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`wrote ${out} (${Object.keys(entries).length} entries)`);
