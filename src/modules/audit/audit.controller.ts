import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAuth, type AuthPrincipal } from '../auth/auth.types';
import { AuditQueryService } from './audit-query.service';
import { ListAuditEventsQueryDto } from './dto/audit-query.dto';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly query: AuditQueryService) {}

  @Get('events')
  async listEvents(
    @CurrentAuth() auth: AuthPrincipal,
    @Query() query: ListAuditEventsQueryDto,
  ) {
    // Ignore client tenant_id for customers — AuditQueryService forces auth.tenantId.
    const safe = { ...query };
    if (auth.tenantId != null) {
      delete safe.tenant_id;
    }
    return { success: true, data: await this.query.list(auth, safe) };
  }
}
