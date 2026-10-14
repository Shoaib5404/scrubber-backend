import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BatchIngestService } from './batch-ingest.service';
import { mintEdiObjectKey } from './edi-object-key.util';

describe('BatchIngestService presign complete', () => {
  const storage = {
    getPresignedUploadUrl: jest.fn(),
    headObject: jest.fn(),
    getObject: jest.fn(),
    deleteObject: jest.fn(),
    putObject: jest.fn(),
  };

  const structural = {
    validate: jest.fn().mockReturnValue({ passed: true, issues: [] }),
  };

  const parser = {
    parse: jest.fn().mockReturnValue({
      claims: [],
      isaSenderId: 'SENDER',
      isaReceiverId: 'RECV',
      isaDate: null,
      isaTime: null,
      isaControlNumber: '1',
      bhtDate: null,
      gsSenderCode: null,
      gsReceiverCode: null,
      gsControlNumber: null,
      gsVersionCode: null,
    }),
  };

  const prisma = {
    batchFile: {
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: 99,
        ...data,
        totalClaims: 0,
      })),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        serviceLine: { deleteMany: jest.fn() },
        claimDiagnosis: { deleteMany: jest.fn() },
        claim: { deleteMany: jest.fn(), create: jest.fn() },
        batchFile: {
          update: jest.fn().mockResolvedValue({
            id: 99,
            status: 'parsed',
            totalClaims: 0,
            originalFilename: 'sample.edi',
          }),
        },
      }),
    ),
  };

  const config = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'EDI_MAX_BYTES') return 10_485_760;
      if (key === 'EDI837_VALIDATION_STRICT') return true;
      return fallback;
    },
  } as ConfigService;

  let service: BatchIngestService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BatchIngestService(
      prisma as never,
      config,
      storage as never,
      structural as never,
      parser as never,
      {} as never,
      { enqueueValidateBatch: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
  });

  it('rejects cross-tenant object keys on complete', async () => {
    const foreignKey = mintEdiObjectKey(1, 2);
    await expect(
      service.completeUploadFromObject({
        typ: 'user',
        role: 'customer',
        tenantId: 9,
        userId: 8,
        objectKey: foreignKey,
        originalFilename: 'sample.edi',
        mimeType: 'application/EDI-X12',
        sizeBytes: 10,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.headObject).not.toHaveBeenCalled();
  });

  it('deletes object when HeadObject size mismatches', async () => {
    const objectKey = mintEdiObjectKey(3, 4);
    storage.headObject.mockResolvedValue({
      exists: true,
      contentType: 'application/EDI-X12',
      contentLength: 99,
    });

    await expect(
      service.completeUploadFromObject({
        typ: 'user',
        role: 'customer',
        tenantId: 3,
        userId: 4,
        objectKey,
        originalFilename: 'sample.edi',
        mimeType: 'application/EDI-X12',
        sizeBytes: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storage.deleteObject).toHaveBeenCalledWith(objectKey);
    expect(prisma.batchFile.create).not.toHaveBeenCalled();
  });

  it('creates BatchFile after HeadObject + validate/parse', async () => {
    const objectKey = mintEdiObjectKey(3, 4);
    const body = Buffer.from('ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECV           *240101*1200*^*00501*000000001*0*P*:~');
    storage.headObject.mockResolvedValue({
      exists: true,
      contentType: 'application/EDI-X12',
      contentLength: body.byteLength,
    });
    storage.getObject.mockResolvedValue(body);

    const batch = await service.completeUploadFromObject({
      typ: 'user',
      role: 'customer',
      tenantId: 3,
      userId: 4,
      objectKey,
      originalFilename: 'sample.edi',
      mimeType: 'application/EDI-X12',
      sizeBytes: body.byteLength,
    });

    expect(prisma.batchFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filePath: objectKey,
          tenantId: 3,
          uploadedById: 4,
          originalFilename: 'sample.edi',
        }),
      }),
    );
    expect(batch.id).toBe(99);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('allows platform staff without tenant (key tenant 0)', async () => {
    storage.getPresignedUploadUrl.mockResolvedValue({
      url: 'http://localhost:9020/neo-scrubber/edi/0/7/x.edi?sig=1',
      objectKey: 'edi/0/7/x.edi',
      expiresIn: 900,
      headers: { 'Content-Type': 'application/EDI-X12' },
    });

    const result = await service.requestUploadUrl({
      typ: 'user',
      role: 'admin',
      tenantId: null,
      userId: 7,
      originalFilename: 'sample.edi',
      mimeType: 'application/EDI-X12',
      sizeBytes: 100,
    });

    expect(result.objectKey).toMatch(/^edi\/0\/7\//);

    await expect(
      service.requestUploadUrl({
        typ: 'user',
        role: 'customer',
        tenantId: null,
        userId: 4,
        originalFilename: 'sample.edi',
        mimeType: 'application/EDI-X12',
        sizeBytes: 100,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('issues upload URL for tenant+user context', async () => {
    storage.getPresignedUploadUrl.mockResolvedValue({
      url: 'http://localhost:9020/neo-scrubber/edi/3/4/x.edi?sig=1',
      objectKey: 'edi/3/4/x.edi',
      expiresIn: 900,
      headers: { 'Content-Type': 'application/EDI-X12' },
    });

    const result = await service.requestUploadUrl({
      typ: 'user',
      role: 'customer',
      tenantId: 3,
      userId: 4,
      originalFilename: 'sample.edi',
      mimeType: 'application/EDI-X12',
      sizeBytes: 100,
    });

    expect(result.url).toContain('localhost:9020');
    expect(result.objectKey).toMatch(/^edi\/3\/4\//);
  });
});
