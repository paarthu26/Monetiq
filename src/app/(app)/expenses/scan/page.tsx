'use client';

import { PlusCircle, RotateCcw, ScanLine } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { ErrorState, InfoBanner } from '@/components/ui/data';
import { Button, Card } from '@/components/ui/primitives';
import { FileUpload } from '@/components/ui/upload';
import { useToast } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/api/errors';
import type { OcrExtraction } from '@/lib/api';
import { useCreateExpense, useProcessReceipt } from '@/lib/queries/hooks';

type Step = 'upload' | 'processing' | 'review' | 'failed';

/**
 * OCR scanner.
 *
 * The important behaviour: Phase 1's OCR is a stub with no provider
 * credential. It returns null fields with `requires_manual_review: true`. This
 * screen therefore shows an EMPTY review form and says plainly that nothing
 * was extracted. It must never present invented values as if they were read
 * off the receipt.
 */
export default function ScanReceiptPage() {
  const router = useRouter();
  const { toast } = useToast();
  const process = useProcessReceipt();
  const create = useCreateExpense();
  const writeDisabled = useWriteDisabledReason();

  const [step, setStep] = useState<Step>('upload');
  const [progress, setProgress] = useState(0);
  const [extraction, setExtraction] = useState<OcrExtraction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handleFile(file: File) {
    setStep('processing');
    setProgress(10);

    // Visible progress while the request is in flight. Cosmetic, and stops at
    // 90 so it never claims completion the response has not confirmed.
    const timer = window.setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + 15));
    }, 180);

    process.mutate(file, {
      onSuccess: (res) => {
        window.clearInterval(timer);
        setProgress(100);
        setExtraction(res.data);
        setNotice(res.notice ?? null);
        setStep('review');
      },
      onError: () => {
        window.clearInterval(timer);
        setStep('failed');
      },
    });
  }

  function reset() {
    setStep('upload');
    setProgress(0);
    setExtraction(null);
    setNotice(null);
    process.reset();
  }

  return (
    <>
      <PageHeader
        title="Scan a receipt"
        description="Upload a photo or PDF. You confirm every field before anything is saved."
      />

      {step === 'upload' && (
        <Card className="max-w-xl">
          <InfoBanner tone="info" testId="ocr-privacy-notice">
            The file is deleted as soon as it has been read. Monetiq keeps only the details
            you confirm below — there is no copy of the original receipt.
          </InfoBanner>
          <div className="mt-4">
            <FileUpload
              label="Receipt image or PDF"
              accept={['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']}
              acceptLabel="JPG, PNG, WEBP, HEIC or PDF"
              maxBytes={10 * 1024 * 1024}
              onFile={handleFile}
              disabled={!!writeDisabled}
            />
          </div>
          {writeDisabled && (
            <div className="mt-3">
              <InfoBanner tone="warning">{writeDisabled}</InfoBanner>
            </div>
          )}
        </Card>
      )}

      {step === 'processing' && (
        <Card className="max-w-xl">
          <FileUpload
            label="Receipt image or PDF"
            accept={['image/jpeg', 'application/pdf']}
            acceptLabel="JPG, PNG, WEBP, HEIC or PDF"
            maxBytes={10 * 1024 * 1024}
            onFile={() => {}}
            busy
            progress={progress}
          />
        </Card>
      )}

      {step === 'failed' && (
        <div className="max-w-xl">
          <ErrorState
            testId="ocr-failed"
            title="That receipt could not be read"
            description={
              friendlyMessage(process.error) +
              ' A clearer photo often helps — or enter the details by hand.'
            }
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={RotateCcw} onClick={reset}>
              Try another photo
            </Button>
            <Link href="/expenses/new">
              <Button variant="outline" icon={PlusCircle}>
                Add manually instead
              </Button>
            </Link>
          </div>
        </div>
      )}

      {step === 'review' && extraction && (
        <Card className="max-w-xl">
          <h2 className="text-h4 font-medium text-heading">Review and save</h2>

          {/*
            The stub returns nothing. Say so, rather than rendering a form that
            looks like it was filled in from the receipt.
          */}
          {extraction.requires_manual_review && (
            <div className="mt-3" data-testid="ocr-stub-notice">
              <InfoBanner tone="warning" title="Nothing was extracted automatically">
                {notice ??
                  'No OCR provider is configured in this environment, so no values were read from the receipt. Enter the details below.'}
              </InfoBanner>
            </div>
          )}

          <div className="mt-4">
            <ExpenseForm
              // Nulls stay null. No placeholder amounts, no guessed merchant.
              initial={{
                merchant: extraction.merchant ?? '',
                amount: extraction.amount != null ? String(extraction.amount) : '',
                expense_date: extraction.expense_date ?? '',
              }}
              submitLabel="Save to ledger"
              submitting={create.isPending}
              serverError={create.error ? friendlyMessage(create.error) : null}
              disabled={!!writeDisabled}
              disabledReason={writeDisabled}
              onSubmit={(values) =>
                create.mutate(
                  // Saved as 'ocr' because it came through the scanner, even
                  // though the fields were typed by hand.
                  { ...values, source: 'ocr' },
                  {
                    onSuccess: () => {
                      toast('Expense saved to your ledger.');
                      router.push('/ledger');
                    },
                  },
                )
              }
            />
          </div>

          <button
            type="button"
            onClick={reset}
            className="mt-4 inline-flex items-center gap-1.5 text-body-2 text-action hover:underline"
          >
            <ScanLine aria-hidden strokeWidth={1.75} className="h-4 w-4" />
            Scan a different receipt
          </button>
        </Card>
      )}
    </>
  );
}
