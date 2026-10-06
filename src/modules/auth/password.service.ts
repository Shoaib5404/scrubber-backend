import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';
import { Injectable } from '@nestjs/common';

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  /** Verify Laravel bcrypt or Nest argon2 password hashes. */
  async verifyPassword(plain: string, stored: string): Promise<boolean> {
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
      return bcrypt.compare(plain, stored);
    }
    if (stored.startsWith('$argon2')) {
      return argon2.verify(stored, plain);
    }
    return false;
  }

  async hashSecret(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  /**
   * ApiClient secret verify — mirrors Laravel `ApiClient::secretMatches`
   * (legacy bcrypt, argon2, or plaintext equality for encrypted-port paths).
   */
  async verifySecret(plain: string, stored: string): Promise<boolean> {
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
      return bcrypt.compare(plain, stored);
    }
    if (stored.startsWith('$argon2')) {
      return argon2.verify(stored, plain);
    }
    const a = Buffer.from(plain);
    const b = Buffer.from(stored);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  }

  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }
}
