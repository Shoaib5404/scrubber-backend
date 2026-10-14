import { AuditCategoryCode } from './audit.catalog';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  const prisma = {
    auditCategory: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditEvent: {
      create: jest.fn(),
    },
  };

  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuditService(prisma as never);
    service.invalidateEnabledCache();
  });

  it('no-ops when category is disabled', async () => {
    prisma.auditCategory.findMany.mockResolvedValue([
      { code: AuditCategoryCode.AuthLogin, enabled: false },
    ]);

    await service.recordAsync({
      category: AuditCategoryCode.AuthLogin,
      action: 'succeeded',
      system: true,
      actorType: 'system',
    });

    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('writes when category is enabled', async () => {
    prisma.auditCategory.findMany.mockResolvedValue([
      { code: AuditCategoryCode.AuthLogin, enabled: true },
    ]);
    prisma.auditEvent.create.mockResolvedValue({ id: 1 });

    await service.recordAsync({
      category: AuditCategoryCode.AuthLogin,
      action: 'succeeded',
      system: true,
      actorType: 'user',
      actorUserId: 9,
      tenantId: 3,
      resourceType: 'user',
      resourceId: 9,
    });

    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryCode: AuditCategoryCode.AuthLogin,
          action: 'succeeded',
          actorUserId: 9,
          tenantId: 3,
        }),
      }),
    );
  });

  it('strips sensitive metadata keys', async () => {
    prisma.auditCategory.findMany.mockResolvedValue([
      { code: AuditCategoryCode.AuthLogin, enabled: true },
    ]);
    prisma.auditEvent.create.mockResolvedValue({ id: 1 });

    await service.recordAsync({
      category: AuditCategoryCode.AuthLogin,
      action: 'succeeded',
      system: true,
      actorType: 'system',
      metadata: {
        password: 'secret',
        token: 'abc',
        reason: 'ok',
      },
    });

    const arg = prisma.auditEvent.create.mock.calls[0][0];
    expect(arg.data.metadata).toEqual({ reason: 'ok' });
  });

  it('fail-open record does not throw when create rejects', async () => {
    prisma.auditCategory.findMany.mockResolvedValue([
      { code: AuditCategoryCode.AuthLogout, enabled: true },
    ]);
    prisma.auditEvent.create.mockRejectedValue(new Error('db down'));

    expect(() =>
      service.record({
        category: AuditCategoryCode.AuthLogout,
        action: 'succeeded',
        system: true,
        actorType: 'system',
      }),
    ).not.toThrow();

    await new Promise((r) => setTimeout(r, 20));
  });
});
