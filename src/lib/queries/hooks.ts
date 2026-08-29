'use client';

/**
 * Every screen reads through these hooks. No component imports fixtures
 * directly — that rule is what makes Phase 3 a swap of `api` for Supabase
 * rather than a rewrite of the UI.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import { api, type LedgerFilters } from '@/lib/api';
import { qk } from '@/lib/queries/keys';
import type { Tables } from '@/lib/supabase/types';

// ---------------------------------------------------------------- reads ----

export const useProfile = () =>
  useQuery({ queryKey: qk.profile, queryFn: () => api.getProfile() });

export const useCategories = () =>
  useQuery({ queryKey: qk.categories, queryFn: () => api.listCategories() });

export const useIncomeSources = () =>
  useQuery({ queryKey: qk.incomeSources, queryFn: () => api.listIncomeSources() });

export const useLedger = (filters: LedgerFilters) =>
  useQuery({ queryKey: qk.ledger(filters), queryFn: () => api.listLedger(filters) });

export const useExpense = (id: string) =>
  useQuery({ queryKey: qk.expense(id), queryFn: () => api.getExpense(id), enabled: !!id });

export const useBudgets = () =>
  useQuery({ queryKey: qk.budgets, queryFn: () => api.listBudgets() });

/** Recomputed on every fetch — deliberately never persisted (PRD 6.9). */
export const useBudgetProgress = (month: string) =>
  useQuery({
    queryKey: qk.budgetProgress(month),
    queryFn: () => api.budgetProgress(month),
  });

/**
 * Server-side monthly and category totals for a date range.
 *
 * The income-against-spending trend uses this rather than reading the ledger,
 * because its longest range is two years. Pulling every row to sum it in the
 * browser would both transfer far more than needed and silently truncate at
 * the page size, which would show a wrong total rather than a slow one.
 */
export const useAnalyticsRollup = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: qk.analyticsRollup(from, to),
    queryFn: () => api.analyticsRollup(from, to),
    enabled,
  });

export const useDebts = () =>
  useQuery({ queryKey: qk.debts, queryFn: () => api.listDebts() });

export const useDebt = (id: string) =>
  useQuery({ queryKey: qk.debt(id), queryFn: () => api.getDebt(id), enabled: !!id });

export const useAlertSettings = () =>
  useQuery({ queryKey: qk.alertSettings, queryFn: () => api.listAlertSettings() });

/**
 * Asks the server to raise any alerts that have fallen due before reading the
 * feed, so a reminder appears the first time the user looks rather than the
 * time after. `refreshDueAlerts` is idempotent, and a failure there must not
 * cost the user their existing alerts — so it is allowed to fail quietly and
 * the read proceeds either way.
 */
export const useNotifications = () =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: async () => {
      await api.refreshDueAlerts().catch(() => undefined);
      return api.listNotifications();
    },
  });

export const useQuota = () =>
  useQuery({ queryKey: qk.quota, queryFn: () => api.quotaStatus() });

export const useChatMessages = () =>
  useQuery({ queryKey: qk.chat, queryFn: () => api.listChatMessages() });

export const useStatements = () =>
  useQuery({ queryKey: qk.statements, queryFn: () => api.listStatements() });

export const useStatementResult = (id: string) =>
  useQuery({
    queryKey: qk.statementResult(id),
    queryFn: () => api.getStatementResult(id),
    enabled: !!id,
  });

export const useOcrScans = () =>
  useQuery({ queryKey: qk.ocrScans, queryFn: () => api.listOcrScans() });

export const useTickets = () =>
  useQuery({ queryKey: qk.tickets, queryFn: () => api.listTickets() });

export const useTicket = (id: string) =>
  useQuery({ queryKey: qk.ticket(id), queryFn: () => api.getTicket(id), enabled: !!id });

export const useContentPages = () =>
  useQuery({ queryKey: qk.contentPages, queryFn: () => api.listContentPages() });

export const useContentPage = (slug: string) =>
  useQuery({ queryKey: qk.contentPage(slug), queryFn: () => api.getContentPage(slug) });

export const useTermsAcceptance = () =>
  useQuery({ queryKey: qk.termsAcceptance, queryFn: () => api.listTermsAcceptance() });

export const useFeatureFlags = () =>
  useQuery({ queryKey: qk.featureFlags, queryFn: () => api.listFeatureFlags() });

/** Convenience: PRD 6.10 is deferred, so this drives the Coming Soon screen. */
export function useFeatureFlag(key: string): boolean {
  const { data } = useFeatureFlags();
  return data?.find((f) => f.key === key)?.enabled ?? false;
}

// ------------------------------------------------------------ mutations ----

/** Wraps useMutation so every mutation invalidates the keys it affects. */
function useInvalidatingMutation<TData, TVars>(
  fn: (vars: TVars) => Promise<TData>,
  invalidate: readonly (readonly unknown[])[],
  options?: Omit<UseMutationOptions<TData, Error, TVars>, 'mutationFn'>,
) {
  const qc = useQueryClient();
  const { onSuccess, ...rest } = options ?? {};
  type SuccessArgs = Parameters<
    NonNullable<UseMutationOptions<TData, Error, TVars>['onSuccess']>
  >;
  return useMutation<TData, Error, TVars>({
    mutationFn: fn,
    ...rest,
    // Spread rather than a fixed arity: the callback signature has changed
    // between TanStack Query minors and this stays correct across them.
    onSuccess: (...args: SuccessArgs) => {
      invalidate.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      return onSuccess?.(...args);
    },
  });
}

export const useUpdateProfile = () =>
  useInvalidatingMutation(
    (patch: Partial<Tables<'profiles'>>) => api.updateProfile(patch),
    [qk.profile],
  );

export const useCreateIncomeSource = () =>
  useInvalidatingMutation(
    (input: {
      source_name: string;
      amount: number;
      frequency: 'one_time' | 'monthly';
      received_or_start_date: string;
    }) => api.createIncomeSource(input),
    [qk.incomeSources],
  );

export const useDeleteIncomeSource = () =>
  useInvalidatingMutation((id: string) => api.deleteIncomeSource(id), [qk.incomeSources]);

export const useCreateExpense = () =>
  useInvalidatingMutation(
    (input: {
      merchant: string;
      amount: number;
      expense_date: string;
      category_id: string | null;
      notes?: string | null;
      source: 'ocr' | 'manual';
    }) => api.createExpense(input),
    // Budget progress is derived from the ledger, so it must refetch too.
    [qk.ledgerAll, ['budget-progress']],
  );

export const useUpdateExpense = () =>
  useInvalidatingMutation(
    ({ id, patch }: { id: string; patch: Partial<Tables<'expense_ledger'>> }) =>
      api.updateExpense(id, patch),
    [qk.ledgerAll, ['expense'], ['budget-progress']],
  );

export const useDeleteExpense = () =>
  useInvalidatingMutation((id: string) => api.deleteExpense(id), [
    qk.ledgerAll,
    ['budget-progress'],
  ]);

export const useUpsertBudget = () =>
  useInvalidatingMutation(
    (input: { id?: string; category_id: string; monthly_cap: number }) =>
      api.upsertBudget(input),
    [qk.budgets, ['budget-progress']],
  );

export const useDeleteBudget = () =>
  useInvalidatingMutation((id: string) => api.deleteBudget(id), [
    qk.budgets,
    ['budget-progress'],
  ]);

export const useCreateDebt = () =>
  useInvalidatingMutation(
    (input: Omit<Tables<'debts'>, 'id' | 'user_id' | 'created_at' | 'updated_at'>) =>
      api.createDebt(input),
    [qk.debts],
  );

export const useUpdateDebt = () =>
  useInvalidatingMutation(
    ({ id, patch }: { id: string; patch: Partial<Tables<'debts'>> }) =>
      api.updateDebt(id, patch),
    [qk.debts, ['debt']],
  );

export const useDeleteDebt = () =>
  useInvalidatingMutation((id: string) => api.deleteDebt(id), [qk.debts]);

export const useUpsertAlertSetting = () =>
  useInvalidatingMutation(
    (input: { alert_type: string; threshold_value: number | null; enabled: boolean }) =>
      api.upsertAlertSetting(input),
    [qk.alertSettings],
  );

export const useMarkNotificationRead = () =>
  useInvalidatingMutation((id: string) => api.markNotificationRead(id), [
    qk.notifications,
  ]);

export const useDismissNotification = () =>
  useInvalidatingMutation((id: string) => api.dismissNotification(id), [
    qk.notifications,
  ]);

/** Consumes the shared weekly AI allowance, so the quota must refetch. */
export const useSendChatMessage = () =>
  useInvalidatingMutation((message: string) => api.sendChatMessage(message), [
    qk.chat,
    qk.quota,
  ]);

/** Also consumes the SAME shared allowance. */
export const useLoanSuggestion = () =>
  useInvalidatingMutation((_: void) => api.loanSuggestion(), [qk.quota]);

export const useProcessReceipt = () =>
  useInvalidatingMutation((file: File) => api.processReceipt(file), [qk.ocrScans]);

export const useProcessStatement = () =>
  useInvalidatingMutation((file: File) => api.processStatement(file), [qk.statements]);

export const useCreateTicket = () =>
  useInvalidatingMutation(
    (input: {
      category: string;
      priority: 'low' | 'medium' | 'high';
      subject: string;
      body: string;
    }) => api.createTicket(input),
    [qk.tickets],
  );

export const useReplyToTicket = () =>
  useInvalidatingMutation(
    ({ ticketId, body }: { ticketId: string; body: string }) =>
      api.replyToTicket(ticketId, body),
    [['ticket'], qk.tickets],
  );

export const useCloseTicket = () =>
  useInvalidatingMutation((ticketId: string) => api.closeTicket(ticketId), [
    ['ticket'],
    qk.tickets,
  ]);

export const useAcceptTerms = () =>
  useInvalidatingMutation(
    ({ contentId, version }: { contentId: string; version: number }) =>
      api.acceptTerms(contentId, version),
    [qk.termsAcceptance],
  );

// ------------------------------------------------------------- admin -------

export const useAdminOverview = () =>
  useQuery({ queryKey: qk.admin.overview, queryFn: () => api.adminOverview() });

export const useAdminUsers = () =>
  useQuery({ queryKey: qk.admin.users, queryFn: () => api.adminListUsers() });

export const useAdminUser = (id: string) =>
  useQuery({
    queryKey: qk.admin.user(id),
    queryFn: () => api.adminGetUser(id),
    enabled: !!id,
  });

export const useAdminSetBlocked = () =>
  useInvalidatingMutation(
    ({ id, blocked }: { id: string; blocked: boolean }) => api.adminSetBlocked(id, blocked),
    [qk.admin.users, ['admin', 'user'], qk.admin.auditLog, qk.admin.overview],
  );

export const useAdminSoftDeleteUser = () =>
  useInvalidatingMutation((id: string) => api.adminSoftDeleteUser(id), [
    qk.admin.users,
    ['admin', 'user'],
    qk.admin.auditLog,
    qk.admin.overview,
  ]);

export const useAdminProviders = () =>
  useQuery({ queryKey: qk.admin.providers, queryFn: () => api.adminListProviders() });

export const useAdminSetProviderKey = () =>
  useInvalidatingMutation(
    ({ configId, apiKey }: { configId: string; apiKey: string }) =>
      api.adminSetProviderKey(configId, apiKey),
    [qk.admin.providers, qk.admin.auditLog],
  );

export const useAdminDeleteProviderKey = () =>
  useInvalidatingMutation((configId: string) => api.adminDeleteProviderKey(configId), [
    qk.admin.providers,
  ]);

export const useAdminSetActiveProvider = () =>
  useInvalidatingMutation((configId: string) => api.adminSetActiveProvider(configId), [
    qk.admin.providers,
  ]);

export const useAdminSetProviderLimits = () =>
  useInvalidatingMutation(
    ({
      configId,
      patch,
    }: {
      configId: string;
      patch: { is_enabled?: boolean; monthly_usage_limit?: number | null };
    }) => api.adminSetProviderLimits(configId, patch),
    [qk.admin.providers],
  );

export const useAdminAiDashboard = () =>
  useQuery({ queryKey: qk.admin.aiDashboard, queryFn: () => api.adminAiDashboard() });

export const useAdminOcrDashboard = () =>
  useQuery({ queryKey: qk.admin.ocrDashboard, queryFn: () => api.adminOcrDashboard() });

export const useAdminTickets = () =>
  useQuery({ queryKey: qk.admin.tickets, queryFn: () => api.adminListTickets() });

export const useAdminRolePermissions = () =>
  useQuery({
    queryKey: qk.admin.rolePermissions,
    queryFn: () => api.adminListRolePermissions(),
  });

export const useAdminToggleRolePermission = () =>
  useInvalidatingMutation(
    ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.adminToggleRolePermission(id, enabled),
    [qk.admin.rolePermissions],
  );

export const useAdminAuditLog = () =>
  useQuery({ queryKey: qk.admin.auditLog, queryFn: () => api.adminListAuditLog() });

export const useAdminServices = () =>
  useQuery({ queryKey: qk.admin.services, queryFn: () => api.adminListServiceStatus() });

export const useAdminSystemAlerts = () =>
  useQuery({ queryKey: qk.admin.systemAlerts, queryFn: () => api.adminListSystemAlerts() });

export const useAdminResolveSystemAlert = () =>
  useInvalidatingMutation((id: string) => api.adminResolveSystemAlert(id), [
    qk.admin.systemAlerts,
  ]);

export const useAdminUpdateContentPage = () =>
  useInvalidatingMutation(
    ({
      id,
      patch,
    }: {
      id: string;
      patch: { title?: string; body?: string; status?: 'draft' | 'published' };
    }) => api.adminUpdateContentPage(id, patch),
    [qk.contentPages, ['content-page'], qk.admin.auditLog],
  );

export const useAdminPrivacyRequests = () =>
  useQuery({
    queryKey: qk.admin.privacyRequests,
    queryFn: () => api.adminListPrivacyRequests(),
  });

export const useAdminResolvePrivacyRequest = () =>
  useInvalidatingMutation(
    ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: 'processing' | 'completed' | 'rejected';
      notes?: string;
    }) => api.adminResolvePrivacyRequest(id, status, notes),
    [qk.admin.privacyRequests],
  );
