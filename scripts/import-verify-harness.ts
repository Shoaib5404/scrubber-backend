/**
 * Import verify harness — import → count → wipe → count=0 per plan waves.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/import-verify-harness.ts --wave=1
 *   npx ts-node --transpile-only scripts/import-verify-harness.ts --wave=all
 *   npx ts-node --transpile-only scripts/import-verify-harness.ts --wave=restore
 */
import { execFileSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { ARTICLE_IMPORT_ORDER } from '../src/modules/imports/article-import.order';

type Wipe = 'truncate-flag' | 'fresh-flag' | 'sql';

type Job = {
  command: string;
  args?: string[];
  tables: string[];
  wipe: Wipe;
  /** Extra CLI flags for import (e.g. --date=...) */
  importFlags?: string[];
  skip?: string;
};

const RESULTS = join(__dirname, '../tmp/import-verify-results.csv');
const SUMMARY = join(__dirname, '../tmp/import-verify-summary.md');

const WAVE1: Job[] = [
  { command: 'anesthesia-codes:import', tables: ['anesthesia_codes'], wipe: 'truncate-flag' },
  { command: 'anesthesia-modifiers:import', tables: ['anesthesia_modifiers'], wipe: 'truncate-flag' },
  {
    command: 'anesthesia-codes-with-billable-modifiers:import',
    tables: ['anesthesia_codes_with_billable_modifiers'],
    wipe: 'truncate-flag',
  },
  { command: 'bcbs-claim-routings:import', tables: ['bcbs_claim_routings'], wipe: 'truncate-flag' },
  { command: 'i-codes:import', tables: ['i_codes'], wipe: 'truncate-flag' },
  { command: 'initial-treatment-codes:import', tables: ['initial_treatment_codes'], wipe: 'truncate-flag' },
  { command: 'major-surgery-codes:import', tables: ['major_surgery_codes'], wipe: 'truncate-flag' },
  { command: 'radiology-cpt-codes:import', tables: ['radiology_cpt_codes'], wipe: 'truncate-flag' },
  { command: 'no-of-units-cpts:import', tables: ['no_of_units_cpts'], wipe: 'truncate-flag' },
  {
    command: 'mue-87726-uhc-06111-oxford:import',
    tables: ['mue_87726_uhc_06111_oxford'],
    wipe: 'truncate-flag',
  },
  { command: 'uhc:import-authorizations', tables: ['uhc_authorizations'], wipe: 'truncate-flag' },
  { command: 'global-days-surgeries:import', tables: ['global_days_surgeries'], wipe: 'truncate-flag' },
  {
    command: 'icd10-unacceptable-principal-dx-codes:import',
    tables: ['icd10_unacceptable_principal_diagnose_codes'],
    wipe: 'truncate-flag',
  },
];

const WAVE2: Job[] = [
  { command: 'add-on-codes:import', tables: ['add_on_codes'], wipe: 'truncate-flag' },
  { command: 'aetna-b12-lcd:import', tables: ['aetna_b12_lcd'], wipe: 'truncate-flag' },
  { command: 'aetna-fetal-lcd:import', tables: ['aetna_fetal_lcd'], wipe: 'truncate-flag' },
  { command: 'cigna:import-cpt-icd-crosswalk', tables: ['cigna_cpt_icd_crosswalk'], wipe: 'truncate-flag' },
  { command: 'cpt:import-age', tables: ['age_specific_cpt_rules'], wipe: 'sql' },
  { command: 'cpt:import-gender', tables: ['gender_specific_cpt_rules'], wipe: 'sql' },
  {
    command: 'cpt:import-consultation-procedures',
    tables: ['consultation_procedures'],
    wipe: 'truncate-flag',
  },
  { command: 'cpt:import-enm-procedures', tables: ['enm_procedures'], wipe: 'truncate-flag' },
  { command: 'cpt:import-enm-surgery-codes', tables: ['enm_surgery_codes'], wipe: 'truncate-flag' },
  { command: 'cpt:import-lab-codes', tables: ['lab_codes'], wipe: 'truncate-flag' },
  { command: 'icd:import-age', tables: ['age_specific_icd_rules'], wipe: 'truncate-flag' },
  { command: 'icd:import-gender', tables: ['icd_gender_specific_rules'], wipe: 'truncate-flag' },
  {
    command: 'icd:import-tobacco-counseling',
    tables: ['tobacco_counseling_icd_rules'],
    wipe: 'truncate-flag',
  },
  { command: 'mcr-vaccine-codes:import', tables: ['mcr_vaccine_codes'], wipe: 'truncate-flag' },
  { command: 'vaccine-codes:import', tables: ['vaccine_codes'], wipe: 'truncate-flag' },
  { command: 'modifiers:import', tables: ['modifiers'], wipe: 'truncate-flag' },
  { command: 'modifiers:import-sequence', tables: ['modifier_sequences'], wipe: 'truncate-flag' },
  { command: 'zero-amount-procedures:import', tables: ['zero_amount_procedures'], wipe: 'truncate-flag' },
  { command: 'taxonomy:import-codes', tables: ['taxonomy_codes'], wipe: 'truncate-flag' },
  { command: 'uhc:import-pos-crosswalk', tables: ['uhc_pos_crosswalk'], wipe: 'truncate-flag' },
  {
    command: 'medicaid:import-member-id-formats',
    tables: [],
    wipe: 'truncate-flag',
    skip: 'medicaid-json',
  },
];

const WAVE3: Job[] = [
  { command: 'cpt:import', tables: ['cpt_codes'], wipe: 'truncate-flag' },
  { command: 'cpt:import-pos', tables: ['cpt_pos_rules'], wipe: 'fresh-flag' },
  { command: 'cpt:import-modifier', tables: ['cpt_modifier_rules'], wipe: 'fresh-flag' },
  { command: 'icd10-body-sidewise:import', tables: ['icd10_body_sidewise'], wipe: 'truncate-flag' },
  { command: 'icd10-ncd:import', tables: ['ncd_cpt', 'ncd_icd'], wipe: 'truncate-flag' },
  {
    command: 'ncd-other-lab:import',
    tables: ['ncd_other_lab_cpt', 'ncd_other_lab_icd'],
    wipe: 'truncate-flag',
  },
  { command: 'ncd-other-lab:import-codes', tables: ['ncd_other_lab_codes'], wipe: 'truncate-flag' },
  { command: 'mue-practitioners:import', tables: ['mue_practitioners'], wipe: 'fresh-flag' },
  { command: 'ndc:import-hcpcs-crosswalk', tables: ['ndc_hcpcs_crosswalk'], wipe: 'truncate-flag' },
  { command: 'ndc:import-codes', tables: ['ndc_codes'], wipe: 'truncate-flag' },
  { command: 'zip:import-codes', tables: ['zip_codes'], wipe: 'truncate-flag' },
];

const WAVE4: Job[] = [
  {
    command: 'article:import',
    args: [],
    importFlags: ['--format=csv', '--path=import/article_csv'],
    tables: ARTICLE_IMPORT_ORDER.map((e) => e.table),
    wipe: 'fresh-flag',
  },
  {
    command: 'icd10:tabular-import',
    args: ['import/ICD 10 tabular/icd10cm_tabular_2026.xml'],
    tables: ['icd10_tabular_codes', 'icd10_tabular_code_descriptions'],
    wipe: 'truncate-flag',
  },
  {
    command: 'npi-ordering-referrings:import',
    args: ['import/NPI_Ordering_Referring/July_31_2026.csv'],
    tables: ['npi_ordering_referrings'],
    wipe: 'truncate-flag',
  },
  { command: 'ncci:import', tables: ['nccis'], wipe: 'fresh-flag' },
];

/** Re-import essentials after wipe so claim validation keeps working. */
const RESTORE: Job[] = [
  { command: 'major-surgery-codes:import', tables: ['major_surgery_codes'], wipe: 'truncate-flag' },
  { command: 'zip:import-codes', tables: ['zip_codes'], wipe: 'truncate-flag' },
  { command: 'cpt:import', tables: ['cpt_codes'], wipe: 'truncate-flag' },
  {
    command: 'icd10:tabular-import',
    args: ['import/ICD 10 tabular/icd10cm_tabular_2026.xml'],
    tables: ['icd10_tabular_codes', 'icd10_tabular_code_descriptions'],
    wipe: 'truncate-flag',
  },
  { command: 'bcbs-claim-routings:import', tables: ['bcbs_claim_routings'], wipe: 'truncate-flag' },
  { command: 'enm-procedures:import' as string, tables: ['enm_procedures'], wipe: 'truncate-flag' },
];

// Fix restore command name
RESTORE[5] = {
  command: 'cpt:import-enm-procedures',
  tables: ['enm_procedures'],
  wipe: 'truncate-flag',
};

const prisma = new PrismaClient();

async function countTables(tables: string[]): Promise<number> {
  if (!tables.length) return -1;
  let total = 0;
  for (const t of tables) {
    const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*)::bigint AS c FROM "${t}"`,
    );
    total += Number(rows[0]?.c ?? 0);
  }
  return total;
}

async function sqlWipe(tables: string[]): Promise<void> {
  if (!tables.length) return;
  const list = tables.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

function runCli(argv: string[], timeoutMs: number): { ok: boolean; output: string } {
  try {
    const output = execFileSync('node', ['dist/cli.js', ...argv], {
      cwd: join(__dirname, '..'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: timeoutMs,
      env: { ...process.env, USE_QUEUE: 'false' },
    });
    return { ok: true, output };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string; status?: number };
    return {
      ok: false,
      output: `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? e}`,
    };
  }
}

function logResult(row: string): void {
  mkdirSync(join(__dirname, '../tmp'), { recursive: true });
  if (!existsSync(RESULTS)) {
    writeFileSync(RESULTS, 'command,status,rows_after_import,ms,notes\n');
  }
  appendFileSync(RESULTS, row + '\n');
}

async function runJob(job: Job, mode: 'verify' | 'restore'): Promise<boolean> {
  const label = job.command;
  console.log(`\n=== ${label} (${mode}) ===`);
  const t0 = Date.now();

  if (job.skip === 'medicaid-json' && mode === 'verify') {
    const cliArgs = [job.command, ...(job.args ?? []), ...(job.importFlags ?? []), '--truncate'];
    const r = runCli(cliArgs, 10 * 60_000);
    const ms = Date.now() - t0;
    if (!r.ok) {
      logResult(`"${label}",fail,0,${ms},"import failed"`);
      console.error(r.output.slice(0, 1500));
      return false;
    }
    const storePath = join(__dirname, '../storage/data/medicaid-member-id-formats.json');
    mkdirSync(join(__dirname, '../storage/data'), { recursive: true });
    writeFileSync(
      storePath,
      JSON.stringify({ meta: { updated_at: new Date().toISOString() }, by_payer_id: {} }, null, 2),
    );
    logResult(`"${label}",pass,-1,${ms},"json-store import + emptied file"`);
    console.log(`PASS (medicaid-json) ${ms}ms`);
    return true;
  }

  try {
    const before = await countTables(job.tables);
    console.log(`before=${before}`);

    const wipeFlag =
      job.wipe === 'fresh-flag' ? '--fresh' : job.wipe === 'truncate-flag' ? '--truncate' : undefined;
    const cliArgs = [
      job.command,
      ...(job.args ?? []),
      ...(job.importFlags ?? []),
      ...(wipeFlag ? [wipeFlag] : []),
    ];

    const timeoutMs =
      label.startsWith('ncci:') || label.includes('modifier') || label.includes('zip') || label.includes('ndc:import-codes')
        ? 60 * 60_000
        : label.includes('article') || label.includes('tabular') || label.includes('npi')
          ? 30 * 60_000
          : 15 * 60_000;

    const r = runCli(cliArgs, timeoutMs);
    if (!r.ok) {
      const ms = Date.now() - t0;
      logResult(`"${label}",fail,0,${ms},"import failed"`);
      console.error(r.output.slice(0, 2000));
      return false;
    }

    const after = await countTables(job.tables);
    console.log(`after_import=${after}`);
    if (after <= 0 && job.tables.length) {
      const ms = Date.now() - t0;
      logResult(`"${label}",fail,${after},${ms},"zero rows after import"`);
      console.error('FAIL: zero rows');
      return false;
    }

    if (mode === 'restore') {
      const ms = Date.now() - t0;
      logResult(`"${label}",restored,${after},${ms},""`);
      console.log(`RESTORED rows=${after} ${ms}ms`);
      return true;
    }

    // Wipe tables after successful import verify
    await sqlWipe(job.tables);

    const empty = await countTables(job.tables);
    const ms = Date.now() - t0;
    if (empty !== 0 && job.tables.length) {
      logResult(`"${label}",fail,${after},${ms},"wipe left ${empty} rows"`);
      console.error(`FAIL: wipe left ${empty}`);
      return false;
    }

    logResult(`"${label}",pass,${after},${ms},""`);
    console.log(`PASS rows=${after} wiped=${empty} ${ms}ms`);
    return true;
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    logResult(`"${label}",fail,0,${ms},"${msg.replace(/"/g, "'")}"`);
    console.error(msg);
    return false;
  }
}

async function baseline(): Promise<void> {
  const tables = [
    ...new Set([...WAVE1, ...WAVE2, ...WAVE3, ...WAVE4].flatMap((j) => j.tables)),
  ];
  const lines = ['table,count'];
  for (const t of tables) {
    try {
      const c = await countTables([t]);
      lines.push(`${t},${c}`);
    } catch {
      lines.push(`${t},MISSING`);
    }
  }
  writeFileSync(join(__dirname, '../tmp/import-baseline-counts.csv'), lines.join('\n') + '\n');
  console.log('wrote tmp/import-baseline-counts.csv');
}

async function main(): Promise<void> {
  const waveArg = process.argv.find((a) => a.startsWith('--wave='))?.slice('--wave='.length) ?? '1';
  await baseline();

  let jobs: Job[] = [];
  let mode: 'verify' | 'restore' = 'verify';
  if (waveArg === '1') jobs = WAVE1;
  else if (waveArg === '2') jobs = WAVE2;
  else if (waveArg === '3') jobs = WAVE3;
  else if (waveArg === '4') jobs = WAVE4;
  else if (waveArg === 'restore') {
    jobs = RESTORE;
    mode = 'restore';
  } else if (waveArg === 'all') jobs = [...WAVE1, ...WAVE2, ...WAVE3, ...WAVE4];
  else {
    console.error('Unknown wave', waveArg);
    process.exit(1);
  }

  let failed = 0;
  const fails: string[] = [];
  for (const job of jobs) {
    const ok = await runJob(job, mode);
    if (!ok) {
      failed++;
      fails.push(job.command);
      // Continue through wave so we collect all failures (plan said stop on unexpected — continue logging)
    }
  }

  const summary = [
    `# Import verify summary (wave=${waveArg})`,
    '',
    `- Jobs: ${jobs.length}`,
    `- Failed: ${failed}`,
    fails.length ? `- Failures:\n${fails.map((f) => `  - ${f}`).join('\n')}` : '- Failures: none',
    '',
    `Results: ${RESULTS}`,
  ].join('\n');
  writeFileSync(SUMMARY, summary + '\n');
  console.log(summary);

  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
