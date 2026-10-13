import { Module } from '@nestjs/common';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { MedicaidMemberIdFormatRepository } from '../reference-admin/medicaid/medicaid-member-id-format.repository';
import { AnesthesiaCodesImportCommand } from './anesthesia-codes.command';
import { AnesthesiaCodesImportService } from './anesthesia-codes.import.service';
import { AnesthesiaCodesWithBillableModifiersImportCommand } from './anesthesia-codes-with-billable-modifiers.command';
import { AnesthesiaCodesWithBillableModifiersImportService } from './anesthesia-codes-with-billable-modifiers.import.service';
import { AnesthesiaModifiersImportCommand } from './anesthesia-modifiers.command';
import { AnesthesiaModifiersImportService } from './anesthesia-modifiers.import.service';
import { GlobalDaysSurgeriesImportCommand } from './global-days-surgeries.command';
import { GlobalDaysSurgeriesImportService } from './global-days-surgeries.import.service';
import { ICodesImportCommand } from './i-codes.command';
import { ICodesImportService } from './i-codes.import.service';
import { InitialTreatmentCodesImportCommand } from './initial-treatment-codes.command';
import { InitialTreatmentCodesImportService } from './initial-treatment-codes.import.service';
import { LookupSyncHelper } from './lookup-sync.helper';
import { MajorSurgeryCodesImportCommand } from './major-surgery-codes.command';
import { MajorSurgeryCodesImportService } from './major-surgery-codes.import.service';
import { NoOfUnitsCptsImportCommand } from './no-of-units-cpts.command';
import { NoOfUnitsCptsImportService } from './no-of-units-cpts.import.service';
import { RadiologyCptCodesImportCommand } from './radiology-cpt-codes.command';
import { RadiologyCptCodesImportService } from './radiology-cpt-codes.import.service';
import { BcbsClaimRoutingsImportCommand } from './bcbs-claim-routings.command';
import { BcbsClaimRoutingsImportService } from './bcbs-claim-routings.import.service';
import { Mue87726Uhc06111OxfordImportCommand } from './mue-87726-uhc-06111-oxford.command';
import { Mue87726Uhc06111OxfordImportService } from './mue-87726-uhc-06111-oxford.import.service';
import { UhcAuthorizationsImportCommand } from './uhc-authorizations.command';
import { UhcAuthorizationsImportService } from './uhc-authorizations.import.service';
import { ZeroAmountProceduresImportCommand } from './zero-amount-procedures.command';
import { ZeroAmountProceduresImportService } from './zero-amount-procedures.import.service';
import { EnmProceduresImportCommand } from './enm-procedures.command';
import { EnmProceduresImportService } from './enm-procedures.import.service';
import { EnmSurgeryCodesImportCommand } from './enm-surgery-codes.command';
import { EnmSurgeryCodesImportService } from './enm-surgery-codes.import.service';
import { ConsultationProceduresImportCommand } from './consultation-procedures.command';
import { ConsultationProceduresImportService } from './consultation-procedures.import.service';
import { LabCodesImportCommand } from './lab-codes.command';
import { LabCodesImportService } from './lab-codes.import.service';
import { VaccineCodesImportCommand } from './vaccine-codes.command';
import { VaccineCodesImportService } from './vaccine-codes.import.service';
import { AgeSpecificCptRulesImportCommand } from './age-specific-cpt-rules.command';
import { AgeSpecificCptRulesImportService } from './age-specific-cpt-rules.import.service';
import { GenderSpecificCptRulesImportCommand } from './gender-specific-cpt-rules.command';
import { GenderSpecificCptRulesImportService } from './gender-specific-cpt-rules.import.service';
import { AgeSpecificIcdRulesImportCommand } from './age-specific-icd-rules.command';
import { AgeSpecificIcdRulesImportService } from './age-specific-icd-rules.import.service';
import { IcdGenderSpecificRulesImportCommand } from './icd-gender-specific-rules.command';
import { IcdGenderSpecificRulesImportService } from './icd-gender-specific-rules.import.service';
import { TobaccoCounselingIcdRulesImportCommand } from './tobacco-counseling-icd-rules.command';
import { TobaccoCounselingIcdRulesImportService } from './tobacco-counseling-icd-rules.import.service';
import { ModifierSequencesImportCommand } from './modifier-sequences.command';
import { ModifierSequencesImportService } from './modifier-sequences.import.service';
import { CptCodesImportCommand } from './cpt-codes.command';
import { CptCodesImportService } from './cpt-codes.import.service';
import { ModifiersImportCommand } from './modifiers.command';
import { ModifiersImportService } from './modifiers.import.service';
import { NdcCodesImportCommand } from './ndc-codes.command';
import { NdcCodesImportService } from './ndc-codes.import.service';
import { NdcHcpcsCrosswalkImportCommand } from './ndc-hcpcs-crosswalk.command';
import { NdcHcpcsCrosswalkImportService } from './ndc-hcpcs-crosswalk.import.service';
import { UhcPosCrosswalkImportCommand } from './uhc-pos-crosswalk.command';
import { UhcPosCrosswalkImportService } from './uhc-pos-crosswalk.import.service';
import { TaxonomyCodesImportCommand } from './taxonomy-codes.command';
import { TaxonomyCodesImportService } from './taxonomy-codes.import.service';
import { Icd10RangeExpander } from './icd10-range.expander';
import { UhcAuthorizationConditionValuesNormalizer } from './uhc-authorization-condition-values.normalizer';
import { CptPosRulesImportCommand } from './cpt-pos-rules.command';
import { CptPosRulesImportService } from './cpt-pos-rules.import.service';
import { CptModifierRulesImportCommand } from './cpt-modifier-rules.command';
import { CptModifierRulesImportService } from './cpt-modifier-rules.import.service';
import { MuePractitionersImportCommand } from './mue-practitioners.command';
import { MuePractitionersImportService } from './mue-practitioners.import.service';
import { ZipCodesImportCommand } from './zip-codes.command';
import { ZipCodesImportService } from './zip-codes.import.service';
import { AetnaB12LcdImportCommand } from './aetna-b12-lcd.command';
import { AetnaB12LcdImportService } from './aetna-b12-lcd.import.service';
import { AetnaFetalLcdImportCommand } from './aetna-fetal-lcd.command';
import { AetnaFetalLcdImportService } from './aetna-fetal-lcd.import.service';
import { CignaCptIcdCrosswalkImportCommand } from './cigna-cpt-icd-crosswalk.command';
import { CignaCptIcdCrosswalkImportService } from './cigna-cpt-icd-crosswalk.import.service';
import { AddOnCodesImportCommand } from './add-on-codes.command';
import { AddOnCodesImportService } from './add-on-codes.import.service';
import { McrVaccineCodesImportCommand } from './mcr-vaccine-codes.command';
import { McrVaccineCodesImportService } from './mcr-vaccine-codes.import.service';
import { MedicaidMemberIdFormatsImportCommand } from './medicaid-member-id-formats.command';
import { MedicaidMemberIdFormatsImportService } from './medicaid-member-id-formats.import.service';
import { Icd10BodySidewiseImportCommand } from './icd10-body-sidewise.command';
import { Icd10BodySidewiseImportService } from './icd10-body-sidewise.import.service';
import { Icd10UnacceptablePrincipalDxCodesImportCommand } from './icd10-unacceptable-principal-dx-codes.command';
import { Icd10UnacceptablePrincipalDxCodesImportService } from './icd10-unacceptable-principal-dx-codes.import.service';
import { NcdOtherLabImportCommand } from './ncd-other-lab.command';
import { NcdOtherLabImportService } from './ncd-other-lab.import.service';
import { NcdOtherLabCodesImportCommand } from './ncd-other-lab-codes.command';
import { NcdOtherLabCodesImportService } from './ncd-other-lab-codes.import.service';
import { NcciImportCommand } from './ncci.command';
import { NcciImportService } from './ncci.import.service';
import { Icd10NcdImportCommand } from './icd10-ncd.command';
import { Icd10NcdImportService } from './icd10-ncd.import.service';
import { ArticleImportCommand } from './article.command';
import { ArticleImportService } from './article.import.service';
import { Icd10TabularImportCommand } from './icd10-tabular/icd10-tabular.command';
import { Icd10TabularImportService } from './icd10-tabular/icd10-tabular.import.service';
import { NpiOrderingReferringFetchCommand } from './npi-ordering-referring/npi-ordering-referring-fetch.command';
import { NpiOrderingReferringImportCommand } from './npi-ordering-referring/npi-ordering-referring-import.command';
import { NpiOrderingReferringSyncCommand } from './npi-ordering-referring/npi-ordering-referring-sync.command';
import { NpiOrderingReferringSyncService } from './npi-ordering-referring/npi-ordering-referring-sync.service';
import { NpiOrderingReferringDownloader } from './npi-ordering-referring/npi-ordering-referring.downloader';
import { NpiOrderingReferringImportService } from './npi-ordering-referring/npi-ordering-referring.import.service';
import { OrderAndReferringApiClient } from './npi-ordering-referring/order-and-referring-api.client';

@Module({
  imports: [PrismaModule, LookupCacheModule],
  providers: [
    LookupSyncHelper,
    RadiologyCptCodesImportService,
    MajorSurgeryCodesImportService,
    InitialTreatmentCodesImportService,
    NoOfUnitsCptsImportService,
    AnesthesiaCodesImportService,
    AnesthesiaModifiersImportService,
    AnesthesiaCodesWithBillableModifiersImportService,
    ICodesImportService,
    GlobalDaysSurgeriesImportService,
    BcbsClaimRoutingsImportService,
    Mue87726Uhc06111OxfordImportService,
    UhcAuthorizationsImportService,
    ZeroAmountProceduresImportService,
    EnmProceduresImportService,
    EnmSurgeryCodesImportService,
    ConsultationProceduresImportService,
    LabCodesImportService,
    VaccineCodesImportService,
    AgeSpecificCptRulesImportService,
    GenderSpecificCptRulesImportService,
    AgeSpecificIcdRulesImportService,
    IcdGenderSpecificRulesImportService,
    TobaccoCounselingIcdRulesImportService,
    ModifierSequencesImportService,
    CptCodesImportService,
    ModifiersImportService,
    NdcCodesImportService,
    NdcHcpcsCrosswalkImportService,
    UhcPosCrosswalkImportService,
    TaxonomyCodesImportService,
    Icd10RangeExpander,
    UhcAuthorizationConditionValuesNormalizer,
    CptPosRulesImportService,
    CptModifierRulesImportService,
    MuePractitionersImportService,
    ZipCodesImportService,
    AetnaB12LcdImportService,
    AetnaFetalLcdImportService,
    CignaCptIcdCrosswalkImportService,
    MedicaidMemberIdFormatRepository,
    AddOnCodesImportService,
    McrVaccineCodesImportService,
    MedicaidMemberIdFormatsImportService,
    Icd10BodySidewiseImportService,
    Icd10UnacceptablePrincipalDxCodesImportService,
    NcdOtherLabImportService,
    NcdOtherLabCodesImportService,
    NcciImportService,
    Icd10NcdImportService,
    ArticleImportService,
    Icd10TabularImportService,
    OrderAndReferringApiClient,
    NpiOrderingReferringDownloader,
    NpiOrderingReferringImportService,
    NpiOrderingReferringSyncService,
    RadiologyCptCodesImportCommand,
    MajorSurgeryCodesImportCommand,
    InitialTreatmentCodesImportCommand,
    NoOfUnitsCptsImportCommand,
    AnesthesiaCodesImportCommand,
    AnesthesiaModifiersImportCommand,
    AnesthesiaCodesWithBillableModifiersImportCommand,
    ICodesImportCommand,
    GlobalDaysSurgeriesImportCommand,
    BcbsClaimRoutingsImportCommand,
    Mue87726Uhc06111OxfordImportCommand,
    UhcAuthorizationsImportCommand,
    ZeroAmountProceduresImportCommand,
    EnmProceduresImportCommand,
    EnmSurgeryCodesImportCommand,
    ConsultationProceduresImportCommand,
    LabCodesImportCommand,
    VaccineCodesImportCommand,
    AgeSpecificCptRulesImportCommand,
    GenderSpecificCptRulesImportCommand,
    AgeSpecificIcdRulesImportCommand,
    IcdGenderSpecificRulesImportCommand,
    TobaccoCounselingIcdRulesImportCommand,
    ModifierSequencesImportCommand,
    CptCodesImportCommand,
    ModifiersImportCommand,
    NdcCodesImportCommand,
    NdcHcpcsCrosswalkImportCommand,
    UhcPosCrosswalkImportCommand,
    TaxonomyCodesImportCommand,
    CptPosRulesImportCommand,
    CptModifierRulesImportCommand,
    MuePractitionersImportCommand,
    ZipCodesImportCommand,
    AetnaB12LcdImportCommand,
    AetnaFetalLcdImportCommand,
    CignaCptIcdCrosswalkImportCommand,
    AddOnCodesImportCommand,
    McrVaccineCodesImportCommand,
    MedicaidMemberIdFormatsImportCommand,
    Icd10BodySidewiseImportCommand,
    Icd10UnacceptablePrincipalDxCodesImportCommand,
    NcdOtherLabImportCommand,
    NcdOtherLabCodesImportCommand,
    NcciImportCommand,
    Icd10NcdImportCommand,
    ArticleImportCommand,
    Icd10TabularImportCommand,
    NpiOrderingReferringFetchCommand,
    NpiOrderingReferringImportCommand,
    NpiOrderingReferringSyncCommand,
  ],
  exports: [
    RadiologyCptCodesImportService,
    MajorSurgeryCodesImportService,
    InitialTreatmentCodesImportService,
    NoOfUnitsCptsImportService,
    AnesthesiaCodesImportService,
    AnesthesiaModifiersImportService,
    AnesthesiaCodesWithBillableModifiersImportService,
    ICodesImportService,
    GlobalDaysSurgeriesImportService,
    BcbsClaimRoutingsImportService,
    Mue87726Uhc06111OxfordImportService,
    UhcAuthorizationsImportService,
    ZeroAmountProceduresImportService,
    EnmProceduresImportService,
    EnmSurgeryCodesImportService,
    ConsultationProceduresImportService,
    LabCodesImportService,
    VaccineCodesImportService,
    AgeSpecificCptRulesImportService,
    GenderSpecificCptRulesImportService,
    AgeSpecificIcdRulesImportService,
    IcdGenderSpecificRulesImportService,
    TobaccoCounselingIcdRulesImportService,
    ModifierSequencesImportService,
    CptCodesImportService,
    ModifiersImportService,
    NdcCodesImportService,
    NdcHcpcsCrosswalkImportService,
    UhcPosCrosswalkImportService,
    TaxonomyCodesImportService,
    CptPosRulesImportService,
    CptModifierRulesImportService,
    MuePractitionersImportService,
    ZipCodesImportService,
    AetnaB12LcdImportService,
    AetnaFetalLcdImportService,
    CignaCptIcdCrosswalkImportService,
    MedicaidMemberIdFormatRepository,
    AddOnCodesImportService,
    McrVaccineCodesImportService,
    MedicaidMemberIdFormatsImportService,
    Icd10BodySidewiseImportService,
    Icd10UnacceptablePrincipalDxCodesImportService,
    NcdOtherLabImportService,
    NcdOtherLabCodesImportService,
    NcciImportService,
    Icd10NcdImportService,
    ArticleImportService,
    Icd10TabularImportService,
    OrderAndReferringApiClient,
    NpiOrderingReferringDownloader,
    NpiOrderingReferringImportService,
    NpiOrderingReferringSyncService,
  ],
})
export class ImportsModule {}
