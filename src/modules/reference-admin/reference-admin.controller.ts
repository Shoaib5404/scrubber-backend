import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ReferenceAdminService } from './reference-admin.service';

@ApiTags('admin-references')
@ApiBearerAuth()
@UseGuards(StaffOnlyGuard)
@Controller('admin/references')
export class ReferenceAdminController {
  constructor(private readonly references: ReferenceAdminService) {}

  /** Bulk Excel import/export deferred — Task 19 / CLI. */
  @Get()
  listDomains() {
    const domains = this.references.listDomains();
    return { success: true, data: { domains } };
  }

  @Get('integrity/cms')
  async cmsIntegrity() {
    return { success: true, data: await this.references.cmsIntegrityReport() };
  }

  @Get('ncd-cpt/:id/icds')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'per_page', required: false })
  @ApiQuery({ name: 'search', required: false })
  async listNcdIcds(
    @Param('id') id: string,
    @Query('page') pageRaw?: string,
    @Query('per_page') perPageRaw?: string,
    @Query('search') search?: string,
  ) {
    const ncdCptId = Number(id);
    if (!Number.isInteger(ncdCptId) || ncdCptId <= 0) {
      throw new BadRequestException('Invalid numeric id.');
    }
    const page = pageRaw ? Number(pageRaw) : 1;
    const perPage = perPageRaw ? Number(perPageRaw) : 25;
    const data = await this.references.listNcdIcdsForCpt(ncdCptId, {
      page: Number.isFinite(page) ? page : 1,
      perPage: Number.isFinite(perPage) ? perPage : 25,
      search,
    });
    return { success: true, data };
  }

  @Get(':domain')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'per_page', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'is_active', required: false })
  async listDomain(
    @Param('domain') domain: string,
    @Query('page') pageRaw?: string,
    @Query('per_page') perPageRaw?: string,
    @Query('search') search?: string,
    @Query('is_active') isActive?: string,
  ) {
    const page = pageRaw ? Number(pageRaw) : 1;
    const perPage = perPageRaw ? Number(perPageRaw) : 25;
    const data = await this.references.listDomain(domain, {
      page: Number.isFinite(page) ? page : 1,
      perPage: Number.isFinite(perPage) ? perPage : 25,
      search,
      isActive,
    });
    return { success: true, data };
  }

  @Get(':domain/:id')
  async showDomain(@Param('domain') domain: string, @Param('id') id: string) {
    const data = await this.references.showDomain(domain, id);
    return { success: true, data };
  }

  @Post(':domain')
  @HttpCode(HttpStatus.CREATED)
  async createDomain(@Param('domain') domain: string, @Body() body: Record<string, unknown>) {
    const data = await this.references.createDomain(domain, body);
    return { success: true, data };
  }

  @Put(':domain/:id')
  async updateDomain(
    @Param('domain') domain: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.references.updateDomain(domain, id, body);
    return { success: true, data };
  }

  @Delete(':domain/:id')
  async destroyDomain(@Param('domain') domain: string, @Param('id') id: string) {
    const data = await this.references.destroyDomain(domain, id);
    return { success: true, data };
  }

  @Post(':domain/:id/toggle-active')
  @HttpCode(200)
  async toggleActive(
    @Param('domain') domain: string,
    @Param('id') id: string,
  ) {
    const data = await this.references.toggleActiveDomain(domain, id);
    return { success: true, data };
  }
}
