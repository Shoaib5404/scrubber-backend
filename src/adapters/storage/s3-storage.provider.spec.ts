import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3StorageProvider } from './s3-storage.provider';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('http://localhost:9020/neo-scrubber/edi/1/2/a.edi?X-Amz-Signature=test'),
}));

describe('S3StorageProvider', () => {
  it('puts objects with bucket and sanitized key', async () => {
    const send = jest.fn().mockResolvedValue({});
    const client = { send } as never;
    const provider = new S3StorageProvider(
      {
        bucket: 'neo-scrubber',
        accessKey: 'k',
        secretKey: 's',
        region: 'us-east-1',
        forcePathStyle: true,
        endpoint: 'http://localhost:9020',
      },
      client,
    );

    const stored = await provider.putObject(
      'edi/1/2/a.edi',
      Buffer.from('ISA*'),
      'application/EDI-X12',
    );
    expect(stored).toEqual({ key: 'edi/1/2/a.edi', bucket: 'neo-scrubber' });
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0] as PutObjectCommand;
    expect(cmd.input.Bucket).toBe('neo-scrubber');
    expect(cmd.input.Key).toBe('edi/1/2/a.edi');
    expect(cmd.input.ContentType).toBe('application/EDI-X12');
  });

  it('maps NoSuchKey on get to NotFoundException', async () => {
    const send = jest.fn().mockRejectedValue({ name: 'NoSuchKey' });
    const provider = new S3StorageProvider(
      {
        bucket: 'neo-scrubber',
        accessKey: 'k',
        secretKey: 's',
        region: 'us-east-1',
        forcePathStyle: true,
      },
      { send } as never,
    );

    await expect(provider.getObject('edi/1/2/missing.edi')).rejects.toThrow(
      /Storage object not found/,
    );
  });

  it('heads existing and missing objects', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        ContentType: 'application/EDI-X12',
        ContentLength: 42,
      })
      .mockRejectedValueOnce({ name: 'NotFound', $metadata: { httpStatusCode: 404 } });
    const provider = new S3StorageProvider(
      {
        bucket: 'neo-scrubber',
        accessKey: 'k',
        secretKey: 's',
        region: 'us-east-1',
        forcePathStyle: true,
      },
      { send } as never,
    );

    await expect(provider.headObject('edi/1/2/a.edi')).resolves.toEqual({
      exists: true,
      contentType: 'application/EDI-X12',
      contentLength: 42,
    });
    await expect(provider.headObject('edi/1/2/missing.edi')).resolves.toEqual({
      exists: false,
    });
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('signs upload URLs with the signing client', async () => {
    const send = jest.fn();
    const signingSend = jest.fn();
    const provider = new S3StorageProvider(
      {
        bucket: 'neo-scrubber',
        accessKey: 'k',
        secretKey: 's',
        region: 'us-east-1',
        forcePathStyle: true,
        endpoint: 'http://minio:9000',
        publicEndpoint: 'http://localhost:9020',
        presignTtlSeconds: 300,
      },
      { send } as never,
      { send: signingSend } as never,
    );

    const signed = await provider.getPresignedUploadUrl({
      objectKey: 'edi/1/2/a.edi',
      mimeType: 'application/EDI-X12',
      maxSizeBytes: 1000,
    });

    expect(signed.objectKey).toBe('edi/1/2/a.edi');
    expect(signed.expiresIn).toBe(300);
    expect(signed.headers?.['Content-Type']).toBe('application/EDI-X12');
    expect(getSignedUrl).toHaveBeenCalled();
    expect(signed.url).toContain('localhost:9020');
  });
});
