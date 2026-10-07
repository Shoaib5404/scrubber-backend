import { Module } from '@nestjs/common';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
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
    RadiologyCptCodesImportCommand,
    MajorSurgeryCodesImportCommand,
    InitialTreatmentCodesImportCommand,
    NoOfUnitsCptsImportCommand,
    AnesthesiaCodesImportCommand,
    AnesthesiaModifiersImportCommand,
    AnesthesiaCodesWithBillableModifiersImportCommand,
    ICodesImportCommand,
    GlobalDaysSurgeriesImportCommand,
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
  ],
})
export class ImportsModule {}
