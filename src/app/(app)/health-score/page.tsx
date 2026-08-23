'use client';

import { Gauge } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/data';
import { Button, Skeleton } from '@/components/ui/primitives';
import { useFeatureFlag, useFeatureFlags } from '@/lib/queries/hooks';

/**
 * Financial Health Score — PRD 6.10 is DEFERRED.
 *
 * There is deliberately no gauge, no factors and no weighting here. Phase 1
 * ships a single feature flag and nothing else; building a scoring UI against
 * data that does not exist would be inventing the product.
 */
export default function HealthScorePage() {
  const { isPending } = useFeatureFlags();
  const enabled = useFeatureFlag('financial_health_score');

  if (isPending) {
    return (
      <>
        <PageHeader title="Financial health score" />
        <Skeleton className="h-56 rounded-card" />
      </>
    );
  }

  // The flag is false today. If it is ever switched on, this is where the real
  // screen goes — and it needs a scoring model designed first.
  if (enabled) {
    return (
      <>
        <PageHeader title="Financial health score" />
        <EmptyState
          icon={Gauge}
          title="Scoring is enabled but not yet built"
          description="The feature flag is on, but no scoring model has been specified. Turn the flag off, or design the score before shipping this."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Financial health score" />
      <EmptyState
        icon={Gauge}
        testId="health-score-coming-soon"
        title="Coming soon"
        description="A single number for how your finances are doing is on the way. Until it can be built on something meaningful, we would rather not show a score at all."
        actions={
          <Link href="/analytics">
            <Button variant="outline">See your analytics instead</Button>
          </Link>
        }
      />
    </>
  );
}
