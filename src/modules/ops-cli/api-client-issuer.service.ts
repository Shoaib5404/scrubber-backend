import { randomInt } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { DEFAULT_CUSTOMER_SCOPES, UserRole } from '../auth/auth.constants';

const CLIENT_ID_PREFIX = 'ns_live_';
const CLIENT_ID_RANDOM_LENGTH = 24;
const PLAIN_SECRET_LENGTH = 48;
/** Laravel `Str::lower(Str::random(24))` — lowercase alnum once folded. */
const CLIENT_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Laravel `Str::random(48)` default alphabet. */
const SECRET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomString(length: number, alphabet: string): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

export type IssuedApiClient = {
  client: {
    id: number;
    clientId: string;
    name: string;
    userId: number | null;
    scopes: string[];
  };
  plainSecret: string;
  /** Present only for issueForCustomer (owner lookup). */
  user?: { id: number; email: string; name: string };
};

/**
 * Laravel `App\Models\ApiClient::issueFor` / `issueService` — issuance helper shared by
 * `api-client:create` and `reference-api:issue`.
 *
 * Nest deviation (documented per SP-8 Task 19 group 10): Laravel stores `client_secret`
 * encrypted-at-rest (`SafeEncryptedString` cast) and compares plaintext via
 * `hash_equals`/legacy bcrypt. Nest's `AuthService.issueApiClientToken` verifies secrets with
 * `PasswordService.verifySecret` (argon2/bcrypt/timing-safe-equal) — so this issuer MUST hash
 * the plain secret with `PasswordService.hashSecret` before persisting, or every Nest-issued
 * client would fail verification at token-exchange time. The plaintext secret is only ever
 * returned once in-memory to the caller (CLI stdout), never persisted.
 */
@Injectable()
export class ApiClientIssuerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  static generateClientId(): string {
    return `${CLIENT_ID_PREFIX}${randomString(CLIENT_ID_RANDOM_LENGTH, CLIENT_ID_ALPHABET)}`;
  }

  static generatePlainSecret(): string {
    return randomString(PLAIN_SECRET_LENGTH, SECRET_ALPHABET);
  }

  /**
   * Laravel `ApiClient::issueFor` (CreateApiClient command) — one API client per Customer
   * user. `userKey` is a numeric user id or an email (Laravel `is_numeric($userKey)` branch).
   */
  async issueForCustomer(userKey: string, name: string): Promise<IssuedApiClient> {
    const user = await this.findUserByIdOrEmail(userKey);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (user.role !== UserRole.Customer) {
      throw new BadRequestException('API clients can only be created for Customer users.');
    }

    const existing = await this.prisma.apiClient.findUnique({ where: { userId: user.id } });
    if (existing) {
      throw new ConflictException(
        'This customer already has API credentials. Rotate or revoke them in the admin UI.',
      );
    }

    const plainSecret = ApiClientIssuerService.generatePlainSecret();
    const hashedSecret = await this.passwords.hashSecret(plainSecret);
    const scopes = [...DEFAULT_CUSTOMER_SCOPES] as string[];

    const client = await this.prisma.apiClient.create({
      data: {
        userId: user.id,
        name,
        clientId: ApiClientIssuerService.generateClientId(),
        clientSecret: hashedSecret,
        isActive: true,
        scopes,
      },
    });

    return {
      client: {
        id: client.id,
        clientId: client.clientId,
        name: client.name,
        userId: client.userId,
        scopes,
      },
      plainSecret,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  /**
   * Laravel `ApiClient::issueService` (IssueReferenceApiClient command) — machine-to-machine
   * client, `user_id` null, no "one per owner" uniqueness check (service clients are
   * many-to-none by design).
   */
  async issueService(name: string, scopes: string[]): Promise<IssuedApiClient> {
    const plainSecret = ApiClientIssuerService.generatePlainSecret();
    const hashedSecret = await this.passwords.hashSecret(plainSecret);

    const client = await this.prisma.apiClient.create({
      data: {
        userId: null,
        name,
        clientId: ApiClientIssuerService.generateClientId(),
        clientSecret: hashedSecret,
        isActive: true,
        scopes,
      },
    });

    return {
      client: {
        id: client.id,
        clientId: client.clientId,
        name: client.name,
        userId: client.userId,
        scopes,
      },
      plainSecret,
    };
  }

  /** Laravel ApiClient::rotateSecret — new secret only; Nest has no Sanctum tokens to delete. */
  async rotateSecret(apiClientId: number): Promise<IssuedApiClient> {
    const existing = await this.prisma.apiClient.findUnique({ where: { id: apiClientId } });
    if (!existing) {
      throw new NotFoundException('API client not found.');
    }
    const plainSecret = ApiClientIssuerService.generatePlainSecret();
    const hashedSecret = await this.passwords.hashSecret(plainSecret);
    const client = await this.prisma.apiClient.update({
      where: { id: apiClientId },
      data: { clientSecret: hashedSecret },
    });
    return this.toIssued(client, plainSecret);
  }

  /** Laravel ApiClient::reissue — new client_id + secret; reactivate. */
  async reissue(apiClientId: number, name?: string | null): Promise<IssuedApiClient> {
    const existing = await this.prisma.apiClient.findUnique({ where: { id: apiClientId } });
    if (!existing) {
      throw new NotFoundException('API client not found.');
    }
    const plainSecret = ApiClientIssuerService.generatePlainSecret();
    const hashedSecret = await this.passwords.hashSecret(plainSecret);
    const client = await this.prisma.apiClient.update({
      where: { id: apiClientId },
      data: {
        name: name && name.trim() !== '' ? name.trim() : existing.name,
        clientId: ApiClientIssuerService.generateClientId(),
        clientSecret: hashedSecret,
        isActive: true,
        lastUsedAt: null,
      },
    });
    return this.toIssued(client, plainSecret);
  }

  /** Laravel ApiClient::revoke */
  async revoke(apiClientId: number): Promise<void> {
    const existing = await this.prisma.apiClient.findUnique({ where: { id: apiClientId } });
    if (!existing) {
      throw new NotFoundException('API client not found.');
    }
    await this.prisma.apiClient.update({
      where: { id: apiClientId },
      data: { isActive: false },
    });
  }

  private toIssued(
    client: {
      id: number;
      clientId: string;
      name: string;
      userId: number | null;
      scopes: unknown;
    },
    plainSecret: string,
  ): IssuedApiClient {
    const scopes = Array.isArray(client.scopes)
      ? (client.scopes as string[])
      : client.scopes && typeof client.scopes === 'object'
        ? Object.values(client.scopes as Record<string, string>)
        : [];
    return {
      client: {
        id: client.id,
        clientId: client.clientId,
        name: client.name,
        userId: client.userId,
        scopes,
      },
      plainSecret,
    };
  }

  private async findUserByIdOrEmail(userKey: string) {
    if (/^\d+$/.test(userKey)) {
      return this.prisma.user.findUnique({ where: { id: Number(userKey) } });
    }
    return this.prisma.user.findUnique({ where: { email: userKey } });
  }
}
