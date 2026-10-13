import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalStorageProvider } from './local-storage.provider';

describe('LocalStorageProvider', () => {
  let root: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'scrubber-local-storage-'));
    provider = new LocalStorageProvider(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round-trips put/get/delete under root', async () => {
    await provider.putObject('edi_files/sample.edi', Buffer.from('ISA*00*'));
    const buf = await provider.getObject('edi_files/sample.edi');
    expect(buf.toString('utf8')).toBe('ISA*00*');
    await provider.deleteObject('edi_files/sample.edi');
    await expect(provider.getObject('edi_files/sample.edi')).rejects.toThrow(
      /Storage object not found/,
    );
  });

  it('rejects keys that would escape the root', async () => {
    await expect(provider.putObject('../outside.edi', Buffer.from('x'))).rejects.toThrow();
  });

  it('ignores delete of missing objects', async () => {
    await expect(provider.deleteObject('edi_files/missing.edi')).resolves.toBeUndefined();
  });

  it('reads existing files written under root', async () => {
    const dir = join(root, 'edi_files');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'seed.edi'), 'SEED');
    const buf = await provider.getObject('edi_files/seed.edi');
    expect(buf.toString('utf8')).toBe('SEED');
  });

  it('heads local objects and rejects presign', async () => {
    await provider.putObject('edi/1/2/a.edi', Buffer.from('ISA*'));
    await expect(provider.headObject('edi/1/2/a.edi')).resolves.toMatchObject({
      exists: true,
      contentLength: 4,
    });
    await expect(provider.headObject('edi/1/2/missing.edi')).resolves.toEqual({
      exists: false,
    });
    await expect(
      provider.getPresignedUploadUrl({
        objectKey: 'edi/1/2/a.edi',
        mimeType: 'application/EDI-X12',
        maxSizeBytes: 100,
      }),
    ).rejects.toThrow(/STORAGE_DRIVER=s3/);
  });
});
