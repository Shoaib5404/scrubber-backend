import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import {
  CurrentAuth,
  RequirePermissions,
  type AuthPrincipal,
} from '../auth/auth.types';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { Permission } from '../auth/permissions.constants';
import {
  CreateInquiryReplyDto,
  ListInquiriesQueryDto,
  PatchInquiryStatusDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

@ApiTags('admin-inquiries')
@ApiBearerAuth()
@Controller('admin/inquiries')
@UseGuards(StaffOnlyGuard, RequirePermissionGuard)
@RequirePermissions(Permission.InquiriesView)
export class AdminInquiriesController {
  constructor(private readonly support: SupportService) {}

  @Get()
  async list(@Query() query: ListInquiriesQueryDto) {
    const data = await this.support.listInquiries(query);
    return { success: true, data };
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const data = await this.support.getInquiry(id);
    return { success: true, data };
  }

  @Get(':id/attachment')
  async attachment(@Param('id', ParseIntPipe) id: number) {
    const data = await this.support.getAttachmentDownloadUrl(id);
    return { success: true, data };
  }

  @Patch(':id')
  async patchStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PatchInquiryStatusDto,
  ) {
    const data = await this.support.updateStatus(id, body.status);
    return { success: true, data };
  }

  @Post(':id/replies')
  async reply(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateInquiryReplyDto,
  ) {
    const data = await this.support.addReply(auth, id, body);
    return { success: true, data };
  }
}
