import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { lookupChunkMetaKey, lookupLogicalName, lookupV1Key } from './cache.constants';
import { LookupCacheService } from './lookup-cache.service';
import { LookupWarmService } from './lookup-warm.service';
import { RedisLookupStore } from './redis-lookup.store';

export type VerifyCaseResult = {
  table: string;
  ok: boolean;
  steps: string[];
  error?: string;
};

type DummyFixture = {
  table: string;
  /** Insert 1–2 dummy rows; return marker string(s) expected in warmed Redis JSON. */
  seed: (prisma: PrismaService) => Promise<string[]>;
  /** Delete dummy rows inserted by seed. */
  cleanup: (prisma: PrismaService) => Promise<void>;
};

const MARKER = 'ZZREDIS';
const CODE_A = `${MARKER}1`;
const CODE_B = `${MARKER}2`;

/**
 * Verifies import→Redis path for lookup tables:
 * seed dummy DB rows → sync (invalidate+warm) → assert Redis → flush Redis → delete DB dummies.
 */
@Injectable()
export class LookupImportVerifyService {
  private readonly logger = new Logger(LookupImportVerifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupCache: LookupCacheService,
    private readonly warm: LookupWarmService,
    private readonly store: RedisLookupStore,
  ) {}

  fixtures(): DummyFixture[] {
    return VERIFY_FIXTURES;
  }

  async verifyAll(tables?: string[]): Promise<VerifyCaseResult[]> {
    const selected = tables?.length
      ? VERIFY_FIXTURES.filter((f) => tables.includes(f.table))
      : VERIFY_FIXTURES;
    const results: VerifyCaseResult[] = [];
    for (const fixture of selected) {
      results.push(await this.verifyOne(fixture));
    }
    return results;
  }

  private async verifyOne(fixture: DummyFixture): Promise<VerifyCaseResult> {
    const steps: string[] = [];
    const { table } = fixture;
    try {
      if (!this.lookupCache.isEnabled()) {
        return {
          table,
          ok: false,
          steps,
          error: 'LOOKUP_CACHE_ENABLED=false — enable cache to verify Redis writes',
        };
      }

      steps.push('cleanup any leftover dummies');
      await fixture.cleanup(this.prisma);
      await this.lookupCache.invalidateTable(table);

      steps.push('insert 1–2 dummy DB rows');
      const markers = await fixture.seed(this.prisma);
      if (markers.length < 1) {
        throw new Error('fixture seed returned no markers');
      }

      steps.push('import sync (invalidate + warm) — same as post-import');
      await this.lookupCache.invalidateTable(table);
      const warmResult = await this.warm.warmTable(table);
      if (!warmResult.ok && table !== 'npi_ordering_referrings') {
        throw new Error(`warm failed: ${warmResult.detail}`);
      }

      steps.push('assert Redis contains dummy markers');
      await this.assertRedisHasMarkers(table, markers);

      steps.push('flush Redis table keys');
      await this.lookupCache.invalidateTable(table);
      for (const npi of table === 'npi_ordering_referrings' ? markers : []) {
        await this.lookupCache.invalidate(lookupLogicalName(table, 'by_npi', npi));
      }
      if (await this.isWarm(table, markers)) {
        throw new Error('Redis still warm after flush');
      }

      steps.push('delete dummy DB rows');
      await fixture.cleanup(this.prisma);

      return { table, ok: true, steps };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.logger.error(`${table}: ${error}`);
      try {
        await fixture.cleanup(this.prisma);
        await this.lookupCache.invalidateTable(table);
      } catch {
        /* best-effort cleanup */
      }
      return { table, ok: false, steps, error };
    }
  }

  private async assertRedisHasMarkers(table: string, markers: string[]): Promise<void> {
    if (table === 'npi_ordering_referrings') {
      for (const npi of markers) {
        const logical = lookupLogicalName(table, 'by_npi', npi);
        await this.lookupCache.getOrLoad(logical, async () => {
          const row = await this.prisma.npiOrderingReferring.findUnique({ where: { npi } });
          if (!row) throw new Error(`NPI ${npi} missing in DB`);
          return { last_name: row.lastName };
        });
        const hit = await this.lookupCache.peek(logical);
        if (hit == null) throw new Error(`Redis miss for NPI ${npi}`);
      }
      return;
    }

    const raw = await this.readWarmPayload(table);
    if (raw == null) throw new Error(`no Redis payload for ${table}`);
    for (const marker of markers) {
      if (!raw.includes(marker)) {
        throw new Error(`Redis payload for ${table} missing marker ${marker}`);
      }
    }
  }

  private async readWarmPayload(table: string): Promise<string | null> {
    const prefix = this.store.keyPrefix();
    const logical = lookupLogicalName(table, 'full', 'all');
    const single = await this.store.get(lookupV1Key(prefix, logical));
    if (single != null) return single;

    const metaRaw = await this.store.get(lookupChunkMetaKey(prefix, logical));
    if (metaRaw == null) return null;
    const meta = JSON.parse(metaRaw) as { chunkCount?: number };
    const count = meta.chunkCount ?? 0;
    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await this.store.get(`${lookupV1Key(prefix, logical)}:__chunk:${i}`);
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  }

  private async isWarm(table: string, markers: string[]): Promise<boolean> {
    if (table === 'npi_ordering_referrings') {
      for (const npi of markers) {
        const hit = await this.lookupCache.peek(lookupLogicalName(table, 'by_npi', npi));
        if (hit != null) return true;
      }
      return this.hasAnyKey(`${this.store.keyPrefix()}:v1:${table}:*`);
    }
    const prefix = this.store.keyPrefix();
    const logical = lookupLogicalName(table, 'full', 'all');
    const [single, meta] = await this.store.mget([
      lookupV1Key(prefix, logical),
      lookupChunkMetaKey(prefix, logical),
    ]);
    return single != null || meta != null;
  }

  private async hasAnyKey(pattern: string): Promise<boolean> {
    const client = this.store.raw();
    const [, keys] = await client.scan('0', 'MATCH', pattern, 'COUNT', 50);
    return keys.length > 0;
  }
}

const VERIFY_FIXTURES: DummyFixture[] = [
  {
    table: 'cpt_codes',
    seed: async (prisma) => {
      await prisma.cptCode.createMany({
        data: [
          { name: CODE_A, description: 'redis verify A', isActive: true },
          { name: CODE_B, description: 'redis verify B', isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.cptCode.deleteMany({ where: { name: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'modifiers',
    seed: async (prisma) => {
      await prisma.modifier.createMany({
        data: [
          { modifier: CODE_A.slice(0, 10), shortDescription: 'redis verify A' },
          { modifier: CODE_B.slice(0, 10), shortDescription: 'redis verify B' },
        ],
        skipDuplicates: true,
      });
      return [CODE_A.slice(0, 10), CODE_B.slice(0, 10)];
    },
    cleanup: async (prisma) => {
      await prisma.modifier.deleteMany({
        where: { modifier: { in: [CODE_A.slice(0, 10), CODE_B.slice(0, 10)] } },
      });
    },
  },
  {
    table: 'taxonomy_codes',
    seed: async (prisma) => {
      await prisma.taxonomyCode.createMany({
        data: [
          { taxonomyCode: 'ZZ1111111', specialtyName: 'Redis Verify A', isActive: true },
          { taxonomyCode: 'ZZ2222222', specialtyName: 'Redis Verify B', isActive: true },
        ],
        skipDuplicates: true,
      });
      return ['ZZ1111111', 'ZZ2222222'];
    },
    cleanup: async (prisma) => {
      await prisma.taxonomyCode.deleteMany({
        where: { taxonomyCode: { in: ['ZZ1111111', 'ZZ2222222'] } },
      });
    },
  },
  {
    table: 'enm_procedures',
    seed: async (prisma) => {
      await prisma.enmProcedure.createMany({
        data: [
          { cptCode: CODE_A, description: 'redis verify', isActive: true },
          { cptCode: CODE_B, description: 'redis verify', isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.enmProcedure.deleteMany({ where: { cptCode: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'enm_surgery_codes',
    seed: async (prisma) => {
      await prisma.enmSurgeryCode.createMany({
        data: [
          { cptCode: CODE_A, isActive: true },
          { cptCode: CODE_B, isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.enmSurgeryCode.deleteMany({ where: { cptCode: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'zero_amount_procedures',
    seed: async (prisma) => {
      await prisma.zeroAmountProcedure.createMany({
        data: [
          { procedureCode: CODE_A, isActive: true },
          { procedureCode: CODE_B, isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.zeroAmountProcedure.deleteMany({
        where: { procedureCode: { in: [CODE_A, CODE_B] } },
      });
    },
  },
  {
    table: 'no_of_units_cpts',
    seed: async (prisma) => {
      await prisma.noOfUnitsCpt.createMany({
        data: [
          { cpt: CODE_A, isActive: true },
          { cpt: CODE_B, isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.noOfUnitsCpt.deleteMany({ where: { cpt: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'radiology_cpt_codes',
    seed: async (prisma) => {
      await prisma.radiologyCptCode.createMany({
        data: [
          { cpt: CODE_A, isActive: true },
          { cpt: CODE_B, isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.radiologyCptCode.deleteMany({ where: { cpt: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'major_surgery_codes',
    seed: async (prisma) => {
      await prisma.majorSurgeryCode.createMany({
        data: [
          { code: CODE_A, active: true },
          { code: CODE_B, active: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.majorSurgeryCode.deleteMany({ where: { code: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'initial_treatment_codes',
    seed: async (prisma) => {
      await prisma.initialTreatmentCode.createMany({
        data: [
          { code: CODE_A, active: true },
          { code: CODE_B, active: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.initialTreatmentCode.deleteMany({ where: { code: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'i_codes',
    seed: async (prisma) => {
      await prisma.iCode.createMany({
        data: [
          { hcpcs: CODE_A, description: 'redis verify', active: true },
          { hcpcs: CODE_B, description: 'redis verify', active: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.iCode.deleteMany({ where: { hcpcs: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'vaccine_codes',
    seed: async (prisma) => {
      await prisma.vaccineCode.createMany({
        data: [
          { vaccineCode: CODE_A, description: 'redis verify', componentCount: 1, isActive: true },
          { vaccineCode: CODE_B, description: 'redis verify', componentCount: 2, isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.vaccineCode.deleteMany({ where: { vaccineCode: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'lab_codes',
    seed: async (prisma) => {
      await prisma.labCode.createMany({
        data: [
          { hcpcs: CODE_A, modifier: '', shortDescription: 'redis verify', isActive: true },
          { hcpcs: CODE_B, modifier: '', shortDescription: 'redis verify', isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.labCode.deleteMany({ where: { hcpcs: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'ndc_codes',
    seed: async (prisma) => {
      await prisma.ndcCode.createMany({
        data: [
          {
            ndc: '00000-0001-01',
            ndcDigits: '00000000001',
            packageDescription: 'redis A',
            isActive: true,
          },
          {
            ndc: '00000-0002-02',
            ndcDigits: '00000000002',
            packageDescription: 'redis B',
            isActive: true,
          },
        ],
        skipDuplicates: true,
      });
      return ['00000-0001-01', '00000-0002-02'];
    },
    cleanup: async (prisma) => {
      await prisma.ndcCode.deleteMany({
        where: { ndcDigits: { in: ['00000000001', '00000000002'] } },
      });
    },
  },
  {
    table: 'mue_practitioners',
    seed: async (prisma) => {
      await prisma.muePractitioner.createMany({
        data: [
          { cptCode: CODE_A, upperLimit: '1', indicator: '1' },
          { cptCode: CODE_B, upperLimit: '2', indicator: '1' },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.muePractitioner.deleteMany({ where: { cptCode: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'zip_codes',
    seed: async (prisma) => {
      await prisma.zipCode.createMany({
        data: [
          {
            zipCode: '00001',
            city: 'RedisVerifyA',
            state: 'ZZ',
            zipCodeType: 'S',
            isActive: true,
          },
          {
            zipCode: '00002',
            city: 'RedisVerifyB',
            state: 'ZZ',
            zipCodeType: 'S',
            isActive: true,
          },
        ],
        skipDuplicates: true,
      });
      return ['00001', '00002', 'RedisVerifyA', 'RedisVerifyB'];
    },
    cleanup: async (prisma) => {
      await prisma.zipCode.deleteMany({
        where: { zipCode: { in: ['00001', '00002'] }, state: 'ZZ' },
      });
    },
  },
  {
    table: 'npi_ordering_referrings',
    seed: async (prisma) => {
      await prisma.npiOrderingReferring.createMany({
        data: [
          { npi: '1999999991', firstName: 'Redis', lastName: 'VerifyA', active: true },
          { npi: '1999999992', firstName: 'Redis', lastName: 'VerifyB', active: true },
        ],
        skipDuplicates: true,
      });
      return ['1999999991', '1999999992'];
    },
    cleanup: async (prisma) => {
      await prisma.npiOrderingReferring.deleteMany({
        where: { npi: { in: ['1999999991', '1999999992'] } },
      });
    },
  },
  {
    table: 'anesthesia_codes',
    seed: async (prisma) => {
      await prisma.anesthesiaCode.createMany({
        data: [
          { cptCode: CODE_A, unit: 1, active: true },
          { cptCode: CODE_B, unit: 2, active: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.anesthesiaCode.deleteMany({ where: { cptCode: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'global_days_surgeries',
    seed: async (prisma) => {
      await prisma.globalDaysSurgery.createMany({
        data: [
          { cptCode: CODE_A, days: 90, description: 'redis verify', isActive: true },
          { cptCode: CODE_B, days: 10, description: 'redis verify', isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.globalDaysSurgery.deleteMany({ where: { cptCode: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'age_specific_cpt_rules',
    seed: async (prisma) => {
      await prisma.ageSpecificCptRule.createMany({
        data: [
          { cptCode: CODE_A, lowLimit: 0, highLimit: 120, unit: 'years', gender: 'B', isActive: true },
          { cptCode: CODE_B, lowLimit: 18, highLimit: 65, unit: 'years', gender: 'B', isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.ageSpecificCptRule.deleteMany({ where: { cptCode: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'gender_specific_cpt_rules',
    seed: async (prisma) => {
      await prisma.genderSpecificCptRule.createMany({
        data: [
          { cptCode: CODE_A, gender: 'F', isActive: true },
          { cptCode: CODE_B, gender: 'M', isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.genderSpecificCptRule.deleteMany({ where: { cptCode: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'consultation_procedures',
    seed: async (prisma) => {
      await prisma.consultationProcedure.createMany({
        data: [
          { cptCode: CODE_A, description: 'redis verify', isActive: true },
          { cptCode: CODE_B, description: 'redis verify', isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.consultationProcedure.deleteMany({
        where: { cptCode: { in: [CODE_A, CODE_B] } },
      });
    },
  },
  {
    table: 'modifier_sequences',
    seed: async (prisma) => {
      await prisma.modifierSequence.createMany({
        data: [
          { modifier: 'ZA', modifierGroup: 'redis', sequenceOrder: 900001, isActive: true },
          { modifier: 'ZB', modifierGroup: 'redis', sequenceOrder: 900002, isActive: true },
        ],
        skipDuplicates: true,
      });
      return ['ZA', 'ZB'];
    },
    cleanup: async (prisma) => {
      await prisma.modifierSequence.deleteMany({ where: { modifier: { in: ['ZA', 'ZB'] } } });
    },
  },
  {
    table: 'mue_87726_uhc_06111_oxford',
    seed: async (prisma) => {
      await prisma.mue87726Uhc06111Oxford.createMany({
        data: [
          { cptCode: CODE_A, min: 1, max: 2, isActive: true },
          { cptCode: CODE_B, min: 1, max: 3, isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.mue87726Uhc06111Oxford.deleteMany({
        where: { cptCode: { in: [CODE_A, CODE_B] } },
      });
    },
  },
  {
    table: 'icd10_body_sidewise',
    seed: async (prisma) => {
      await prisma.icd10BodySidewise.createMany({
        data: [
          { code: 'ZZREDISA', side: 'left', longDescription: 'redis verify A' },
          { code: 'ZZREDISB', side: 'right', longDescription: 'redis verify B' },
        ],
        skipDuplicates: true,
      });
      return ['ZZREDISA', 'ZZREDISB'];
    },
    cleanup: async (prisma) => {
      await prisma.icd10BodySidewise.deleteMany({
        where: { code: { in: ['ZZREDISA', 'ZZREDISB'] } },
      });
    },
  },
  {
    table: 'tobacco_counseling_icd_rules',
    seed: async (prisma) => {
      await prisma.tobaccoCounselingIcdRule.createMany({
        data: [
          { icdCode: 'ZZREDISA', description: 'redis', indicator: true, isActive: true },
          { icdCode: 'ZZREDISB', description: 'redis', indicator: true, isActive: true },
        ],
        skipDuplicates: true,
      });
      return ['ZZREDISA', 'ZZREDISB'];
    },
    cleanup: async (prisma) => {
      await prisma.tobaccoCounselingIcdRule.deleteMany({
        where: { icdCode: { in: ['ZZREDISA', 'ZZREDISB'] } },
      });
    },
  },
  {
    table: 'cigna_cpt_icd_crosswalk',
    seed: async (prisma) => {
      await prisma.cignaCptIcdCrosswalk.createMany({
        data: [
          { cptCode: CODE_A, icdCode: 'ZZREDISA', isActive: true },
          { cptCode: CODE_B, icdCode: 'ZZREDISB', isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B, 'ZZREDISA', 'ZZREDISB'];
    },
    cleanup: async (prisma) => {
      await prisma.cignaCptIcdCrosswalk.deleteMany({
        where: { cptCode: { in: [CODE_A, CODE_B] } },
      });
    },
  },
  {
    table: 'aetna_fetal_lcd',
    seed: async (prisma) => {
      await prisma.aetnaFetalLcd.createMany({
        data: [
          { cpt: CODE_A, icd: 'ZZREDISA', description: 'redis', isActive: true },
          { cpt: CODE_B, icd: 'ZZREDISB', description: 'redis', isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.aetnaFetalLcd.deleteMany({ where: { cpt: { in: [CODE_A, CODE_B] } } });
    },
  },
  {
    table: 'uhc_pos_crosswalk',
    seed: async (prisma) => {
      await prisma.uhcPosCrosswalk.createMany({
        data: [
          { cptCode: CODE_A, posCode: '11', isActive: true },
          { cptCode: CODE_B, posCode: '22', isActive: true },
        ],
        skipDuplicates: true,
      });
      return [CODE_A, CODE_B];
    },
    cleanup: async (prisma) => {
      await prisma.uhcPosCrosswalk.deleteMany({ where: { cptCode: { in: [CODE_A, CODE_B] } } });
    },
  },
];
