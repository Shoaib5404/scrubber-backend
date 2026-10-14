import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentAuth, Public, type AuthPrincipal } from '../auth/auth.types';
import {
  CreateInquiryReplyDto,
  CreatePortalInquiryDto,
  CreatePublicInquiryDto,
  ListInquiriesQueryDto,
  PresignInquiryAttachmentDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Public()
  @Post('public')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async createPublic(@Body() body: CreatePublicInquiryDto) {
    const data = await this.support.createPublicInquiry(body);
    return { success: true, data };
  }

  @ApiBearerAuth()
  @Post('attachments/presign')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async presign(
    @CurrentAuth() auth: AuthPrincipal,
    @Body() body: PresignInquiryAttachmentDto,
  ) {
    const data = await this.support.presignAttachment(auth, body);
    return { success: true, data };
  }

  @ApiBearerAuth()
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createPortal(
    @CurrentAuth() auth: AuthPrincipal,
    @Body() body: CreatePortalInquiryDto,
  ) {
    const data = await this.support.createPortalInquiry(auth, body);
    return { success: true, data };
  }

  @ApiBearerAuth()
  @Get('mine')
  async listMine(
    @CurrentAuth() auth: AuthPrincipal,
    @Query() query: ListInquiriesQueryDto,
  ) {
    const data = await this.support.listMyInquiries(auth, query);
    return { success: true, data };
  }

  @ApiBearerAuth()
  @Get('mine/:id')
  async getMine(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.support.getMyInquiry(auth, id);
    return { success: true, data };
  }

  @ApiBearerAuth()
  @Post('mine/:id/replies')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async replyMine(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateInquiryReplyDto,
  ) {
    const data = await this.support.addCustomerReply(auth, id, body);
    return { success: true, data };
  }
}
