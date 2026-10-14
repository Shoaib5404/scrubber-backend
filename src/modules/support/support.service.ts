import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { StorageService } from '../../adapters/storage/storage.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { isStaffRole, isTenantRole } from '../auth/auth.constants';
import { MailService } from '../mail/mail.service';
import {
  assertInquiryAttachmentContent,
  assertInquiryMimeForExtension,
  assertInquiryObjectKeyBelongsToActor,
  assertInquiryOriginalFilename,
  inquiryExtensionFromFilename,
  mintInquiryObjectKey,
  normalizeInquiryMimeType,
} from './inquiry-attachment.util';
import {
  ALLOWED_STATUS_TRANSITIONS,
  AuthorType,
  EmailNotifyStatus,
  PORTAL_CATEGORIES,
  PUBLIC_CATEGORIES,
  SALES_DEMO_CATEGORY,
  SupportSource,
  SupportStatus,
  type SupportStatusValue,
  categoryLabel,
} from './support.constants';
import type {
  CreateInquiryReplyDto,
  CreatePortalInquiryDto,
  CreatePublicInquiryDto,
  ListInquiriesQueryDto,
  PresignInquiryAttachmentDto,
} from './dto/support.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async createPublicInquiry(dto: CreatePublicInquiryDto) {
    if (!(PUBLIC_CATEGORIES as readonly string[]).includes(dto.category)) {
      throw new BadRequestException('Invalid category.');
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        publicReference: await this.mintUniqueReference(),
        source: SupportSource.Public,
        requesterName: dto.name.trim(),
        requesterEmail: dto.email.trim().toLowerCase(),
        requesterOrganization: dto.organization?.trim() || null,
        category: dto.category,
        subject: dto.subject.trim(),
        description: dto.message.trim(),
        status: SupportStatus.Open,
        priority: 'normal',
        emailNotifyStatus: EmailNotifyStatus.Skipped,
      },
    });

    let emailNotifyStatus: string = EmailNotifyStatus.Skipped;
    if (dto.category === SALES_DEMO_CATEGORY) {
      emailNotifyStatus = await this.notifyStaffAdminDemo(ticket);
      await this.prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { emailNotifyStatus },
      });
    }

    return this.toTicketDto({ ...ticket, emailNotifyStatus });
  }

  async createPortalInquiry(auth: AuthPrincipal, dto: CreatePortalInquiryDto) {
    if (auth.typ !== 'user' || !auth.userId) {
      throw new ForbiddenException('A user session is required.');
    }
    if (!isTenantRole(auth.role ?? '') || auth.tenantId == null) {
      throw new ForbiddenException(
        'Only customer portal users can submit portal inquiries.',
      );
    }
    if (!(PORTAL_CATEGORIES as readonly string[]).includes(dto.category)) {
      throw new BadRequestException('Invalid category.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        name: true,
        email: true,
        tenantId: true,
        tenant: { select: { name: true } },
      },
    });
    if (!user || user.tenantId !== auth.tenantId) {
      throw new ForbiddenException('Invalid user context.');
    }

    let attachment: {
      attachmentObjectKey: string;
      attachmentOriginalName: string;
      attachmentMimeType: string;
      attachmentSizeBytes: number;
      attachmentUploadedAt: Date;
    } | null = null;

    const hasAttachmentKey = Boolean(dto.attachment_object_key?.trim());
    if (hasAttachmentKey) {
      attachment = await this.verifyAndAcceptAttachment({
        tenantId: auth.tenantId,
        userId: auth.userId,
        objectKey: dto.attachment_object_key!,
        originalName: dto.attachment_original_name ?? '',
        mimeType: dto.attachment_mime_type ?? '',
        sizeBytes: dto.attachment_size_bytes ?? 0,
      });
    }

    if (dto.related_batch_id != null) {
      const batch = await this.prisma.batchFile.findFirst({
        where: { id: dto.related_batch_id, tenantId: auth.tenantId },
        select: { id: true },
      });
      if (!batch) {
        throw new BadRequestException('related_batch_id was not found for your organization.');
      }
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        publicReference: await this.mintUniqueReference(),
        source: SupportSource.Portal,
        tenantId: auth.tenantId,
        requesterUserId: user.id,
        requesterName: user.name,
        requesterEmail: user.email,
        requesterOrganization: user.tenant?.name ?? null,
        category: dto.category,
        subject: dto.subject.trim(),
        description: dto.message.trim(),
        relatedBatchId: dto.related_batch_id ?? null,
        status: SupportStatus.Open,
        priority: 'normal',
        emailNotifyStatus: EmailNotifyStatus.Skipped,
        ...(attachment ?? {}),
      },
    });

    return this.toTicketDto(ticket);
  }

  async presignAttachment(auth: AuthPrincipal, dto: PresignInquiryAttachmentDto) {
    if (auth.typ !== 'user' || !auth.userId || auth.tenantId == null) {
      throw new ForbiddenException('A tenant user session is required to upload.');
    }
    if (!isTenantRole(auth.role ?? '')) {
      throw new ForbiddenException(
        'Only customer portal users can upload inquiry attachments.',
      );
    }

    const originalFilename = assertInquiryOriginalFilename(dto.originalFilename);
    const extension = inquiryExtensionFromFilename(originalFilename);
    const mimeType = assertInquiryMimeForExtension(dto.mimeType, extension);
    const max = this.config.get<number>('INQUIRY_ATTACHMENT_MAX_BYTES', 5_242_880);
    if (dto.sizeBytes > max) {
      throw new BadRequestException(`Attachment exceeds max size of ${max} bytes.`);
    }

    const objectKey = mintInquiryObjectKey(auth.tenantId, auth.userId, extension);
    const signed = await this.storage.getPresignedUploadUrl({
      objectKey,
      mimeType,
      maxSizeBytes: dto.sizeBytes,
    });

    return {
      url: signed.url,
      objectKey: signed.objectKey,
      expiresIn: signed.expiresIn,
      headers: signed.headers ?? { 'Content-Type': mimeType },
      originalFilename,
      mimeType,
      maxSizeBytes: max,
    };
  }

  private requirePortalCustomer(auth: AuthPrincipal): {
    userId: number;
    tenantId: number;
  } {
    if (auth.typ !== 'user' || !auth.userId) {
      throw new ForbiddenException('A user session is required.');
    }
    if (!isTenantRole(auth.role ?? '') || auth.tenantId == null) {
      throw new ForbiddenException(
        'Only customer portal users can access their inquiries.',
      );
    }
    return { userId: auth.userId, tenantId: auth.tenantId };
  }

  async listMyInquiries(auth: AuthPrincipal, query: ListInquiriesQueryDto) {
    const { userId, tenantId } = this.requirePortalCustomer(auth);
    const page = Math.max(1, query.page ?? 1);
    const perPage = Math.min(100, Math.max(1, query.per_page ?? 20));
    const where: Record<string, unknown> = {
      tenantId,
      requesterUserId: userId,
    };
    if (query.status) where.status = query.status;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      data: rows.map((r) => this.toTicketDto(r)),
      total,
      page,
      per_page: perPage,
      last_page: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  async getMyInquiry(auth: AuthPrincipal, id: number) {
    const { userId, tenantId } = this.requirePortalCustomer(auth);
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, tenantId, requesterUserId: userId },
      include: {
        messages: {
          where: { isInternalNote: false },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Inquiry not found.');
    }
    return {
      ...this.toTicketDto(ticket),
      messages: ticket.messages.map((m) => ({
        id: m.id,
        author_type: m.authorType,
        body: m.body,
        created_at: m.createdAt.toISOString(),
        author: m.author
          ? {
              id: m.author.id,
              name: m.author.name,
              // Staff emails are not exposed to customers.
              email:
                m.authorType === AuthorType.Staff ? null : m.author.email,
            }
          : null,
      })),
    };
  }

  async addCustomerReply(
    auth: AuthPrincipal,
    id: number,
    dto: CreateInquiryReplyDto,
  ) {
    const { userId, tenantId } = this.requirePortalCustomer(auth);
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, tenantId, requesterUserId: userId },
    });
    if (!ticket) {
      throw new NotFoundException('Inquiry not found.');
    }
    if (ticket.status === SupportStatus.Closed) {
      throw new BadRequestException(
        'This inquiry is closed. Submit a new inquiry if you need more help.',
      );
    }

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId: id,
        authorUserId: userId,
        authorType: AuthorType.Customer,
        body: dto.body.trim(),
        isInternalNote: false,
      },
    });

    const nextStatus =
      ticket.status === SupportStatus.WaitingForCustomer ||
      ticket.status === SupportStatus.Resolved
        ? SupportStatus.Open
        : ticket.status;

    if (nextStatus !== ticket.status) {
      await this.prisma.supportTicket.update({
        where: { id },
        data: {
          status: nextStatus,
          resolvedAt: null,
          closedAt: null,
        },
      });
    } else {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    }

    return {
      id: message.id,
      author_type: message.authorType,
      body: message.body,
      created_at: message.createdAt.toISOString(),
    };
  }

  async listInquiries(query: ListInquiriesQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const perPage = Math.min(100, Math.max(1, query.per_page ?? 20));
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { publicReference: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
        { requesterEmail: { contains: q, mode: 'insensitive' } },
        { requesterName: { contains: q, mode: 'insensitive' } },
        { requesterOrganization: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      data: rows.map((r) => this.toTicketDto(r)),
      total,
      page,
      per_page: perPage,
      last_page: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  async getInquiry(id: number) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        messages: {
          where: { isInternalNote: false },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Inquiry not found.');
    }
    return {
      ...this.toTicketDto(ticket),
      messages: ticket.messages.map((m) => ({
        id: m.id,
        author_type: m.authorType,
        body: m.body,
        created_at: m.createdAt.toISOString(),
        author: m.author
          ? { id: m.author.id, name: m.author.name, email: m.author.email }
          : null,
      })),
    };
  }

  async updateStatus(id: number, status: string) {
    if (!(Object.values(SupportStatus) as string[]).includes(status)) {
      throw new BadRequestException('Invalid status.');
    }
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Inquiry not found.');
    }
    const current = ticket.status as SupportStatusValue;
    const next = status as SupportStatusValue;
    const allowed = ALLOWED_STATUS_TRANSITIONS[current] ?? [];
    if (current !== next && !allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot transition from ${current} to ${next}.`,
      );
    }

    const data: {
      status: string;
      resolvedAt?: Date | null;
      closedAt?: Date | null;
    } = { status: next };
    if (next === SupportStatus.Resolved && !ticket.resolvedAt) {
      data.resolvedAt = new Date();
    }
    if (next === SupportStatus.Closed && !ticket.closedAt) {
      data.closedAt = new Date();
    }
    if (next === SupportStatus.Open) {
      data.resolvedAt = null;
      data.closedAt = null;
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data,
    });
    return this.toTicketDto(updated);
  }

  async addReply(auth: AuthPrincipal, id: number, dto: CreateInquiryReplyDto) {
    if (!auth.userId || !isStaffRole(auth.role ?? '')) {
      throw new ForbiddenException('Only staff can reply on inquiries.');
    }
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Inquiry not found.');
    }

    const body = dto.body.trim();
    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId: id,
        authorUserId: auth.userId,
        authorType: AuthorType.Staff,
        body,
        isInternalNote: false,
      },
    });

    if (ticket.status === SupportStatus.Open) {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { status: SupportStatus.InProgress },
      });
    }

    const emailNotifyStatus = await this.notifyRequesterOfStaffReply(ticket, body);

    return {
      id: message.id,
      author_type: message.authorType,
      body: message.body,
      created_at: message.createdAt.toISOString(),
      email_notify_status: emailNotifyStatus,
    };
  }

  async getAttachmentDownloadUrl(id: number) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Inquiry not found.');
    }
    if (!ticket.attachmentObjectKey) {
      throw new NotFoundException('This inquiry has no attachment.');
    }
    const signed = await this.storage.getPresignedDownloadUrl({
      objectKey: ticket.attachmentObjectKey,
    });
    return {
      url: signed.url,
      expires_in: signed.expiresIn,
      original_name: ticket.attachmentOriginalName,
      mime_type: ticket.attachmentMimeType,
      size_bytes: ticket.attachmentSizeBytes,
    };
  }

  private async verifyAndAcceptAttachment(params: {
    tenantId: number;
    userId: number;
    objectKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    const originalName = assertInquiryOriginalFilename(params.originalName);
    const extension = inquiryExtensionFromFilename(originalName);
    const mimeType = assertInquiryMimeForExtension(params.mimeType, extension);
    const max = this.config.get<number>('INQUIRY_ATTACHMENT_MAX_BYTES', 5_242_880);
    if (params.sizeBytes <= 0 || params.sizeBytes > max) {
      throw new BadRequestException(`Attachment size must be between 1 and ${max} bytes.`);
    }

    const objectKey = assertInquiryObjectKeyBelongsToActor(
      params.objectKey,
      params.tenantId,
      params.userId,
    );
    const keyExt = inquiryExtensionFromFilename(objectKey);
    if (keyExt !== extension) {
      await this.safeDeleteObject(objectKey);
      throw new BadRequestException('Attachment key extension does not match filename.');
    }

    const head = await this.storage.headObject(objectKey);
    if (!head.exists) {
      throw new BadRequestException('Uploaded file was not found in storage.');
    }
    if (typeof head.contentLength === 'number') {
      if (head.contentLength > max || head.contentLength <= 0) {
        await this.safeDeleteObject(objectKey);
        throw new BadRequestException(`Attachment exceeds max size of ${max} bytes.`);
      }
      if (head.contentLength !== params.sizeBytes) {
        await this.safeDeleteObject(objectKey);
        throw new BadRequestException(
          'Stored file size does not match the declared size.',
        );
      }
    }
    if (
      head.contentType &&
      normalizeInquiryMimeType(head.contentType) !== mimeType &&
      !isLooseMimeMatch(head.contentType, mimeType, extension)
    ) {
      await this.safeDeleteObject(objectKey);
      throw new BadRequestException(
        'Stored file MIME type does not match an allowed type.',
      );
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.getObject(objectKey);
    } catch (err) {
      this.logger.warn(`Failed to read inquiry attachment ${objectKey}: ${String(err)}`);
      throw new BadRequestException('Uploaded file was not found in storage.');
    }

    try {
      assertInquiryAttachmentContent(buffer, extension);
    } catch (err) {
      await this.safeDeleteObject(objectKey);
      throw err;
    }

    return {
      attachmentObjectKey: objectKey,
      attachmentOriginalName: originalName,
      attachmentMimeType: mimeType,
      attachmentSizeBytes: params.sizeBytes,
      attachmentUploadedAt: new Date(),
    };
  }

  private async notifyRequesterOfStaffReply(
    ticket: {
      id: number;
      publicReference: string;
      source: string;
      category: string;
      requesterUserId: number | null;
      requesterName: string;
      requesterEmail: string;
      subject: string;
    },
    replyBody: string,
  ): Promise<string> {
    // Reply emails are only for Request a Demo (sales_demo), not other inquiries.
    if (ticket.category !== SALES_DEMO_CATEGORY) {
      return EmailNotifyStatus.Skipped;
    }

    const to = ticket.requesterEmail?.trim().toLowerCase();
    if (!to) {
      this.logger.warn(
        `No requester email on ${ticket.publicReference}; skipping reply email`,
      );
      return EmailNotifyStatus.Skipped;
    }

    const frontend =
      this.config.get<string>('FRONTEND_URL')?.trim() || 'http://localhost:3010';
    const origin = frontend.replace(/\/$/, '');
    // Portal-originated tickets (or any with a linked user) get a deep link.
    const viewUrl =
      ticket.source === 'portal' || ticket.requesterUserId
        ? `${origin}/portal/support/${ticket.id}`
        : null;

    try {
      await this.mail.sendInquiryReplyEmail({
        to,
        requesterName: ticket.requesterName,
        reference: ticket.publicReference,
        ticketSubject: ticket.subject,
        replyBody,
        viewUrl,
      });
      return EmailNotifyStatus.Sent;
    } catch (err) {
      this.logger.warn(
        `Staff reply email failed for ${ticket.publicReference} → ${to}: ${String(err)}`,
      );
      return EmailNotifyStatus.Failed;
    }
  }

  private async notifyStaffAdminDemo(ticket: {
    id: number;
    publicReference: string;
    category: string;
    subject: string;
    requesterName: string;
    requesterEmail: string;
    requesterOrganization: string | null;
    description: string;
    createdAt: Date;
  }): Promise<string> {
    const inbox = this.config.get<string>('SUPPORT_INBOX')?.trim();
    if (!inbox) {
      this.logger.warn(
        `SUPPORT_INBOX unset; skipping demo email for ${ticket.publicReference}`,
      );
      return EmailNotifyStatus.Skipped;
    }
    const frontend =
      this.config.get<string>('FRONTEND_URL')?.trim() || 'http://localhost:3010';
    const link = `${frontend.replace(/\/$/, '')}/dashboard/inquiries/${ticket.id}`;
    try {
      await this.mail.sendDemoInquiryAlert({
        to: inbox,
        reference: ticket.publicReference,
        categoryLabel: categoryLabel(ticket.category),
        subject: ticket.subject,
        requesterName: ticket.requesterName,
        requesterEmail: ticket.requesterEmail,
        organization: ticket.requesterOrganization,
        message: ticket.description,
        portalUrl: link,
        submittedAt: ticket.createdAt.toISOString(),
      });
      return EmailNotifyStatus.Sent;
    } catch (err) {
      this.logger.warn(
        `Demo inquiry email failed for ${ticket.publicReference}: ${String(err)}`,
      );
      return EmailNotifyStatus.Failed;
    }
  }

  private async mintUniqueReference(): Promise<string> {
    const year = new Date().getFullYear();
    for (let i = 0; i < 8; i++) {
      const suffix = randomBytes(3).toString('hex').toUpperCase();
      const ref = `SUP-${year}-${suffix}`;
      const existing = await this.prisma.supportTicket.findUnique({
        where: { publicReference: ref },
        select: { id: true },
      });
      if (!existing) return ref;
    }
    throw new BadRequestException('Could not allocate a unique inquiry reference.');
  }

  private async safeDeleteObject(objectKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(objectKey);
    } catch (err) {
      this.logger.warn(`Failed to delete object ${objectKey}: ${String(err)}`);
    }
  }

  private toTicketDto(ticket: {
    id: number;
    publicReference: string;
    source: string;
    tenantId: number | null;
    requesterUserId: number | null;
    requesterName: string;
    requesterEmail: string;
    requesterOrganization: string | null;
    category: string;
    subject: string;
    description: string;
    relatedBatchId: number | null;
    status: string;
    priority: string;
    emailNotifyStatus: string | null;
    attachmentObjectKey: string | null;
    attachmentOriginalName: string | null;
    attachmentMimeType: string | null;
    attachmentSizeBytes: number | null;
    attachmentUploadedAt: Date | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: ticket.id,
      public_reference: ticket.publicReference,
      source: ticket.source,
      tenant_id: ticket.tenantId,
      requester_user_id: ticket.requesterUserId,
      requester_name: ticket.requesterName,
      requester_email: ticket.requesterEmail,
      requester_organization: ticket.requesterOrganization,
      category: ticket.category,
      category_label: categoryLabel(ticket.category),
      subject: ticket.subject,
      description: ticket.description,
      related_batch_id: ticket.relatedBatchId,
      status: ticket.status,
      priority: ticket.priority,
      email_notify_status: ticket.emailNotifyStatus,
      has_attachment: Boolean(ticket.attachmentObjectKey),
      attachment: ticket.attachmentObjectKey
        ? {
            original_name: ticket.attachmentOriginalName,
            mime_type: ticket.attachmentMimeType,
            size_bytes: ticket.attachmentSizeBytes,
            uploaded_at: ticket.attachmentUploadedAt?.toISOString() ?? null,
          }
        : null,
      resolved_at: ticket.resolvedAt?.toISOString() ?? null,
      closed_at: ticket.closedAt?.toISOString() ?? null,
      created_at: ticket.createdAt.toISOString(),
      updated_at: ticket.updatedAt.toISOString(),
    };
  }
}

function isLooseMimeMatch(
  stored: string,
  declared: string,
  extension: string,
): boolean {
  const s = normalizeInquiryMimeType(stored);
  const d = normalizeInquiryMimeType(declared);
  if (s === d) return true;
  if (extension === '.edi' || extension === '.x12' || extension === '.txt') {
    return (
      s === 'application/octet-stream' ||
      s === 'text/plain' ||
      s === 'application/edi-x12'
    );
  }
  return false;
}
