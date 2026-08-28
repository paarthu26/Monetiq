'use client';

import { Bell, BellOff, Check, X } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import { EmptyState, ErrorState, InfoBanner } from '@/components/ui/data';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  IconButton,
  Input,
  Skeleton,
  Toggle,
} from '@/components/ui/primitives';
import { Tabs, useToast } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/api/errors';
import {
  useAlertSettings,
  useDismissNotification,
  useMarkNotificationRead,
  useNotifications,
  useUpsertAlertSetting,
} from '@/lib/queries/hooks';

const ALERT_TYPES = [
  {
    type: 'overspending',
    label: 'Overspending',
    description: 'When total spending for the month passes an amount you choose.',
    unit: '₹',
  },
  {
    type: 'budget_limit',
    label: 'Budget limit',
    description: 'When a category reaches this percentage of its cap.',
    unit: '%',
  },
  {
    type: 'emi_reminder',
    label: 'EMI reminder',
    description: 'A few days before a loan instalment is due.',
    unit: null,
  },
  {
    type: 'unusual_transaction',
    label: 'Unusual transaction',
    description: 'When a single expense is larger than this.',
    unit: '₹',
  },
] as const;

export default function AlertsPage() {
  const [tab, setTab] = useState('feed');
  const notifications = useNotifications();
  const settings = useAlertSettings();
  const markRead = useMarkNotificationRead();
  const dismiss = useDismissNotification();
  const upsert = useUpsertAlertSetting();
  const writeDisabled = useWriteDisabledReason();
  const { toast } = useToast();

  const [pushState, setPushState] = useState<
    'idle' | 'granted' | 'denied' | 'unsupported'
  >('idle');

  async function requestPush() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushState('unsupported');
      return;
    }
    const result = await Notification.requestPermission();
    setPushState(result === 'granted' ? 'granted' : 'denied');
  }

  const unread = (notifications.data ?? []).filter((n) => !n.is_read).length;

  return (
    <>
      <PageHeader title="Alerts" description="What Monetiq will tell you about, and when." />

      {/*
        Alerts are generated for real now: overspending, budget limits and
        unusual transactions are raised the moment an expense is recorded, and
        EMI reminders are produced when this screen is opened. What is still
        missing is delivery OUTSIDE the app — web push needs VAPID keys — so
        the banner says exactly that rather than implying nothing works.
      */}
      <div className="mb-4">
        <InfoBanner tone="info" title="Alerts appear here, not on your phone yet" testId="alerts-engine-gap">
          Monetiq raises alerts against the thresholds you set below and shows them on
          this screen. Push notifications outside the app are not connected yet, so check
          back here or watch the badge in the header.
        </InfoBanner>
      </div>

      <div className="mb-4">
        <Tabs
          label="Alerts sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'feed', label: 'Notifications', count: unread },
            { value: 'settings', label: 'Settings' },
          ]}
        />
      </div>

      {tab === 'feed' && (
        <>
          {notifications.error ? (
            <ErrorState
              description={friendlyMessage(notifications.error)}
              onRetry={() => notifications.refetch()}
            />
          ) : notifications.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-card" />
              ))}
            </div>
          ) : (notifications.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={BellOff}
              testId="alerts-empty"
              title="Nothing to report"
              description="When a budget is close to its cap or an instalment is due, it will appear here."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {notifications.data!.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start gap-3 rounded-card border p-4 ${
                    n.is_read ? 'border-hairline bg-surface' : 'border-action/30 bg-action-soft'
                  }`}
                >
                  <Bell
                    aria-hidden
                    strokeWidth={1.75}
                    className={`mt-0.5 h-5 w-5 shrink-0 ${n.is_read ? 'text-subtle' : 'text-action'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-1 text-body">{n.message}</p>
                    <p className="mt-0.5 text-caption text-muted">
                      {new Date(n.created_at).toLocaleString('en-IN')}
                      {!n.is_read && (
                        <>
                          {' · '}
                          <Badge tone="action">New</Badge>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!n.is_read && (
                      <IconButton
                        icon={Check}
                        size="sm"
                        label={`Mark as read: ${n.message}`}
                        disabled={!!writeDisabled}
                        onClick={() => markRead.mutate(n.id)}
                      />
                    )}
                    <IconButton
                      icon={X}
                      size="sm"
                      label={`Dismiss: ${n.message}`}
                      disabled={!!writeDisabled}
                      onClick={() =>
                        dismiss.mutate(n.id, { onSuccess: () => toast('Alert dismissed.') })
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'settings' && (
        <>
          <Card className="mb-4">
            <CardHeader
              title="Browser notifications"
              description="Alerts are delivered as web push in this version."
            />
            {pushState === 'idle' && (
              <Button onClick={requestPush} disabled={!!writeDisabled}>
                Enable notifications
              </Button>
            )}
            {pushState === 'granted' && (
              <InfoBanner tone="success" testId="push-granted">
                Notifications are allowed in this browser.
              </InfoBanner>
            )}
            {pushState === 'denied' && (
              <InfoBanner tone="warning" testId="push-denied">
                Notifications are blocked for this site. You can re-enable them in your
                browser&apos;s site settings.
              </InfoBanner>
            )}
            {pushState === 'unsupported' && (
              <InfoBanner tone="info" testId="push-unsupported">
                This browser does not support web notifications. You will still see alerts
                here when you open Monetiq.
              </InfoBanner>
            )}
          </Card>

          {settings.error ? (
            <ErrorState
              description={friendlyMessage(settings.error)}
              onRetry={() => settings.refetch()}
            />
          ) : settings.isPending ? (
            <Skeleton className="h-64 rounded-card" />
          ) : (
            <Card>
              <CardHeader title="What to alert me about" />
              <ul className="flex flex-col divide-y divide-hairline">
                {ALERT_TYPES.map((t) => {
                  const saved = settings.data?.find((s) => s.alert_type === t.type);
                  const enabled = saved?.enabled ?? false;
                  return (
                    <li key={t.type} className="py-4 first:pt-0 last:pb-0">
                      <Toggle
                        label={t.label}
                        description={t.description}
                        checked={enabled}
                        disabled={!!writeDisabled}
                        onChange={(v) =>
                          upsert.mutate(
                            {
                              alert_type: t.type,
                              threshold_value: saved?.threshold_value ?? null,
                              enabled: v,
                            },
                            { onSuccess: () => toast('Alert settings saved.') },
                          )
                        }
                      />
                      {t.unit && (
                        <div className="mt-3 max-w-xs">
                          <Input
                            label={`Threshold (${t.unit})`}
                            type="number"
                            defaultValue={saved?.threshold_value ?? ''}
                            // Enabled with no threshold is the one combination
                            // that silently never fires, so it is called out
                            // rather than left to be discovered.
                            hint={
                              enabled && saved?.threshold_value == null
                                ? 'Set a value — this alert cannot fire without one.'
                                : undefined
                            }
                            // A disabled alert type greys its threshold: there
                            // is nothing for the number to do.
                            disabled={!enabled || !!writeDisabled}
                            onBlur={(e) =>
                              upsert.mutate({
                                alert_type: t.type,
                                threshold_value:
                                  e.target.value === '' ? null : Number(e.target.value),
                                enabled,
                              })
                            }
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
