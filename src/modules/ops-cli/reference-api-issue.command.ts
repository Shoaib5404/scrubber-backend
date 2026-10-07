import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { ApiScope } from '../auth/auth.constants';
import { ApiClientIssuerService } from './api-client-issuer.service';

interface ReferenceApiIssueOptions {
  scopes?: string[];
}

/**
 * Laravel `App\Console\Commands\IssueReferenceApiClient` (`reference-api:issue`).
 *
 * Nest deviation: same hashed-secret requirement as `api-client:create` — see
 * `ApiClientIssuerService` docblock.
 */
@Command({
  name: 'reference-api:issue',
  arguments: '[name]',
  description: 'Create a machine API client (user_id null) and print client_id + client_secret once',
  argsDescription: {
    name: 'Client display name (default: Tele-Wound)',
  },
})
export class ReferenceApiIssueCommand extends CommandRunner {
  private readonly logger = new Logger(ReferenceApiIssueCommand.name);

  constructor(private readonly issuer: ApiClientIssuerService) {
    super();
  }

  async run(passedParams: string[], options: ReferenceApiIssueOptions): Promise<void> {
    const name = passedParams[0] ?? 'Tele-Wound';
    const scopes: string[] =
      options.scopes && options.scopes.length > 0
        ? [...new Set(options.scopes)]
        : [ApiScope.ReferenceRead];

    const issued = await this.issuer.issueService(name, scopes);

    this.logger.log('API client created. Store the secret now; it cannot be retrieved later.');
    this.logger.log(`name: ${issued.client.name}`);
    this.logger.log(`client_id: ${issued.client.clientId}`);
    this.logger.log(`client_secret: ${issued.plainSecret}`);
    this.logger.log(`scopes: ${issued.client.scopes.join(', ')}`);
  }

  /** Repeatable: `--scopes reference:read --scopes batches:read`. Defaults to [reference:read]. */
  @Option({
    flags: '--scopes <scope>',
    description: 'Sanctum-equivalent scope; repeat flag for multiple. Defaults to reference:read',
  })
  parseScopes(val: string, previous: string[] = []): string[] {
    return [...previous, val];
  }
}
