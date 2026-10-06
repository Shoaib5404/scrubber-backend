import { hashSync } from 'bcryptjs';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('verifies bcrypt and argon2 password hashes', async () => {
    const bcryptHash = hashSync('password', 4);
    expect(await service.verifyPassword('password', bcryptHash)).toBe(true);
    expect(await service.verifyPassword('wrong', bcryptHash)).toBe(false);

    const argon = await service.hashPassword('secret-value');
    expect(argon.startsWith('$argon2')).toBe(true);
    expect(await service.verifyPassword('secret-value', argon)).toBe(true);
    expect(await service.verifyPassword('wrong', argon)).toBe(false);
  });

  it('verifies api client secrets (argon2 + plaintext)', async () => {
    const hashed = await service.hashSecret('client-secret');
    expect(await service.verifySecret('client-secret', hashed)).toBe(true);
    expect(await service.verifySecret('client-secret', 'client-secret')).toBe(true);
    expect(await service.verifySecret('nope', 'client-secret')).toBe(false);
  });
});
