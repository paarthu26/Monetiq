'use client';

import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/shell/AppShell';
import { useWriteDisabledReason } from '@/components/shell/BlockedBanner';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { Card } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/overlay';
import { friendlyMessage } from '@/lib/api/errors';
import { useCreateExpense } from '@/lib/queries/hooks';

export default function AddExpensePage() {
  const router = useRouter();
  const { toast } = useToast();
  const create = useCreateExpense();
  const writeDisabled = useWriteDisabledReason();

  return (
    <>
      <PageHeader title="Add expense" description="Record something you have already spent." />
      <Card className="max-w-xl">
        <ExpenseForm
          submitLabel="Save expense"
          submitting={create.isPending}
          serverError={create.error ? friendlyMessage(create.error) : null}
          disabled={!!writeDisabled}
          disabledReason={writeDisabled}
          onSubmit={(values) =>
            create.mutate(
              { ...values, source: 'manual' },
              {
                onSuccess: () => {
                  toast('Expense saved.');
                  router.push('/ledger');
                },
              },
            )
          }
        />
      </Card>
    </>
  );
}
