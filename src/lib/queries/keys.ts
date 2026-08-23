/**
 * Query key factory. One place to look when invalidating, so a mutation never
 * has to guess the shape of a key it did not create.
 */
export const qk = {
  profile: ['profile'] as const,
  categories: ['categories'] as const,
  incomeSources: ['income-sources'] as const,

  ledger: (filters: unknown) => ['ledger', filters] as const,
  ledgerAll: ['ledger'] as const,
  expense: (id: string) => ['expense', id] as const,

  budgets: ['budgets'] as const,
  budgetProgress: (month: string) => ['budget-progress', month] as const,

  debts: ['debts'] as const,
  debt: (id: string) => ['debt', id] as const,

  alertSettings: ['alert-settings'] as const,
  notifications: ['notifications'] as const,

  quota: ['ai-quota'] as const,
  chat: ['chat-messages'] as const,

  statements: ['statements'] as const,
  statementResult: (id: string) => ['statement-result', id] as const,
  ocrScans: ['ocr-scans'] as const,

  tickets: ['tickets'] as const,
  ticket: (id: string) => ['ticket', id] as const,

  contentPages: ['content-pages'] as const,
  contentPage: (slug: string) => ['content-page', slug] as const,
  termsAcceptance: ['terms-acceptance'] as const,
  featureFlags: ['feature-flags'] as const,

  admin: {
    overview: ['admin', 'overview'] as const,
    users: ['admin', 'users'] as const,
    user: (id: string) => ['admin', 'user', id] as const,
    providers: ['admin', 'providers'] as const,
    aiDashboard: ['admin', 'ai-dashboard'] as const,
    ocrDashboard: ['admin', 'ocr-dashboard'] as const,
    tickets: ['admin', 'tickets'] as const,
    rolePermissions: ['admin', 'role-permissions'] as const,
    auditLog: ['admin', 'audit-log'] as const,
    services: ['admin', 'services'] as const,
    systemAlerts: ['admin', 'system-alerts'] as const,
    privacyRequests: ['admin', 'privacy-requests'] as const,
  },
};
