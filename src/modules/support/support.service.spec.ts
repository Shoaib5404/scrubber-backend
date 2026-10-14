import { BadRequestException } from '@nestjs/common';
import { SupportService } from './support.service';
import { EmailNotifyStatus, SALES_DEMO_CATEGORY } from './support.constants';

describe('SupportService', () => {
  const ticketRow = {
    id: 1,
    publicReference: 'SUP-2026-ABC123',
    source: 'public',
    tenantId: null,
    requesterUserId: null,
    requesterName: 'Ada',
    requesterEmail: 'ada@example.com',
    requesterOrganization: 'Acme',
    category: SALES_DEMO_CATEGORY,
    subject: 'Demo please',
    description: 'We want a demo',
    relatedBatchId: null,
    status: 'open',
    priority: 'normal',
    emailNotifyStatus: EmailNotifyStatus.Skipped,
    attachmentObjectKey: null,
    attachmentOriginalName: null,
    attachmentMimeType: null,
    attachmentSizeBytes: null,
    attachmentUploadedAt: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date('2026-10-14T12:00:00Z'),
    updatedAt: new Date('2026-10-14T12:00:00Z'),
  };

  function buildService(overrides?: {
    supportInbox?: string;
    mailSend?: jest.Mock;
  }) {
    const prisma = {
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(ticketRow),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          ...ticketRow,
          ...data,
        })),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
      user: { findUnique: jest.fn() },
      batchFile: { findFirst: jest.fn() },
      supportMessage: { create: jest.fn() },
    };
    const storage = {
      getPresignedUploadUrl: jest.fn(),
      getPresignedDownloadUrl: jest.fn(),
      headObject: jest.fn(),
      getObject: jest.fn(),
      deleteObject: jest.fn(),
    };
    const mailSend =
      overrides?.mailSend ??
      jest.fn().mockResolvedValue({ sent: true, provider: 'resend' });
    const replyMailSend = jest
      .fn()
      .mockResolvedValue({ sent: true, provider: 'resend' });
    const mail = {
      sendDemoInquiryAlert: mailSend,
      sendInquiryReplyEmail: replyMailSend,
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'SUPPORT_INBOX') return overrides?.supportInbox ?? 'admin@example.com';
        if (key === 'FRONTEND_URL') return 'http://localhost:3010';
        if (key === 'INQUIRY_ATTACHMENT_MAX_BYTES') return fallback ?? 5_242_880;
        return fallback;
      }),
    };

    const service = new SupportService(
      prisma as never,
      storage as never,
      mail as never,
      config as never,
    );
    return { service, prisma, mail, mailSend, replyMailSend };
  }

  it('emails staff admin only for sales_demo public inquiries', async () => {
    const { service, mailSend, prisma } = buildService();
    const result = await service.createPublicInquiry({
      name: 'Ada',
      email: 'ada@example.com',
      organization: 'Acme',
      category: SALES_DEMO_CATEGORY,
      subject: 'Demo please',
      message: 'We want a demo',
    });

    expect(mailSend).toHaveBeenCalledTimes(1);
    expect(mailSend.mock.calls[0][0].to).toBe('admin@example.com');
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { emailNotifyStatus: EmailNotifyStatus.Sent },
      }),
    );
    expect(result.public_reference).toBe('SUP-2026-ABC123');
  });

  it('does not email for non-demo public categories', async () => {
    const { service, mailSend, prisma } = buildService();
    prisma.supportTicket.create.mockResolvedValue({
      ...ticketRow,
      category: 'pricing',
    });

    await service.createPublicInquiry({
      name: 'Ada',
      email: 'ada@example.com',
      organization: 'Acme',
      category: 'pricing',
      subject: 'Pricing',
      message: 'How much?',
    });

    expect(mailSend).not.toHaveBeenCalled();
  });

  it('skips email when SUPPORT_INBOX is unset', async () => {
    const { service, mailSend, prisma } = buildService({ supportInbox: '' });
    await service.createPublicInquiry({
      name: 'Ada',
      email: 'ada@example.com',
      organization: 'Acme',
      category: SALES_DEMO_CATEGORY,
      subject: 'Demo please',
      message: 'We want a demo',
    });
    expect(mailSend).not.toHaveBeenCalled();
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { emailNotifyStatus: EmailNotifyStatus.Skipped },
      }),
    );
  });

  it('rejects invalid public categories', async () => {
    const { service } = buildService();
    await expect(
      service.createPublicInquiry({
        name: 'Ada',
        email: 'ada@example.com',
        organization: 'Acme',
        category: 'not_real',
        subject: 'Hi',
        message: 'Hello',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('emails the requester when staff replies to a demo inquiry', async () => {
    const { service, prisma, replyMailSend } = buildService();
    prisma.supportTicket.findUnique.mockResolvedValue(ticketRow);
    prisma.supportMessage.create.mockResolvedValue({
      id: 9,
      ticketId: 1,
      authorUserId: 2,
      authorType: 'staff',
      body: 'Thanks — we will schedule a demo.',
      isInternalNote: false,
      createdAt: new Date('2026-10-14T13:00:00Z'),
    });

    const result = await service.addReply(
      { userId: 2, role: 'admin', tenantId: null } as never,
      1,
      { body: 'Thanks — we will schedule a demo.' },
    );

    expect(replyMailSend).toHaveBeenCalledTimes(1);
    expect(replyMailSend.mock.calls[0][0]).toMatchObject({
      to: 'ada@example.com',
      reference: 'SUP-2026-ABC123',
      ticketSubject: 'Demo please',
      replyBody: 'Thanks — we will schedule a demo.',
      viewUrl: null,
    });
    expect(result.email_notify_status).toBe(EmailNotifyStatus.Sent);
  });

  it('does not email the requester for non-demo inquiry replies', async () => {
    const { service, prisma, replyMailSend } = buildService();
    prisma.supportTicket.findUnique.mockResolvedValue({
      ...ticketRow,
      category: 'pricing',
      subject: 'Pricing question',
    });
    prisma.supportMessage.create.mockResolvedValue({
      id: 11,
      ticketId: 1,
      authorUserId: 2,
      authorType: 'staff',
      body: 'Here is our pricing.',
      isInternalNote: false,
      createdAt: new Date('2026-10-14T13:00:00Z'),
    });

    const result = await service.addReply(
      { userId: 2, role: 'admin', tenantId: null } as never,
      1,
      { body: 'Here is our pricing.' },
    );

    expect(replyMailSend).not.toHaveBeenCalled();
    expect(result.email_notify_status).toBe(EmailNotifyStatus.Skipped);
  });

  it('includes portal view link for portal sales_demo replies', async () => {
    const { service, prisma, replyMailSend } = buildService();
    prisma.supportTicket.findUnique.mockResolvedValue({
      ...ticketRow,
      source: 'portal',
      tenantId: 5,
      requesterUserId: 11,
      category: SALES_DEMO_CATEGORY,
    });
    prisma.supportMessage.create.mockResolvedValue({
      id: 10,
      ticketId: 1,
      authorUserId: 2,
      authorType: 'staff',
      body: 'Happy to schedule a walkthrough.',
      isInternalNote: false,
      createdAt: new Date('2026-10-14T13:00:00Z'),
    });

    await service.addReply(
      { userId: 2, role: 'admin', tenantId: null } as never,
      1,
      { body: 'Happy to schedule a walkthrough.' },
    );

    expect(replyMailSend.mock.calls[0][0].viewUrl).toBe(
      'http://localhost:3010/portal/support/1',
    );
  });
});
