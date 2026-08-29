'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shell/AppShell';
import { Card } from '@/components/ui/primitives';
import { USER_NAV } from '@/components/shell/nav-config';

/**
 * Mobile "More" screen. The bottom tab bar holds five destinations; everything
 * else in the sidebar lives here so nothing becomes unreachable on a phone.
 */
export default function MorePage() {
  const items = USER_NAV.flatMap((g) =>
    g.items.map((i) => ({ ...i, section: g.section })),
  ).concat([
    {
      label: 'Financial health score',
      href: '/health-score',
      icon: USER_NAV[1].items[2].icon,
      section: 'Plan',
    },
  ]);

  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    (acc[item.section] ??= []).push(item);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="More" />
      <div className="flex flex-col gap-4">
        {Object.entries(grouped).map(([section, entries]) => (
          <Card key={section} className="p-0">
            <p className="px-5 pt-4 text-caption font-semibold uppercase tracking-wide text-muted">
              {section}
            </p>
            <ul className="flex flex-col divide-y divide-hairline">
              {entries.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-[56px] items-center gap-3 px-5 py-3 hover:bg-cream-200"
                  >
                    <item.icon
                      aria-hidden
                      strokeWidth={1.75}
                      className="h-5 w-5 shrink-0 text-action"
                    />
                    <span className="flex-1 text-body-1 text-body">{item.label}</span>
                    <ChevronRight
                      aria-hidden
                      strokeWidth={1.75}
                      className="h-4 w-4 text-subtle"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
