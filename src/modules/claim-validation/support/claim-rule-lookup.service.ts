import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LookupCacheService } from '../../cache/lookup-cache.service';
import { NcciRulesCacheService } from '../../cache/ncci-rules-cache.service';
import { CptCoreRuleRow, CptModifierRuleRow, CptPosRuleRow } from '../rules/cpt.rules';
import { AgeSpecificCptRuleRow, GenderSpecificCptRuleRow } from './cpt-age-gender.validation';
import { MuePractitionerLookupRow } from '../rules/mue-practitioner.rules';
import { NcciPairLookupRow } from '../rules/ncci.rules';
import { IcdDiagnosisLookups } from '../rules/icd-diagnosis.rules';
import {
  buildNdcCrosswalkContext,
  emptyNdcCrosswalkContext,
  NdcCrosswalkContext,
} from './ndc-crosswalk.context';

/** Loads claim-rule reference rows (Laravel LookupCache + NCCI Redis path). */
@Injectable()
export class ClaimRuleLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupCache: LookupCacheService,
    private readonly ncciCache: NcciRulesCacheService,
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

  async cptRuleRowsByCode(codes: string[]): Promise<Record<string, CptCoreRuleRow>> {
    if (codes.length === 0) return {};
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
  }

  async ageRulesByCode(codes: string[]): Promise<Record<string, AgeSpecificCptRuleRow>> {
    if (codes.length === 0) return {};
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
  }

  async genderRulesByCode(codes: string[]): Promise<Record<string, GenderSpecificCptRuleRow>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.genderSpecificCptRule.findMany({
      where: { cptCode: { in: codes }, isActive: true },
    });
    return Object.fromEntries(
      rows.map((r) => [
        r.cptCode.toUpperCase(),
        { id: r.id, cpt_code: r.cptCode, gender: r.gender },
      ]),
    );
  }

  async activeTaxonomyCodes(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.taxonomyCode.findMany({
      where: { taxonomyCode: { in: codes }, isActive: true },
      select: { taxonomyCode: true },
    });
    return Object.fromEntries(rows.map((r) => [r.taxonomyCode.toUpperCase(), true as const]));
  }

  async iCodeSet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.iCode.findMany({
      where: { hcpcs: { in: codes }, active: true },
      select: { hcpcs: true },
    });
    return Object.fromEntries(rows.map((r) => [r.hcpcs.toUpperCase(), true as const]));
  }

  async zeroAmountProcedureSet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.zeroAmountProcedure.findMany({
      where: { procedureCode: { in: codes }, isActive: true },
      select: { procedureCode: true },
    });
    return Object.fromEntries(rows.map((r) => [r.procedureCode.toUpperCase(), true as const]));
  }

  async noOfUnitsCptSet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.noOfUnitsCpt.findMany({
      where: { cpt: { in: codes }, isActive: true },
      select: { cpt: true },
    });
    return Object.fromEntries(rows.map((r) => [r.cpt.toUpperCase(), true as const]));
  }

  async npiOrderingReferringByNpi(
    npis: string[],
  ): Promise<Record<string, { last_name: string | null }>> {
    if (npis.length === 0) return {};
    const rows = await this.prisma.npiOrderingReferring.findMany({
      where: { npi: { in: npis }, active: true },
    });
    return Object.fromEntries(rows.map((r) => [r.npi, { last_name: r.lastName }]));
  }

  async mueUhcOxfordByCode(codes: string[]): Promise<Record<string, { min: number; max: number }>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.mue87726Uhc06111Oxford.findMany({
      where: { cptCode: { in: codes }, isActive: true },
    });
    return Object.fromEntries(
      rows.map((r) => [r.cptCode.toUpperCase(), { min: r.min, max: r.max }]),
    );
  }

  async mueUhcOxfordCodeSet(codes: string[]): Promise<Record<string, true>> {
    const map = await this.mueUhcOxfordByCode(codes);
    return Object.fromEntries(Object.keys(map).map((k) => [k, true as const]));
  }

  async muePractitionerByCode(codes: string[]): Promise<Record<string, MuePractitionerLookupRow>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.muePractitioner.findMany({
      where: { cptCode: { in: codes } },
    });
    return Object.fromEntries(
      rows.map((r) => [
        r.cptCode.toUpperCase(),
        { upperLimit: r.upperLimit, indicator: r.indicator },
      ]),
    );
  }

  async radiologyCptSet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
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
  }

  async modifierSequences(): Promise<Array<{ id: number; modifier: string }>> {
    return this.lookupCache.getOrLoad('modifier_sequences:active', () =>
      this.prisma.modifierSequence.findMany({
        where: { isActive: true },
        select: { id: true, modifier: true },
        orderBy: { id: 'asc' },
      }),
    );
  }

  async primariesByAddon(codes: string[]): Promise<Record<string, string[]>> {
    if (codes.length === 0) return {};
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
  }

  async cptPosRules(codes: string[]): Promise<CptPosRuleRow[]> {
    if (codes.length === 0) return [];
    const rows = await this.prisma.cptPosRule.findMany({
      where: { cptCode: { in: codes }, isDeleted: false },
    });
    return rows.map((r) => ({
      id: r.id,
      cpt_code: r.cptCode,
      payer_id: r.payerId,
      pos_code: r.posCode,
    }));
  }

  async cptModifierRules(codes: string[]): Promise<CptModifierRuleRow[]> {
    if (codes.length === 0) return [];
    const rows = await this.prisma.cptModifierRule.findMany({
      where: { cptCode: { in: codes }, isActive: true },
    });
    return rows.map((r) => ({
      id: r.id,
      cpt_code: r.cptCode,
      modifier_code: r.modifierCode,
      is_allowed: r.isAllowed,
    }));
  }

  async uhcPosByCpt(codes: string[]): Promise<Record<string, string[]>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.uhcPosCrosswalk.findMany({
      where: { cptCode: { in: codes }, isActive: true },
    });
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      const cpt = r.cptCode.toUpperCase();
      (out[cpt] ??= []).push(String(r.posCode).trim().padStart(2, '0'));
    }
    return out;
  }

  async ndcContext(hcpcsCodes: string[]): Promise<NdcCrosswalkContext> {
    if (hcpcsCodes.length === 0) return emptyNdcCrosswalkContext();
    const rows = await this.prisma.ndcHcpcsCrosswalk.findMany({
      where: { hcpcs: { in: hcpcsCodes }, isActive: true },
      select: { hcpcs: true, ndc: true },
    });
    return buildNdcCrosswalkContext(rows);
  }

  async icdBodySides(codes: string[]): Promise<Record<string, string>> {
    if (codes.length === 0) return {};
    const normalized = codes.map((c) => c.replace(/\./g, '').toUpperCase());
    const rows = await this.prisma.icd10BodySidewise.findMany({
      where: { code: { in: normalized } },
    });
    return Object.fromEntries(
      rows.map((r) => [r.code.replace(/\./g, '').toUpperCase(), String(r.side ?? '')]),
    );
  }

  async enmProcedureSet(): Promise<Record<string, true>> {
    return this.lookupCache.getOrLoad('enm_procedures:active_set', async () => {
      const rows = await this.prisma.enmProcedure.findMany({
        where: { isActive: true },
        select: { cptCode: true },
      });
      return Object.fromEntries(rows.map((r) => [r.cptCode.toUpperCase(), true as const]));
    });
  }

  async enmSurgerySet(): Promise<Record<string, true>> {
    return this.lookupCache.getOrLoad('enm_surgery_codes:active_set', async () => {
      const rows = await this.prisma.enmSurgeryCode.findMany({
        where: { isActive: true },
        select: { cptCode: true },
      });
      return Object.fromEntries(rows.map((r) => [r.cptCode.toUpperCase(), true as const]));
    });
  }

  async majorSurgerySet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.majorSurgeryCode.findMany({
      where: { code: { in: codes }, active: true },
      select: { code: true },
    });
    return Object.fromEntries(rows.map((r) => [r.code.toUpperCase(), true as const]));
  }

  async globalDaysSurgerySet(codes: string[]): Promise<Record<string, true>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.globalDaysSurgery.findMany({
      where: { cptCode: { in: codes }, isActive: true },
      select: { cptCode: true },
    });
    return Object.fromEntries(rows.map((r) => [r.cptCode.toUpperCase(), true as const]));
  }

  async anesthesiaLookups(codes: string[]): Promise<{
    minUnitsByCode: Record<string, number>;
    allowedModifierKeys: Record<string, true>;
    codesWithBillableModifierRules: Record<string, true>;
  }> {
    if (codes.length === 0) {
      return { minUnitsByCode: {}, allowedModifierKeys: {}, codesWithBillableModifierRules: {} };
    }
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
  }

  async ncciPairsByColumnKey(codes: string[]): Promise<Record<string, NcciPairLookupRow[]>> {
    return this.ncciCache.pairsByColumnKey(codes);
  }

  async aetnaFetalCpts(): Promise<string[]> {
    const rows = await this.prisma.aetnaFetalLcd.findMany({
      where: { isActive: true },
      distinct: ['cpt'],
      select: { cpt: true },
    });
    return rows.map((r) => r.cpt.toUpperCase());
  }

  async aetnaLcdMaps(
    fetalCpts: string[],
    b12Cpts: string[],
  ): Promise<{
    fetal: Record<string, Record<string, true>>;
    b12: Record<string, Record<string, true>>;
  }> {
    const fetalRows =
      fetalCpts.length === 0
        ? []
        : await this.prisma.aetnaFetalLcd.findMany({
            where: { cpt: { in: fetalCpts }, isActive: true },
          });
    const b12Rows =
      b12Cpts.length === 0
        ? []
        : await this.prisma.aetnaB12Lcd.findMany({
            where: { cpt: { in: b12Cpts }, isActive: true },
          });
    const fetal: Record<string, Record<string, true>> = {};
    for (const r of fetalRows) {
      const cpt = r.cpt.toUpperCase();
      (fetal[cpt] ??= {})[r.icd.replace(/\./g, '').toUpperCase()] = true;
    }
    const b12: Record<string, Record<string, true>> = {};
    for (const r of b12Rows) {
      const cpt = r.cpt.toUpperCase();
      (b12[cpt] ??= {})[r.icd.replace(/\./g, '').toUpperCase()] = true;
    }
    return { fetal, b12 };
  }

  async cignaIcdMaps(codes: string[]): Promise<Record<string, Record<string, true>>> {
    if (codes.length === 0) return {};
    const rows = await this.prisma.cignaCptIcdCrosswalk.findMany({
      where: { cptCode: { in: codes }, isActive: true },
    });
    const out: Record<string, Record<string, true>> = {};
    for (const r of rows) {
      const cpt = r.cptCode.toUpperCase();
      (out[cpt] ??= {})[r.icdCode.replace(/\./g, '').toUpperCase()] = true;
    }
    return out;
  }

  async icdDiagnosisLookups(
    diagnosisCodes: string[],
    claimType: number,
  ): Promise<IcdDiagnosisLookups> {
    const norms = diagnosisCodes
      .map((c) =>
        String(c ?? '')
          .replace(/\./g, '')
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean);
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

    const tabular = await this.prisma.icd10TabularCode.findMany({
      where: { code: { in: norms }, isBillable: true },
      select: { code: true },
    });
    const billableNormalizedCodes = Object.fromEntries(
      tabular.map((r) => [r.code.replace(/\./g, '').toUpperCase(), true as const]),
    );

    const tobacco = await this.prisma.tobaccoCounselingIcdRule.findMany({
      where: { icdCode: { in: norms }, indicator: true, isActive: true },
    });
    const tobaccoCounselingApprovedIcd = Object.fromEntries(
      tobacco.map((r) => [r.icdCode.replace(/\./g, '').toUpperCase(), true as const]),
    );

    const unacceptable = await this.prisma.icd10UnacceptablePrincipalDiagnoseCode.findMany({
      where: { claimType, active: true },
      select: { code: true },
    });
    const unacceptablePrincipalByClaimType: Record<string, Record<string, true>> = {
      [String(claimType)]: Object.fromEntries(
        unacceptable.map((r) => [r.code.replace(/\./g, '').toUpperCase(), true as const]),
      ),
    };

    const gender = await this.prisma.icdGenderSpecificRule.findMany({
      where: { icdCode: { in: norms }, isActive: true },
    });
    const icdGenderRulesByNorm = Object.fromEntries(
      gender.map((r) => [
        r.icdCode.replace(/\./g, '').toUpperCase(),
        { id: r.id, icd_code: r.icdCode, gender: r.gender },
      ]),
    );

    const age = await this.prisma.ageSpecificIcdRule.findMany({
      where: { icdCode: { in: norms }, isActive: true },
    });
    const icdAgeRulesByNorm = Object.fromEntries(
      age.map((r) => [
        r.icdCode.replace(/\./g, '').toUpperCase(),
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
      notesByNormalizedCode: {},
      tobaccoCounselingApprovedIcd,
      unacceptablePrincipalByClaimType,
      icdGenderRulesByNorm,
      icdAgeRulesByNorm,
    };
  }

  async ncdDeniedByCpt(codes: string[]): Promise<Record<string, Record<string, true>>> {
    if (codes.length === 0) return {};
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
  }
}
