import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { ApiClientIssuerService } from './api-client-issuer.service';

interface ApiClientCreateOptions {
  name?: string;
}

/**
 * Laravel `App\Console\Commands\CreateApiClient` (`api-client:create`).
 *
 * Nest deviation: the secret is hashed via `PasswordService.hashSecret` before storage (see
 * `ApiClientIssuerService` docblock) — Laravel historically stored the plaintext secret
 * (encrypted-at-rest, compared via `hash_equals`); Nest's token-exchange path verifies
 * hashed secrets, so this command must hash or every issued client would be unusable.
 */
@Command({
  name: 'api-client:create',
  arguments: '<user>',
  description: 'Create client_id + client_secret for a customer user',
  argsDescription: {
    user: 'Customer user ID or email',
  },
})
export class ApiClientCreateCommand extends CommandRunner {
  private readonly logger = new Logger(ApiClientCreateCommand.name);

  constructor(private readonly issuer: ApiClientIssuerService) {
    super();
  }

  async run(passedParams: string[], options: ApiClientCreateOptions): Promise<void> {
    const userKey = passedParams[0];
    if (!userKey) {
      this.logger.error('Usage: api-client:create <user id or email> [--name=Production]');
      process.exitCode = 1;
      return;
    }

    try {
      const issued = await this.issuer.issueForCustomer(userKey, options.name ?? 'Production');
      this.logger.log('API client created. Store the secret securely — it will not be shown again.');
      this.logger.log(`User: ${issued.user?.email}`);
      this.logger.log(`Name: ${issued.client.name}`);
      this.logger.log(`Client ID: ${issued.client.clientId}`);
      this.logger.log(`Client Secret: ${issued.plainSecret}`);
    } catch (e) {
      this.logger.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '--name [name]',
    description: 'Display name for the API client',
    defaultValue: 'Production',
  })
  parseName(val: string): string {
    return val;
  }
}
