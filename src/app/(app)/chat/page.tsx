'use client';

import { Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import { AiDisclosure, ErrorState, InfoBanner, QuotaIndicator } from '@/components/ui/data';
import { Button, Card, Skeleton, Textarea } from '@/components/ui/primitives';
import { AI_DISCLOSURE } from '@/lib/constants';
import { errorCodeOf, friendlyMessage } from '@/lib/mock/errors';
import { useChatMessages, useQuota, useSendChatMessage } from '@/lib/queries/hooks';

const PROMPTS = [
  'Where is most of my money going this month?',
  'What could I cut without it hurting?',
  'How quickly could I clear my credit card?',
];

export default function ChatPage() {
  const messages = useChatMessages();
  const quota = useQuota();
  const send = useSendChatMessage();
  const writeDisabled = useWriteDisabledReason();

  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.data?.length]);

  const exhausted = (quota.data?.remaining ?? 0) <= 0;
  const errorCode = errorCodeOf(send.error);
  // A composer disabled by quota must say so; one disabled by a block says that.
  const composerDisabled = exhausted || !!writeDisabled || send.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || composerDisabled) return;
    send.mutate(text, { onSuccess: () => setDraft('') });
  }

  return (
    <>
      <PageHeader
        title="AI chat"
        description="Ask about your own numbers. Answers are generated and may be wrong."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="order-2 lg:order-1">
          <Card className="flex min-h-[420px] flex-col">
            {messages.error ? (
              <ErrorState
                description={friendlyMessage(messages.error)}
                onRetry={() => messages.refetch()}
              />
            ) : messages.isPending ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-3/4 rounded-card" />
                ))}
              </div>
            ) : (messages.data?.length ?? 0) === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-circle bg-action-soft text-action">
                  <Sparkles aria-hidden strokeWidth={1.75} className="h-6 w-6" />
                </span>
                <h3 className="text-h4 font-medium text-heading">Ask about your money</h3>
                <p className="mt-1 max-w-prose text-body-2 text-muted">
                  Monetiq can see your ledger, budgets and debts — not your bank statements.
                </p>
                <ul className="mt-4 flex flex-wrap justify-center gap-2">
                  {PROMPTS.map((p) => (
                    <li key={p}>
                      <button
                        type="button"
                        onClick={() => setDraft(p)}
                        disabled={composerDisabled}
                        className="rounded-pill border border-hairline px-3 py-1.5 text-body-2 text-secondary hover:bg-cream-200 disabled:cursor-not-allowed disabled:text-subtle"
                      >
                        {p}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ul className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-live="polite">
                {messages.data!.map((m) => (
                  <li
                    key={m.id}
                    className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                  >
                    <div
                      className={
                        m.role === 'user'
                          ? 'max-w-[85%] rounded-card bg-action px-4 py-3 text-body-1 text-white'
                          : 'max-w-[85%] rounded-card bg-sunken px-4 py-3 text-body-1 text-body'
                      }
                    >
                      <span className="sr-only">
                        {m.role === 'user' ? 'You said: ' : 'Monetiq said: '}
                      </span>
                      {m.content}
                    </div>
                  </li>
                ))}
                {/* Scroll anchor. A <ul> may only contain <li>, so it is one. */}
                <li ref={endRef} aria-hidden />
              </ul>
            )}

            {(messages.data?.length ?? 0) > 0 && (
              <div className="mt-4">
                <AiDisclosure text={AI_DISCLOSURE} />
              </div>
            )}

            {send.isError && (
              <div role="alert" className="mt-3">
                <InfoBanner
                  tone={errorCode === 'quota_exhausted' ? 'warning' : 'error'}
                  testId={`chat-error-${errorCode ?? 'unknown'}`}
                >
                  {errorCode === 'quota_exhausted'
                    ? "You have used this week's AI allowance. It resets on Monday."
                    : errorCode === 'provider_not_configured'
                      ? 'AI chat is not available right now. Nothing is wrong with your account — the service is being configured.'
                      : friendlyMessage(send.error)}
                </InfoBanner>
              </div>
            )}

            <form onSubmit={submit} className="mt-4 border-t border-hairline pt-4">
              <Textarea
                label="Your question"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                disabled={composerDisabled}
                placeholder={
                  exhausted ? 'Your weekly allowance is used up' : 'Ask about your spending…'
                }
                hint={
                  exhausted
                    ? 'The composer reopens when your allowance resets on Monday.'
                    : writeDisabled
                }
              />
              <div className="mt-2 flex justify-end">
                <Button
                  type="submit"
                  icon={Send}
                  loading={send.isPending}
                  disabled={composerDisabled || draft.trim() === ''}
                  data-testid="chat-send"
                >
                  Send
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="order-1 lg:order-2">
          {quota.isPending ? (
            <Skeleton className="h-32 rounded-card" />
          ) : quota.data ? (
            <QuotaIndicator
              used={quota.data.used}
              limit={quota.data.weekly_limit}
              remaining={quota.data.remaining}
              weekStart={quota.data.week_start}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
