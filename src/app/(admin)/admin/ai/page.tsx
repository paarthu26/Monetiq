'use client';

import { KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { Amount, ErrorState, InfoBanner, StatCard } from '@/components/ui/data';
import {
  ADMIN_SERIES_COLORS,
  AdminTrendChart,
  formatMs,
} from '@/components/ui/charts';
import {
  TrendRangeCustomFields,
  TrendRangeTabs,
  useTrendRange,
} from '@/components/ui/trend-range';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Skeleton,
  Toggle,
} from '@/components/ui/primitives';
import { Modal, useToast } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/api/errors';
import {
  useAdminAiDashboard,
  useAdminAiTrend,
  useAdminDeleteProviderKey,
  useAdminProviders,
  useAdminSetActiveProvider,
  useAdminSetProviderKey,
  useAdminSetProviderLimits,
} from '@/lib/queries/hooks';

const REQUEST_SERIES = [
  { key: 'requests', label: 'Requests', color: ADMIN_SERIES_COLORS.primary },
] as const;

// A status pair, so it takes the status colours rather than categorical slots.
const OUTCOME_SERIES = [
  { key: 'successes', label: 'Successful', color: ADMIN_SERIES_COLORS.success },
  { key: 'failures', label: 'Failed', color: ADMIN_SERIES_COLORS.failure },
] as const;

const LATENCY_SERIES = [
  { key: 'avg_duration_ms', label: 'Avg response', color: ADMIN_SERIES_COLORS.secondary },
] as const;

export default function AdminAiPage() {
  const providers = useAdminProviders();
  const trend = useTrendRange('6m');
  const aiTrend = useAdminAiTrend(trend.from, trend.to, !trend.invalid);
  const dashboard = useAdminAiDashboard();
  const setKey = useAdminSetProviderKey();
  const deleteKey = useAdminDeleteProviderKey();
  const setActive = useAdminSetActiveProvider();
  const setLimits = useAdminSetProviderLimits();
  const { toast } = useToast();

  const [keyModal, setKeyModal] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');

  const totalCost = (dashboard.data ?? []).reduce((s, r) => s + r.total_cost_usd, 0);
  const totalRequests = (dashboard.data ?? []).reduce((s, r) => s + r.requests, 0);
  const totalFailures = (dashboard.data ?? []).reduce((s, r) => s + r.failures, 0);

  return (
    <>
      <PageHeader title="AI management" description="Providers, keys, limits and usage." />

      {/*
        The key is write-only by design. Phase 1 stores it in Supabase Vault and
        grants EXECUTE on the accessor to service_role only — a super admin
        cannot read it back either. So the UI never asks for it and never shows
        it, not even masked from a real value.
      */}
      <div className="mb-4">
        <InfoBanner tone="info" title="API keys are write-only" testId="key-writeonly-note">
          Keys are stored in Supabase Vault and are never returned by the API — not to this
          screen, and not to any administrator. You can replace a key or remove it, but it
          cannot be displayed.
        </InfoBanner>
      </div>

      {dashboard.error ? (
        <ErrorState
          description={friendlyMessage(dashboard.error)}
          onRetry={() => dashboard.refetch()}
        />
      ) : dashboard.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Requests (30 days)"
            value={<span className="tabular">{totalRequests.toLocaleString('en-IN')}</span>}
          />
          <StatCard
            label="Failures"
            value={<span className="tabular">{totalFailures}</span>}
            caption={`${((1 - totalFailures / Math.max(1, totalRequests)) * 100).toFixed(1)}% success`}
            tone={totalFailures > 0 ? 'negative' : 'default'}
          />
          <StatCard
            label="Spend (30 days)"
            value={<span className="tabular">${totalCost.toFixed(2)}</span>}
            caption="across all providers"
          />
        </div>
      )}

      <Card className="mt-6">
        <CardHeader
          title="AI trends"
          action={<TrendRangeTabs window={trend} />}
        />
        <TrendRangeCustomFields window={trend} />

        {aiTrend.error ? (
          <ErrorState
            description={friendlyMessage(aiTrend.error)}
            onRetry={() => aiTrend.refetch()}
          />
        ) : aiTrend.isPending && !trend.invalid ? (
          <Skeleton className="h-[260px] rounded-card" />
        ) : (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-2 text-body-2 font-medium text-secondary">
                AI requests over time
              </h3>
              <AdminTrendChart
                title="AI requests by month"
                data={aiTrend.data ?? []}
                series={REQUEST_SERIES}
              />
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="mb-2 text-body-2 font-medium text-secondary">
                  Successful vs failed
                </h3>
                <AdminTrendChart
                  title="AI request outcomes by month"
                  data={aiTrend.data ?? []}
                  series={OUTCOME_SERIES}
                />
              </section>

              <section>
                <h3 className="mb-2 text-body-2 font-medium text-secondary">
                  Average response time
                </h3>
                <AdminTrendChart
                  title="Average AI response time by month"
                  data={aiTrend.data ?? []}
                  series={LATENCY_SERIES}
                  format={formatMs}
                />
              </section>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Usage by provider"
          description="Totals for the last 30 days."
        />
        {dashboard.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <>
            <table className="w-full text-body-2">
              <caption className="sr-only">Per-provider usage and cost</caption>
              <thead>
                <tr className="bg-sunken text-left">
                  <th scope="col" className="px-3 py-2 font-medium">Provider</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Requests</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Success</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Avg ms</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard.data ?? []).map((r) => (
                  <tr key={r.provider} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-2">{r.provider}</td>
                    <td className="px-3 py-2 text-right tabular">{r.requests}</td>
                    <td className="px-3 py-2 text-right tabular">{r.success_rate_pct}%</td>
                    <td className="px-3 py-2 text-right tabular">{r.avg_duration_ms}</td>
                    <td className="px-3 py-2 text-right tabular">
                      ${r.total_cost_usd.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Providers" description="One provider is active at a time." />
        {providers.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {(providers.data ?? []).map((p) => (
              <li key={p.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body-1 font-medium text-heading">
                      {p.label ?? `${p.provider} — ${p.model}`}
                    </p>
                    <p className="text-caption text-muted">
                      {p.provider} · {p.model}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.is_active && <Badge tone="success">Active</Badge>}
                      <Badge tone={p.has_key ? 'action' : 'warning'}>
                        {p.has_key ? 'Key stored' : 'No key'}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={KeyRound}
                      onClick={() => {
                        setKeyModal(p.id);
                        setKeyDraft('');
                      }}
                    >
                      {p.has_key ? 'Replace key' : 'Add key'}
                    </Button>
                    {p.has_key && (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={Trash2}
                        onClick={() =>
                          deleteKey.mutate(p.id, { onSuccess: () => toast('Key removed.') })
                        }
                      >
                        Remove key
                      </Button>
                    )}
                    {!p.is_active && (
                      <Button
                        size="sm"
                        disabled={!p.has_key}
                        onClick={() =>
                          setActive.mutate(p.id, {
                            onSuccess: () => toast('Active provider switched.'),
                          })
                        }
                      >
                        Make active
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Toggle
                    label="Enabled"
                    description="Turning this off stops Monetiq using this provider."
                    checked={p.is_enabled}
                    onChange={(v) =>
                      setLimits.mutate({ configId: p.id, patch: { is_enabled: v } })
                    }
                  />
                  <Input
                    label="Monthly request limit"
                    type="number"
                    defaultValue={p.monthly_usage_limit ?? ''}
                    onBlur={(e) =>
                      setLimits.mutate({
                        configId: p.id,
                        patch: {
                          monthly_usage_limit:
                            e.target.value === '' ? null : Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {setActive.isError && (
          <div role="alert" className="mt-3">
            <InfoBanner tone="error">{friendlyMessage(setActive.error)}</InfoBanner>
          </div>
        )}
      </Card>

      <Modal
        open={!!keyModal}
        onClose={() => setKeyModal(null)}
        title="Store an API key"
        description="The key is written straight to Supabase Vault. It cannot be read back afterwards."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!keyModal) return;
            setKey.mutate(
              { configId: keyModal, apiKey: keyDraft },
              {
                onSuccess: () => {
                  setKeyModal(null);
                  setKeyDraft('');
                  toast('Key stored.');
                },
              },
            );
          }}
          className="flex flex-col gap-4"
        >
          {setKey.isError && (
            <div role="alert">
              <InfoBanner tone="error">{friendlyMessage(setKey.error)}</InfoBanner>
            </div>
          )}
          <Input
            label="API key"
            // type=password so it is not shoulder-surfed while being pasted.
            type="password"
            autoComplete="off"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="Paste the provider key"
            hint="Monetiq will not display this again."
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setKeyModal(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={setKey.isPending}>
              Store key
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
