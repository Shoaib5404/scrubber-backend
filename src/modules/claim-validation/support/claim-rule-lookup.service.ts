import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { lookupLogicalName } from '../../cache/cache.constants';
import { LookupCacheService } from '../../cache/lookup-cache.service';
import { NcciRulesCacheService } from '../../cache/ncci-rules-cache.service';
import { MedicaidMemberIdFormatRepository } from '../../reference-admin/medicaid/medicaid-member-id-format.repository';
import {
  CptCoreRuleRow,
  CptModifierRuleRow,
  CptPosRuleRow,
  UhcAuthorizationParsedRule,
} from '../rules/cpt.rules';
import { AgeSpecificCptRuleRow, GenderSpecificCptRuleRow } from './cpt-age-gender.validation';
import { MuePractitionerLookupRow } from '../rules/mue-practitioner.rules';
import { NcciPairLookupRow } from '../rules/ncci.rules';
import {
  IcdDiagnosisLookups,
  IcdTabularNotesByCode,
  ICD_DESC_ADDITIONAL_CODE,
  ICD_DESC_CODE_FIRST,
  ICD_DESC_EXCLUDE1,
  ICD_DESC_EXCLUDE2,
} from '../rules/icd-diagnosis.rules';
import {
  EmBundlingCrossClaimRelatedLine,
  BRIEF_CHECKIN_RELATED_EM,
} from '../rules/em-bundling.rules';
import {
  ZipCodeLookupRow,
} from '../rules/payer-edi-zip-city.rules';
import {
  buildNdcCrosswalkContext,
  emptyNdcCrosswalkContext,
  NdcCrosswalkContext,
} from './ndc-crosswalk.context';
import { toUhcAuthorizationParsedRule } from './uhc-prior-auth.parse';
import {
  assembleNotesByNormalizedCode,
  ICD_NOTE_DESCRIPTION_TYPES,
  icdLookupCandidates,
  normalizeIcdCode,
} from './icd-tabular-notes';
import { digitsOnly, zip5FromDigits } from './payer-edi.helpers';

/** Loads claim-rule reference rows (Postgres + Nest lookup Redis cache-aside). */
@Injectable()
export class ClaimRuleLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupCache: LookupCacheService,
    private readonly ncciCache: NcciRulesCacheService,
    private readonly medicaidFormats: MedicaidMemberIdFormatRepository,
  ) {}

  uniqueCodes(codes: Array<string | null | undefined>): string[] {
    const set = new Set<string>();
    for (const c of codes) {
      const n = String(c ?? '')
        .trim()
        .toUpperCase();
      if (n) set.add(n);
    }
    return [...set];
  }

  /** Cache-aside helper: `lookup:v1:{table}:{profile}:{disc}`. */
  private cached<T>(
    table: string,
    profile: string,
    discriminator: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    return this.lookupCache.getOrLoad(lookupLogicalName(table, profile, discriminator), loader);
  }

  async cptRuleRowsByCode(codes: string[]): Promise<Record<string, CptCoreRuleRow>> {
    if (codes.length === 0) return {};
    const disc = this.lookupCache.hashCodes(codes);
    return this.cached('cpt_codes', 'by_code', disc, async () => {
      const cpts = await this.prisma.cptCode.findMany({
        where: { name: { in: codes }, isActive: true },
        select: { name: true },
      });
      const age = await this.prisma.ageSpecificCptRule.findMany({
        where: { cptCode: { in: codes }, isActive: true },
      });
      const gender = await this.prisma.genderSpecificCptRule.findMany({
        where: { cptCode: { in: codes }, isActive: true },
      });
      const ageBy = Object.fromEntries(age.map((r) => [r.cptCode.toUpperCase(), r]));
      const genderBy = Object.fromEntries(gender.map((r) => [r.cptCode.toUpperCase(), r]));
      const out: Record<string, CptCoreRuleRow> = {};
      for (const row of cpts) {
        const code = row.name.toUpperCase();
        const a = ageBy[code];
        const g = genderBy[code];
        out[code] = {
          cpt_code: code,
          age_rule_id: a?.id ?? null,
          low_limit: a?.lowLimit ?? null,
          high_limit: a?.highLimit ?? null,
          unit: a?.unit ?? null,
          age_gender: a?.gender ?? null,
          gender_rule_id: g?.id ?? null,
          required_gender: g?.gender ?? null,
        };
      }
      return out;
    });
  }

  async ageRulesByCode(codes: string[]): Promise<Record<string, AgeSpecificCptRuleRow>> {
    if (codes.length === 0) return {};
    return this.cached('age_specific_cpt_rules', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.ageSpecificCptRule.findMany({
        where: { cptCode: { in: codes }, isActive: true },
      });
      return Object.fromEntries(
        rows.map((r) => [
          r.cptCode.toUpperCase(),
          {
            id: r.id,
            cpt_code: r.cptCode,
            low_limit: r.lowLimit,
            high_limit: r.highLimit,
            unit: r.unit,
            gender: r.gender,
          },
        ]),
      );
    });
  }

  async genderRulesByCode(codes: string[]): Promise<Record<string, GenderSpecificCptRuleRow>> {
    if (codes.length === 0) return {};
    return this.cached(
      'gender_specific_cpt_rules',
      'by_code',
      this.lookupCache.hashCodes(codes),
      async () => {
        const rows = await this.prisma.genderSpecificCptRule.findMany({
          where: { cptCode: { in: codes }, isActive: true },
        });
        return Object.fromEntries(
          rows.map((r) => [
            r.cptCode.toUpperCase(),
            { id: r.id, cpt_code: r.cptCode, gender: r.gender },
          ]),
        );
      },
    );
  }

  async activeTaxonomyCodes(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    return this.cached('taxonomy_codes', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.taxonomyCode.findMany({
        where: { taxonomyCode: { in: codes }, isActive: true },
        select: { taxonomyCode: true },
      });
      return Object.fromEntries(rows.map((r) => [r.taxonomyCode.toUpperCase(), true as const]));
    });
  }

  async iCodeSet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    return this.cached('i_codes', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.iCode.findMany({
        where: { hcpcs: { in: codes }, active: true },
        select: { hcpcs: true },
      });
      return Object.fromEntries(rows.map((r) => [r.hcpcs.toUpperCase(), true as const]));
    });
  }

  async zeroAmountProcedureSet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    return this.cached(
      'zero_amount_procedures',
      'by_code',
      this.lookupCache.hashCodes(codes),
      async () => {
        const rows = await this.prisma.zeroAmountProcedure.findMany({
          where: { procedureCode: { in: codes }, isActive: true },
          select: { procedureCode: true },
        });
        return Object.fromEntries(
          rows.map((r) => [r.procedureCode.toUpperCase(), true as const]),
        );
      },
    );
  }

  async noOfUnitsCptSet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    return this.cached('no_of_units_cpts', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.noOfUnitsCpt.findMany({
        where: { cpt: { in: codes }, isActive: true },
        select: { cpt: true },
      });
      return Object.fromEntries(rows.map((r) => [r.cpt.toUpperCase(), true as const]));
    });
  }

  async npiOrderingReferringByNpi(
    npis: string[],
  ): Promise<Record<string, { last_name: string | null }>> {
    if (npis.length === 0) return {};
    const unique = this.uniqueCodes(npis);
    const out: Record<string, { last_name: string | null }> = {};
    const missing: string[] = [];

    for (const npi of unique) {
      const logical = lookupLogicalName('npi_ordering_referrings', 'by_npi', npi);
      const hit = await this.lookupCache.peek<{ last_name: string | null }>(logical);
      if (hit != null) {
        out[npi] = hit;
      } else {
        missing.push(npi);
      }
    }

    if (missing.length === 0) return out;

    const rows = await this.prisma.npiOrderingReferring.findMany({
      where: { npi: { in: missing }, active: true },
    });
    const found = new Set<string>();
    for (const r of rows) {
      found.add(r.npi);
      const payload = { last_name: r.lastName };
      out[r.npi] = payload;
      await this.lookupCache.getOrLoad(
        lookupLogicalName('npi_ordering_referrings', 'by_npi', r.npi),
        async () => payload,
      );
    }
    return out;
  }

  async mueUhcOxfordByCode(codes: string[]): Promise<Record<string, { min: number; max: number }>> {
    if (codes.length === 0) return {};
    return this.cached(
      'mue_87726_uhc_06111_oxford',
      'by_code',
      this.lookupCache.hashCodes(codes),
      async () => {
        const rows = await this.prisma.mue87726Uhc06111Oxford.findMany({
          where: { cptCode: { in: codes }, isActive: true },
        });
        return Object.fromEntries(
          rows.map((r) => [r.cptCode.toUpperCase(), { min: r.min, max: r.max }]),
        );
      },
    );
  }

  async mueUhcOxfordCodeSet(codes: string[]): Promise<Record<string, true>> {
    const map = await this.mueUhcOxfordByCode(codes);
    return Object.fromEntries(Object.keys(map).map((k) => [k, true as const]));
  }

  async muePractitionerByCode(codes: string[]): Promise<Record<string, MuePractitionerLookupRow>> {
    if (codes.length === 0) return {};
    return this.cached('mue_practitioners', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.muePractitioner.findMany({
        where: { cptCode: { in: codes } },
      });
      return Object.fromEntries(
        rows.map((r) => [
          r.cptCode.toUpperCase(),
          { upperLimit: r.upperLimit, indicator: r.indicator },
        ]),
      );
    });
  }

  async radiologyCptSet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    return this.cached('radiology_cpt_codes', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.radiologyCptCode.findMany({
        where: { cpt: { in: codes }, isActive: true },
        select: { cpt: true },
      });
      return Object.fromEntries(
        rows.map((r) => {
          const code = r.cpt.trim().toUpperCase();
          const padded = /^\d+$/.test(code) ? code.padStart(5, '0') : code;
          return [padded, true as const];
        }),
      );
    });
  }

  async modifierSequences(): Promise<Array<{ id: number; modifier: string }>> {
    return this.cached('modifier_sequences', 'set', 'active', () =>
      this.prisma.modifierSequence.findMany({
        where: { isActive: true },
        select: { id: true, modifier: true },
        orderBy: { id: 'asc' },
      }),
    );
  }

  async primariesByAddon(codes: string[]): Promise<Record<string, string[]>> {
    if (codes.length === 0) return {};
    return this.cached('add_on_codes', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.addOnCode.findMany({
        where: { addOnCode: { in: codes } },
        select: { addOnCode: true, primaryCode: true },
      });
      const out: Record<string, string[]> = {};
      for (const row of rows) {
        const addon = String(row.addOnCode ?? '')
          .trim()
          .toUpperCase();
        if (!addon) continue;
        (out[addon] ??= []).push(row.primaryCode.toUpperCase());
      }
      return out;
    });
  }

  async cptPosRules(codes: string[]): Promise<CptPosRuleRow[]> {
    if (codes.length === 0) return [];
    return this.cached('cpt_pos_rules', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.cptPosRule.findMany({
        where: { cptCode: { in: codes }, isDeleted: false },
      });
      return rows.map((r) => ({
        id: r.id,
        cpt_code: r.cptCode,
        payer_id: r.payerId,
        pos_code: r.posCode,
      }));
    });
  }

  async cptModifierRules(codes: string[]): Promise<CptModifierRuleRow[]> {
    if (codes.length === 0) return [];
    return this.cached('cpt_modifier_rules', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.cptModifierRule.findMany({
        where: { cptCode: { in: codes }, isActive: true },
      });
      return rows.map((r) => ({
        id: r.id,
        cpt_code: r.cptCode,
        modifier_code: r.modifierCode,
        is_allowed: r.isAllowed,
      }));
    });
  }

  async uhcPosByCpt(codes: string[]): Promise<Record<string, string[]>> {
    if (codes.length === 0) return {};
    return this.cached('uhc_pos_crosswalk', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.uhcPosCrosswalk.findMany({
        where: { cptCode: { in: codes }, isActive: true },
      });
      const out: Record<string, string[]> = {};
      for (const r of rows) {
        const cpt = r.cptCode.toUpperCase();
        (out[cpt] ??= []).push(String(r.posCode).trim().padStart(2, '0'));
      }
      return out;
    });
  }

  /**
   * Active uhc_authorizations by CPT (cache-aside by code hash).
   */
  async uhcPriorAuthRulesByCpt(
    codes: string[],
  ): Promise<Record<string, UhcAuthorizationParsedRule[]>> {
    if (codes.length === 0) return {};
    return this.cached('uhc_authorizations', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.uhcAuthorization.findMany({
        where: { cptCode: { in: codes }, isActive: true },
        orderBy: { id: 'asc' },
      });
      const out: Record<string, UhcAuthorizationParsedRule[]> = {};
      for (const row of rows) {
        const cpt = row.cptCode.trim().toUpperCase();
        if (cpt === '') continue;
        (out[cpt] ??= []).push(
          toUhcAuthorizationParsedRule({
            id: row.id,
            condition: row.condition,
            conditionValues: row.conditionValues,
          }),
        );
      }
      return out;
    });
  }

  async ndcContext(hcpcsCodes: string[]): Promise<NdcCrosswalkContext> {
    if (hcpcsCodes.length === 0) return emptyNdcCrosswalkContext();
    return this.cached(
      'ndc_hcpcs_crosswalk',
      'by_code',
      this.lookupCache.hashCodes(hcpcsCodes),
      async () => {
        const rows = await this.prisma.ndcHcpcsCrosswalk.findMany({
          where: { hcpcs: { in: hcpcsCodes }, isActive: true },
          select: { hcpcs: true, ndc: true },
        });
        return buildNdcCrosswalkContext(rows);
      },
    );
  }

  async icdBodySides(codes: string[]): Promise<Record<string, string>> {
    if (codes.length === 0) return {};
    const normalized = codes.map((c) => c.replace(/\./g, '').toUpperCase());
    return this.cached(
      'icd10_body_sidewise',
      'by_code',
      this.lookupCache.hashCodes(normalized),
      async () => {
        const rows = await this.prisma.icd10BodySidewise.findMany({
          where: { code: { in: normalized } },
        });
        return Object.fromEntries(
          rows.map((r) => [r.code.replace(/\./g, '').toUpperCase(), String(r.side ?? '')]),
        );
      },
    );
  }

  async enmProcedureSet(): Promise<Record<string, true>> {
    return this.cached('enm_procedures', 'set', 'active', async () => {
      const rows = await this.prisma.enmProcedure.findMany({
        where: { isActive: true },
        select: { cptCode: true },
      });
      return Object.fromEntries(rows.map((r) => [r.cptCode.toUpperCase(), true as const]));
    });
  }

  async enmSurgerySet(): Promise<Record<string, true>> {
    return this.cached('enm_surgery_codes', 'set', 'active', async () => {
      const rows = await this.prisma.enmSurgeryCode.findMany({
        where: { isActive: true },
        select: { cptCode: true },
      });
      return Object.fromEntries(rows.map((r) => [r.cptCode.toUpperCase(), true as const]));
    });
  }

  async majorSurgerySet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    return this.cached('major_surgery_codes', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.majorSurgeryCode.findMany({
        where: { code: { in: codes }, active: true },
        select: { code: true },
      });
      return Object.fromEntries(rows.map((r) => [r.code.toUpperCase(), true as const]));
    });
  }

  async globalDaysSurgerySet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    return this.cached(
      'global_days_surgeries',
      'by_code',
      this.lookupCache.hashCodes(codes),
      async () => {
        const rows = await this.prisma.globalDaysSurgery.findMany({
          where: { cptCode: { in: codes }, isActive: true },
          select: { cptCode: true },
        });
        return Object.fromEntries(rows.map((r) => [r.cptCode.toUpperCase(), true as const]));
      },
    );
  }

  async anesthesiaLookups(codes: string[]): Promise<{
    minUnitsByCode: Record<string, number>;
    allowedModifierKeys: Record<string, true>;
    codesWithBillableModifierRules: Record<string, true>;
  }> {
    if (codes.length === 0) {
      return { minUnitsByCode: {}, allowedModifierKeys: {}, codesWithBillableModifierRules: {} };
    }
    return this.cached('anesthesia_codes', 'lookups', this.lookupCache.hashCodes(codes), async () => {
      const mins = await this.prisma.anesthesiaCode.findMany({
        where: { cptCode: { in: codes }, active: true },
      });
      const billable = await this.prisma.anesthesiaCodeWithBillableModifier.findMany({
        where: { code: { in: codes }, active: true },
      });
      const minUnitsByCode = Object.fromEntries(
        mins.map((r) => [r.cptCode.toUpperCase(), Number(r.unit ?? 0)]),
      );
      const allowedModifierKeys: Record<string, true> = {};
      const codesWithBillableModifierRules: Record<string, true> = {};
      for (const r of billable) {
        const code = r.code.toUpperCase();
        codesWithBillableModifierRules[code] = true;
        allowedModifierKeys[`${code}|${String(r.modifier).trim().toUpperCase()}`] = true;
      }
      return { minUnitsByCode, allowedModifierKeys, codesWithBillableModifierRules };
    });
  }

  async ncciPairsByColumnKey(codes: string[]): Promise<Record<string, NcciPairLookupRow[]>> {
    return this.ncciCache.pairsByColumnKey(codes);
  }

  async aetnaFetalCpts(): Promise<string[]> {
    return this.cached('aetna_fetal_lcd', 'set', 'distinct_cpts', async () => {
      const rows = await this.prisma.aetnaFetalLcd.findMany({
        where: { isActive: true },
        distinct: ['cpt'],
        select: { cpt: true },
      });
      return rows.map((r) => r.cpt.toUpperCase());
    });
  }

  async aetnaLcdMaps(
    fetalCpts: string[],
    b12Cpts: string[],
  ): Promise<{
    fetal: Record<string, Record<string, true>>;
    b12: Record<string, Record<string, true>>;
  }> {
    const fetal =
      fetalCpts.length === 0
        ? {}
        : await this.cached(
            'aetna_fetal_lcd',
            'by_code',
            this.lookupCache.hashCodes(fetalCpts),
            async () => {
              const fetalRows = await this.prisma.aetnaFetalLcd.findMany({
                where: { cpt: { in: fetalCpts }, isActive: true },
              });
              const out: Record<string, Record<string, true>> = {};
              for (const r of fetalRows) {
                const cpt = r.cpt.toUpperCase();
                (out[cpt] ??= {})[r.icd.replace(/\./g, '').toUpperCase()] = true;
              }
              return out;
            },
          );
    const b12 =
      b12Cpts.length === 0
        ? {}
        : await this.cached(
            'aetna_b12_lcd',
            'by_code',
            this.lookupCache.hashCodes(b12Cpts),
            async () => {
              const b12Rows = await this.prisma.aetnaB12Lcd.findMany({
                where: { cpt: { in: b12Cpts }, isActive: true },
              });
              const out: Record<string, Record<string, true>> = {};
              for (const r of b12Rows) {
                const cpt = r.cpt.toUpperCase();
                (out[cpt] ??= {})[r.icd.replace(/\./g, '').toUpperCase()] = true;
              }
              return out;
            },
          );
    return { fetal, b12 };
  }

  async cignaIcdMaps(codes: string[]): Promise<Record<string, Record<string, true>>> {
    if (codes.length === 0) return {};
    return this.cached(
      'cigna_cpt_icd_crosswalk',
      'by_code',
      this.lookupCache.hashCodes(codes),
      async () => {
        const rows = await this.prisma.cignaCptIcdCrosswalk.findMany({
          where: { cptCode: { in: codes }, isActive: true },
        });
        const out: Record<string, Record<string, true>> = {};
        for (const r of rows) {
          const cpt = r.cptCode.toUpperCase();
          (out[cpt] ??= {})[r.icdCode.replace(/\./g, '').toUpperCase()] = true;
        }
        return out;
      },
    );
  }

  async icdDiagnosisLookups(
    diagnosisCodes: string[],
    claimType: number,
  ): Promise<IcdDiagnosisLookups> {
    const candidates = icdLookupCandidates(diagnosisCodes);
    const norms = [
      ...new Set(diagnosisCodes.map((c) => normalizeIcdCode(c)).filter(Boolean)),
    ];
    if (norms.length === 0) {
      return {
        billableNormalizedCodes: {},
        notesByNormalizedCode: {},
        tobaccoCounselingApprovedIcd: {},
        unacceptablePrincipalByClaimType: {},
        icdGenderRulesByNorm: {},
        icdAgeRulesByNorm: {},
      };
    }

    const disc = `${this.lookupCache.hashCodes(norms)}:ct${claimType}`;
    return this.cached('icd10_tabular_codes', 'diagnosis_lookups', disc, async () => {
      const tabular = await this.prisma.icd10TabularCode.findMany({
        where: { code: { in: candidates } },
        select: { id: true, code: true, isBillable: true },
      });
      const billableNormalizedCodes = Object.fromEntries(
        tabular
          .filter((r) => r.isBillable)
          .map((r) => [normalizeIcdCode(r.code), true as const]),
      );

      const notesByNormalizedCode = await this.loadNotesByDiagnosisCode(tabular);

      const tobacco = await this.prisma.tobaccoCounselingIcdRule.findMany({
        where: { icdCode: { in: candidates }, indicator: true, isActive: true },
      });
      const tobaccoCounselingApprovedIcd = Object.fromEntries(
        tobacco.map((r) => [normalizeIcdCode(r.icdCode), true as const]),
      );

      const unacceptable = await this.prisma.icd10UnacceptablePrincipalDiagnoseCode.findMany({
        where: { claimType, active: true },
        select: { code: true },
      });
      const unacceptablePrincipalByClaimType: Record<string, Record<string, true>> = {
        [String(claimType)]: Object.fromEntries(
          unacceptable.map((r) => [normalizeIcdCode(r.code), true as const]),
        ),
      };

      const gender = await this.prisma.icdGenderSpecificRule.findMany({
        where: { icdCode: { in: candidates }, isActive: true },
      });
      const icdGenderRulesByNorm = Object.fromEntries(
        gender.map((r) => [
          normalizeIcdCode(r.icdCode),
          { id: r.id, icd_code: r.icdCode, gender: r.gender },
        ]),
      );

      const age = await this.prisma.ageSpecificIcdRule.findMany({
        where: { icdCode: { in: candidates }, isActive: true },
      });
      const icdAgeRulesByNorm = Object.fromEntries(
        age.map((r) => [
          normalizeIcdCode(r.icdCode),
          {
            id: r.id,
            icd_code: r.icdCode,
            low_limit: r.lowLimit,
            upper_limit: r.upperLimit,
            unit: r.unit,
          },
        ]),
      );

      return {
        billableNormalizedCodes,
        notesByNormalizedCode,
        tobaccoCounselingApprovedIcd,
        unacceptablePrincipalByClaimType,
        icdGenderRulesByNorm,
        icdAgeRulesByNorm,
      };
    });
  }

  /**
   * Laravel EmBundlingRules::validateBriefCheckInAcrossClaims DB preload —
   * related E&M lines on other claims for the same member within the 7-day / next-day window.
   */
  async briefCheckInRelatedOnOtherClaims(params: {
    claimId: number;
    subscriberMemberId: string | null | undefined;
    checkInServiceDates: Array<string | Date | null | undefined>;
  }): Promise<EmBundlingCrossClaimRelatedLine[]> {
    const memberId = String(params.subscriberMemberId ?? '').trim();
    if (!memberId || params.checkInServiceDates.length === 0) return [];

    let minDos: string | null = null;
    let maxDos: string | null = null;
    for (const raw of params.checkInServiceDates) {
      const ymd = toYmd(raw);
      if (!ymd) continue;
      const start = addDaysYmd(ymd, -7);
      const end = addDaysYmd(ymd, 1);
      if (!start || !end) continue;
      if (minDos === null || start < minDos) minDos = start;
      if (maxDos === null || end > maxDos) maxDos = end;
    }
    if (!minDos || !maxDos) return [];

    const rows = await this.prisma.serviceLine.findMany({
      where: {
        procedureCode: { in: [...BRIEF_CHECKIN_RELATED_EM] },
        serviceDateFrom: {
          gte: new Date(`${minDos}T00:00:00.000Z`),
          lte: new Date(`${maxDos}T00:00:00.000Z`),
        },
        claim: {
          subscriberMemberId: memberId,
          id: { not: params.claimId },
        },
      },
      select: {
        procedureCode: true,
        serviceDateFrom: true,
      },
    });

    return rows
      .filter((r) => r.serviceDateFrom != null)
      .map((r) => ({
        procedureCode: r.procedureCode,
        serviceDateFrom: r.serviceDateFrom as Date,
      }));
  }

  /**
   * Load instructional notes for diagnosis codes, including ancestor tabular rows
   * (Laravel IcdDiagnosisRules::loadNotesByDiagnosisCode).
   */
  private async loadNotesByDiagnosisCode(
    codeRows: Array<{ id: number; code: string; isBillable: boolean }>,
  ): Promise<IcdDiagnosisLookups['notesByNormalizedCode']> {
    if (codeRows.length === 0) return {};

    const leafIds = [...new Set(codeRows.map((r) => r.id))];
    const ancestorIdsByLeafId = await this.ancestorIdsByLeafId(leafIds);

    const holderIds = new Set<number>();
    for (const ids of ancestorIdsByLeafId.values()) {
      for (const id of ids) holderIds.add(id);
    }
    if (holderIds.size === 0) return {};

    const noteRows = await this.prisma.icd10TabularCodeDescription.findMany({
      where: {
        icd10TabularCodeId: { in: [...holderIds] },
        descriptionType: { in: [...ICD_NOTE_DESCRIPTION_TYPES] },
      },
      orderBy: { id: 'asc' },
      select: {
        icd10TabularCodeId: true,
        descriptionType: true,
        description: true,
      },
    });

    return assembleNotesByNormalizedCode(codeRows, ancestorIdsByLeafId, noteRows);
  }

  /** Recursive CTE ancestor walk (Laravel ancestorIdsByLeafId); iterative fallback. */
  private async ancestorIdsByLeafId(leafIds: number[]): Promise<Map<number, number[]>> {
    const unique = [...new Set(leafIds.filter((id) => id > 0))];
    const out = new Map<number, number[]>();
    for (const id of unique) out.set(id, [id]);
    if (unique.length === 0) return out;

    try {
      const rows = await this.prisma.$queryRaw<Array<{ leaf_id: number; holder_id: number }>>`
        WITH RECURSIVE ancestors (leaf_id, id, parent_id, depth) AS (
          SELECT id AS leaf_id, id, parent_id, 0 AS depth
          FROM icd10_tabular_codes
          WHERE id IN (${Prisma.join(unique)})

          UNION ALL

          SELECT ancestors.leaf_id, parent.id, parent.parent_id, ancestors.depth + 1
          FROM icd10_tabular_codes AS parent
          INNER JOIN ancestors ON parent.id = ancestors.parent_id
          WHERE ancestors.depth < 120
        )
        SELECT leaf_id, id AS holder_id
        FROM ancestors
        ORDER BY leaf_id, depth
      `;

      const collected = new Map<number, number[]>();
      for (const row of rows) {
        const leafId = Number(row.leaf_id);
        const holderId = Number(row.holder_id);
        const list = collected.get(leafId) ?? [];
        if (!list.includes(holderId)) list.push(holderId);
        collected.set(leafId, list);
      }
      for (const id of unique) {
        out.set(id, collected.get(id) ?? [id]);
      }
      return out;
    } catch {
      return this.ancestorIdsByLeafIdIterative(unique);
    }
  }

  private async ancestorIdsByLeafIdIterative(leafIds: number[]): Promise<Map<number, number[]>> {
    const out = new Map<number, number[]>();
    const parentById = new Map<number, number | null>();
    let frontier = [...leafIds];
    const seen = new Set<number>(frontier);

    while (frontier.length > 0) {
      const rows = await this.prisma.icd10TabularCode.findMany({
        where: { id: { in: frontier } },
        select: { id: true, parentId: true },
      });
      const next: number[] = [];
      for (const row of rows) {
        parentById.set(row.id, row.parentId);
        if (row.parentId != null && !seen.has(row.parentId)) {
          seen.add(row.parentId);
          next.push(row.parentId);
        }
      }
      frontier = next;
    }

    for (const leafId of leafIds) {
      const chain: number[] = [];
      let cur: number | null | undefined = leafId;
      let depth = 0;
      while (cur != null && depth < 120) {
        chain.push(cur);
        cur = parentById.has(cur) ? parentById.get(cur) ?? null : null;
        depth += 1;
      }
      out.set(leafId, chain);
    }
    return out;
  }

  async ncdDeniedByCpt(codes: string[]): Promise<Record<string, Record<string, true>>> {
    if (codes.length === 0) return {};
    return this.cached('ncd_denied_icd_pairs', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const ncdCpts = await this.prisma.ncdCpt.findMany({
        where: { cptCode: { in: codes } },
        include: { ncdIcds: true },
      });
      const out: Record<string, Record<string, true>> = {};
      for (const row of ncdCpts) {
        const cpt = row.cptCode.toUpperCase();
        for (const icd of row.ncdIcds) {
          if (icd.resolutionCode !== 2) continue;
          (out[cpt] ??= {})[icd.icdCode.replace(/\./g, '').toUpperCase()] = true;
        }
      }
      return out;
    });
  }

  /**
   * Laravel LookupCacheService::getGroupRows('zip_codes', zip5) for claim ZIP entities.
   * Accepts raw ZIP / address digit strings; groups by ZIP-5.
   */
  async zipCodeRowsByZip5(
    zipValues: Array<string | null | undefined>,
  ): Promise<Record<string, ZipCodeLookupRow[]>> {
    const zip5Keys = new Set<string>();
    for (const raw of zipValues) {
      const z5 = zip5FromDigits(digitsOnly(String(raw ?? '')));
      if (z5 != null) zip5Keys.add(z5);
    }
    if (zip5Keys.size === 0) return {};

    const keys = [...zip5Keys];
    return this.cached('zip_codes', 'by_zip5', this.lookupCache.hashCodes(keys), async () => {
      const rows = await this.prisma.zipCode.findMany({
        where: { zipCode: { in: keys } },
        select: { zipCode: true, city: true, state: true, zipCodeType: true },
      });

      const out: Record<string, ZipCodeLookupRow[]> = {};
      for (const row of rows) {
        const z5 = String(row.zipCode ?? '').trim();
        if (z5 === '') continue;
        (out[z5] ??= []).push({
          city: String(row.city ?? ''),
          state: String(row.state ?? ''),
          zip_code_type: String(row.zipCodeType ?? ''),
        });
      }
      return out;
    });
  }

  /** Laravel MedicaidMemberIdFormatRepository::hasActiveFormatsForPayerId */
  async medicaidAlMemberIdFormatsActive(payerId: string | null | undefined): Promise<boolean> {
    return this.medicaidFormats.hasActiveFormatsForPayerId(String(payerId ?? ''));
  }

  /** Active consultation_procedures set for claim CPT codes. */
  async consultationProcedureSet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    return this.cached(
      'consultation_procedures',
      'by_code',
      this.lookupCache.hashCodes(codes),
      async () => {
        const rows = await this.prisma.consultationProcedure.findMany({
          where: { cptCode: { in: codes }, isActive: true },
          select: { cptCode: true },
        });
        return Object.fromEntries(rows.map((r) => [r.cptCode.toUpperCase(), true as const]));
      },
    );
  }

  /** vaccine_codes.component_count keyed by vaccine_code. */
  async vaccineComponentCountByCode(codes: string[]): Promise<Record<string, number>> {
    if (codes.length === 0) return {};
    return this.cached('vaccine_codes', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.vaccineCode.findMany({
        where: { vaccineCode: { in: codes }, isActive: true },
        select: { vaccineCode: true, componentCount: true },
      });
      return Object.fromEntries(
        rows.map((r) => [r.vaccineCode.toUpperCase(), Number(r.componentCount ?? 0)]),
      );
    });
  }

  /** mcr_vaccine_codes → vaccine_code => administration_code (with type defaults). */
  async mcrVaccineAdminByVaccineCode(codes: string[]): Promise<Record<string, string>> {
    if (codes.length === 0) return {};
    return this.cached('mcr_vaccine_codes', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.mcrVaccineCode.findMany({
        where: { vaccineCode: { in: codes }, isActive: true },
        select: { vaccineCode: true, administrationCode: true, type: true },
      });
      const map: Record<string, string> = {};
      for (const row of rows) {
        const vaccine = String(row.vaccineCode ?? '')
          .trim()
          .toUpperCase();
        if (vaccine === '') continue;
        let admin = String(row.administrationCode ?? '')
          .trim()
          .toUpperCase();
        if (admin === '') {
          const type = String(row.type ?? '')
            .trim()
            .toLowerCase();
          if (type === 'flu' || type === 'influenza') admin = 'G0008';
          else if (type === 'pneumococcal' || type === 'pneumo') admin = 'G0009';
          else if (type === 'hepatitis' || type === 'hep') admin = 'G0010';
        }
        if (admin === '') continue;
        map[vaccine] = admin;
      }
      return map;
    });
  }

  /** lab_codes HCPCS → modifier set (blank/NaN/null modifiers omitted). */
  async labCodeModifiersByHcpcs(
    codes: string[],
  ): Promise<Record<string, Record<string, true>>> {
    if (codes.length === 0) return {};
    return this.cached('lab_codes', 'by_code', this.lookupCache.hashCodes(codes), async () => {
      const rows = await this.prisma.labCode.findMany({
        where: { hcpcs: { in: codes }, isActive: true },
        select: { hcpcs: true, modifier: true },
      });
      const map: Record<string, Record<string, true>> = {};
      for (const row of rows) {
        const hcpcs = String(row.hcpcs ?? '')
          .trim()
          .toUpperCase();
        if (hcpcs === '') continue;
        map[hcpcs] ??= {};
        const modifier = String(row.modifier ?? '')
          .trim()
          .toUpperCase();
        if (modifier === '' || modifier === 'NAN' || modifier === 'NULL') continue;
        map[hcpcs][modifier] = true;
      }
      return map;
    });
  }
}

function toYmd(from: string | Date | null | undefined): string | null {
  if (from == null) return null;
  if (from instanceof Date) {
    if (Number.isNaN(from.getTime())) return null;
    return formatYmdUtc(from);
  }
  const s = String(from).trim();
  if (s === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatYmdUtc(parsed);
}

function formatYmdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd: string, days: number): string | null {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, mo, d] = parts;
  return formatYmdUtc(new Date(Date.UTC(y, mo - 1, d + days)));
}
