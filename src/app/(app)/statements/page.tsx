'use client';

import { Download, FileText, Upload } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import {
  AiDisclosure,
  Amount,
  EmptyState,
  ErrorState,
  InfoBanner,
  StatCard,
} from '@/components/ui/data';
import { CategoryDonutSection } from '@/components/ui/charts';
import { Badge, Button, Card, CardHeader, Skeleton } from '@/components/ui/primitives';
import { FileUpload } from '@/components/ui/upload';
import { useToast } from '@/components/ui/overlay';
import { errorCodeOf, friendlyMessage } from '@/lib/api/errors';
import { useProcessStatement, useStatementResult, useStatements } from '@/lib/queries/hooks';

type Step = 'list' | 'processing' | 'result' | 'failed';

export default function StatementsPage() {
  const statements = useStatements();
  const process = useProcessStatement();
  const writeDisabled = useWriteDisabledReason();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('list');
  const [progress, setProgress] = useState(0);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);

  const active = useStatementResult(activeUploadId ?? '');

  function handleFile(file: File) {
    setStep('processing');
    setProgress(10);
    const timer = window.setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + 12));
    }, 200);

    process.mutate(file, {
      onSuccess: (res) => {
        window.clearInterval(timer);
        setProgress(100);
        setActiveUploadId(res.upload.id);
        setStep('result');
      },
      onError: () => {
        window.clearInterval(timer);
        setStep('failed');
      },
    });
  }

  const failureCode = errorCodeOf(process.error);

  return (
    <>
      <PageHeader
        title="Bank statements"
        description="Upload a statement to see income against spending. This is read-only analysis — nothing here reaches your expense ledger."
      />

      {/*
        The separation is a product invariant, not a detail. Saying it on the
        screen keeps the user's mental model right.
      */}
      <div className="mb-4">
        <InfoBanner tone="info" testId="statement-separation-notice">
          Statement analysis is kept separate from your expense ledger. Nothing imported
          here is added to your expenses, budgets or analytics.
        </InfoBanner>
      </div>

      {step === 'list' && (
        <>
          <Card className="mb-6">
            <CardHeader
              title="Analyse a statement"
              description="CSV export from your bank works best."
            />
            <FileUpload
              label="Bank statement file"
              accept={['text/csv', '.csv', 'application/pdf', 'application/vnd.ms-excel']}
              acceptLabel="CSV or PDF"
              maxBytes={20 * 1024 * 1024}
              onFile={handleFile}
              disabled={!!writeDisabled}
            />
            {writeDisabled && (
              <div className="mt-3">
                <InfoBanner tone="warning">{writeDisabled}</InfoBanner>
              </div>
            )}
          </Card>

          <h2 className="mb-3 text-h3">Past analyses</h2>
          {statements.error ? (
            <ErrorState
              description={friendlyMessage(statements.error)}
              onRetry={() => statements.refetch()}
            />
          ) : statements.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-card" />
              ))}
            </div>
          ) : (statements.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={FileText}
              testId="statements-empty"
              title="No statements analysed yet"
              description="Upload a CSV export and Monetiq will summarise income, spending and where it went."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {statements.data!.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (s.status !== 'completed') return;
                      setActiveUploadId(s.id);
                      setStep('result');
                    }}
                    disabled={s.status !== 'completed'}
                    className="flex w-full items-center gap-3 rounded-card border border-hairline bg-surface p-4 text-left shadow-sm enabled:hover:bg-cream-200 disabled:cursor-not-allowed"
                  >
                    <FileText
                      aria-hidden
                      strokeWidth={1.75}
                      className="h-5 w-5 shrink-0 text-action"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-1 text-body">
                        {s.bank_name ?? 'Statement'}
                        {s.period_from && s.period_to && (
                          <span className="text-muted">
                            {' '}
                            · {s.period_from} to {s.period_to}
                          </span>
                        )}
                      </span>
                      <span className="block text-caption text-muted">
                        {s.original_filename}
                      </span>
                    </span>
                    <Badge
                      tone={
                        s.status === 'completed'
                          ? 'success'
                          : s.status === 'failed'
                            ? 'error'
                            : 'neutral'
                      }
                    >
                      {s.status === 'completed'
                        ? 'Analysed'
                        : s.status === 'failed'
                          ? s.failure_reason === 'pdf_not_supported'
                            ? 'PDF not supported'
                            : 'Failed'
                          : 'Processing'}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {step === 'processing' && (
        <Card className="max-w-xl">
          <FileUpload
            label="Bank statement file"
            accept={['text/csv']}
            acceptLabel="CSV or PDF"
            maxBytes={20 * 1024 * 1024}
            onFile={() => {}}
            busy
            progress={progress}
          />
        </Card>
      )}

      {step === 'failed' && (
        <div className="max-w-xl">
          {failureCode === 'pdf_not_supported' ? (
            // A specific, actionable state — not a generic error.
            <div data-testid="statement-pdf-unsupported">
              <ErrorState
                title="PDF statements are not supported yet"
                description="Monetiq can only read CSV exports at the moment. In your bank's net banking, export the same period as CSV and upload that instead."
              />
            </div>
          ) : failureCode === 'unparsable_statement' ? (
            <div data-testid="statement-unparsable">
              <ErrorState
                title="No transactions were found"
                description="The file opened, but none of the rows looked like transactions. Check that you exported a statement rather than a summary."
              />
            </div>
          ) : (
            <ErrorState
              title="That statement could not be analysed"
              description={friendlyMessage(process.error)}
            />
          )}
          <Button
            className="mt-4"
            onClick={() => {
              setStep('list');
              process.reset();
            }}
          >
            Try another file
          </Button>
        </div>
      )}

      {step === 'result' && activeUploadId && (
        <>
          {active.isPending ? (
            <Skeleton className="h-64 rounded-card" />
          ) : active.error ? (
            <ErrorState
              description={friendlyMessage(active.error)}
              onRetry={() => active.refetch()}
            />
          ) : active.data?.result ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-h3">
                  {active.data.upload.bank_name} · {active.data.upload.period_from} to{' '}
                  {active.data.upload.period_to}
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep('list');
                      setActiveUploadId(null);
                    }}
                  >
                    Back to list
                  </Button>
                  <Button
                    icon={Download}
                    onClick={async () => {
                      // SheetJS is ~100 kB and only needed once the user asks
                      // for the file, so it is loaded on demand rather than
                      // shipped with the page.
                      const { downloadStatementReport } = await import('@/lib/report/excel');
                      downloadStatementReport({
                        upload: active.data!.upload,
                        result: active.data!.result!,
                        transactions: active.data!.transactions,
                      });
                      toast('Report downloaded.');
                    }}
                  >
                    Download report
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  label="Money in"
                  value={<Amount value={Number(active.data.result.total_income)} />}
                  tone="positive"
                />
                <StatCard
                  label="Money out"
                  value={<Amount value={Number(active.data.result.total_expense)} />}
                  tone="negative"
                />
                <StatCard
                  label="Net"
                  value={
                    <Amount
                      value={
                        Number(active.data.result.total_income) -
                        Number(active.data.result.total_expense)
                      }
                    />
                  }
                />
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Where it went" />
                  <CategoryDonutSection
                    breakdown={
                      (active.data.result.category_breakdown ?? {}) as Record<string, number>
                    }
                  />
                </Card>

                <Card>
                  <CardHeader
                    title="Transactions"
                    description={`${active.data.transactions.length} rows read from the statement`}
                  />
                  <ul className="flex max-h-80 flex-col divide-y divide-hairline overflow-y-auto">
                    {active.data.transactions.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-2 text-body">
                            {t.description}
                          </span>
                          <span className="block text-caption text-muted">
                            {t.txn_date} · {t.category_guess ?? 'Uncategorised'}
                          </span>
                        </span>
                        <Amount
                          value={Number(t.amount)}
                          signed
                          direction={t.direction as 'credit' | 'debit'}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              {active.data.result.ai_summary && (
                <Card className="mt-4">
                  <CardHeader title="Summary" />
                  <p className="text-body-1 text-secondary">{active.data.result.ai_summary}</p>
                  <div className="mt-3">
                    <AiDisclosure text={active.data.result.ai_disclaimer} />
                  </div>
                </Card>
              )}
            </>
          ) : null}
        </>
      )}
    </>
  );
}
