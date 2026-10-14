export const SupportSource = {
  Public: 'public',
  Portal: 'portal',
} as const;

export type SupportSourceValue =
  (typeof SupportSource)[keyof typeof SupportSource];

export const SupportStatus = {
  Open: 'open',
  InProgress: 'in_progress',
  WaitingForCustomer: 'waiting_for_customer',
  Resolved: 'resolved',
  Closed: 'closed',
} as const;

export type SupportStatusValue =
  (typeof SupportStatus)[keyof typeof SupportStatus];

export const SUPPORT_STATUSES = Object.values(SupportStatus);

export const ALLOWED_STATUS_TRANSITIONS: Record<
  SupportStatusValue,
  SupportStatusValue[]
> = {
  [SupportStatus.Open]: [
    SupportStatus.InProgress,
    SupportStatus.WaitingForCustomer,
    SupportStatus.Resolved,
    SupportStatus.Closed,
  ],
  [SupportStatus.InProgress]: [
    SupportStatus.WaitingForCustomer,
    SupportStatus.Resolved,
    SupportStatus.Closed,
    SupportStatus.Open,
  ],
  [SupportStatus.WaitingForCustomer]: [
    SupportStatus.InProgress,
    SupportStatus.Resolved,
    SupportStatus.Closed,
  ],
  [SupportStatus.Resolved]: [SupportStatus.Closed, SupportStatus.Open],
  [SupportStatus.Closed]: [SupportStatus.Open],
};

/** Public / demo form categories. */
export const PUBLIC_CATEGORIES = [
  'sales_demo',
  'pricing',
  'onboarding',
  'general',
  'other',
] as const;

/** Authenticated portal categories. */
export const PORTAL_CATEGORIES = [
  'bug',
  'technical',
  'claim_validation',
  'batch_processing',
  'account_access',
  'feature_request',
  'other',
] as const;

export type PublicCategory = (typeof PUBLIC_CATEGORIES)[number];
export type PortalCategory = (typeof PORTAL_CATEGORIES)[number];

export const SALES_DEMO_CATEGORY = 'sales_demo';

export const EmailNotifyStatus = {
  Sent: 'sent',
  Failed: 'failed',
  Skipped: 'skipped',
} as const;

export const AuthorType = {
  Customer: 'customer',
  Staff: 'staff',
  System: 'system',
} as const;

export const INQUIRY_ATTACHMENT_PREFIX = 'inquiries';

export const INQUIRY_ALLOWED_EXTENSIONS = [
  '.edi',
  '.x12',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
] as const;

export const INQUIRY_ALLOWED_MIME_TYPES = [
  'application/edi-x12',
  'text/plain',
  'application/octet-stream',
  'image/png',
  'image/jpeg',
] as const;

export function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    sales_demo: 'Sales / Demo Request',
    pricing: 'Pricing',
    onboarding: 'Onboarding / Getting Started',
    general: 'General Inquiry',
    other: 'Other',
    bug: 'Bug Report',
    technical: 'Technical Issue',
    claim_validation: 'Claim Validation Question',
    batch_processing: 'Batch Processing Issue',
    account_access: 'Account / Access Issue',
    feature_request: 'Feature Request',
  };
  return labels[category] ?? category;
}
