import { PrismaService } from '../../../common/prisma/prisma.service';
import { ClaimIssue } from '../types';

const PREFIX_LENGTH = 3;
export const BCBS_001 = 'BCBS-001';

/** Laravel BcbsClaimRoutingRules — DB path (Redis cache = SP-5). */
export async function validateBcbsClaimRouting(
  prisma: PrismaService,
  claim: { subscriberMemberId: string | null; payerId: string | null },
): Promise<ClaimIssue[]> {
  const memberId = String(claim.subscriberMemberId ?? '');
  if (memberId === '' || memberId.length < PREFIX_LENGTH) return [];

  const prefix = memberId.slice(0, PREFIX_LENGTH);
  const routings = await prisma.bcbsClaimRouting.findMany({
    where: { prefix, isActive: true },
  });
  if (routings.length === 0) return [];

  const claimPayerId = String(claim.payerId ?? '').trim();
  if (claimPayerId !== '' && routings.some((r) => r.payerId.trim() === claimPayerId)) {
    return [];
  }

  const payerIds = [...new Set(routings.map((r) => r.payerId))];
  const message =
    payerIds.length === 1
      ? `Member belong to payer ID ${payerIds[0]}. It is advise to correct to submit the claim to correct payer ID.`
      : `Member belong to payer ID in (${payerIds.join(', ')}). It is advise to correct to submit the claim to correct payer ID.`;

  return [
    {
      rule: BCBS_001,
      field: 'payer_id',
      message,
      severity: 'error',
    },
  ];
}
