import { PutObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageProvider } from './s3-storage.provider';

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
      'edi_files/a.edi',
      Buffer.from('ISA*'),
      'application/EDI-X12',
    );
    expect(stored).toEqual({ key: 'edi_files/a.edi', bucket: 'neo-scrubber' });
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0] as PutObjectCommand;
    expect(cmd.input.Bucket).toBe('neo-scrubber');
    expect(cmd.input.Key).toBe('edi_files/a.edi');
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

    await expect(provider.getObject('edi_files/missing.edi')).rejects.toThrow(
      /Storage object not found/,
    );
  });
});
