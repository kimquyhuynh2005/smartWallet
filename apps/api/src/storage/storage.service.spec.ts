import { S3StorageService, UnconfiguredStorageService } from './storage.service';

describe('TXN-01 receipt storage', () => {
  const saved = { ...process.env };
  beforeAll(() => {
    process.env.S3_BUCKET = 'sw-receipts';
    process.env.S3_REGION = 'ap-southeast-1';
    process.env.S3_ACCESS_KEY_ID = 'AKIATESTTESTTESTTEST';
    process.env.S3_SECRET_ACCESS_KEY = 'secretsecretsecretsecretsecretsecret00';
  });
  afterAll(() => { process.env = saved; });

  it('creates a pre-signed POST whose policy caps the size at 5 MB and pins key + content type (computed offline)', async () => {
    const s3 = new S3StorageService();
    const t = await s3.createUploadTicket('receipts/u1/a.png', 'image/png', 5 * 1024 * 1024, 300);
    expect(t.url).toContain('sw-receipts');
    expect(t.fields.key).toBe('receipts/u1/a.png');
    expect(t.fields['Content-Type']).toBe('image/png');
    expect(t.fields['X-Amz-Signature']).toBeTruthy();
    const policy = JSON.parse(Buffer.from(t.fields.Policy, 'base64').toString());
    expect(policy.conditions).toEqual(expect.arrayContaining([['content-length-range', 1, 5 * 1024 * 1024], ['eq', '$Content-Type', 'image/png']]));
    expect(new Date(policy.expiration).getTime() - Date.now()).toBeLessThan(310_000);
  });

  it('reads use short-lived signed GET urls (the bucket stays private)', async () => {
    const url = await new S3StorageService().getDownloadUrl('receipts/u1/a.png', 120);
    expect(url).toContain('X-Amz-Signature=');
    expect(url).toContain('X-Amz-Expires=120');
  });

  it('without S3_BUCKET uploads answer 501 STORAGE_NOT_CONFIGURED and reads return null', async () => {
    const s = new UnconfiguredStorageService();
    expect(s.isConfigured()).toBe(false);
    await expect(s.createUploadTicket()).rejects.toMatchObject({ status: 501, response: { code: 'STORAGE_NOT_CONFIGURED' } });
    expect(await s.getDownloadUrl()).toBeNull();
  });
});
