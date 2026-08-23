'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { Avatar, Badge } from '@/components/ui/primitives';
import {
  ADMIN_NAV,
  ADMIN_TABS,
  USER_NAV,
  USER_TABS,
  isActive,
  type NavGroup,
  type NavItem,
} from '@/components/shell/nav-config';
import { useNotifications, useProfile } from '@/lib/queries/hooks';

/** Brand wordmark. Note the spelling: Monetiq — see the Phase 2 report. */
function Wordmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={cn(
        'text-h4 font-semibold tracking-tight',
        onDark ? 'text-white' : 'text-heading',
      )}
    >
      Monetiq
    </span>
  );
}

function SidebarRail({
  groups,
  pathname,
  isAdmin,
}: {
  groups: NavGroup[];
  pathname: string;
  isAdmin: boolean;
}) {
  return (
    <nav
      aria-label={isAdmin ? 'Admin sections' : 'Main'}
      className="flex h-full w-sidebar shrink-0 flex-col bg-sidebar-rail px-3 py-5"
    >
      <div className="mb-6 flex items-center gap-2 px-2">
        <Wordmark onDark />
        {isAdmin && (
          <span className="rounded-pill bg-action px-2 py-0.5 text-caption font-medium text-white">
            Admin
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.section}>
            <p className="px-2 pb-1.5 text-caption font-semibold uppercase tracking-wide text-[#B9B7D4]">
              {group.section}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-control px-2.5 py-2.5 text-body-1 transition-colors duration-control ease-standard',
                        active
                          ? 'bg-action text-white'
                          : 'text-[#B9B7D4] hover:bg-navy-700 hover:text-white',
                      )}
                    >
                      <item.icon
                        aria-hidden
                        strokeWidth={1.75}
                        className="h-[18px] w-[18px] shrink-0"
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function MobileTabBar({ tabs, pathname }: { tabs: NavItem[]; pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-surface md:hidden"
    >
      {tabs.map((tab) => {
        const active = isActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            // 44px minimum touch target.
            className={cn(
              'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-caption',
              active ? 'text-action' : 'text-muted',
            )}
          >
            <tab.icon aria-hidden strokeWidth={1.75} className="h-5 w-5" />
            <span className="truncate">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  variant = 'user',
}: {
  children: ReactNode;
  variant?: 'user' | 'admin';
}) {
  const pathname = usePathname() ?? '';
  const isAdmin = variant === 'admin';
  const groups = isAdmin ? ADMIN_NAV : USER_NAV;
  const tabs = isAdmin ? ADMIN_TABS : USER_TABS;

  const { data: profile } = useProfile();
  const { data: notifications } = useNotifications();
  const unread = notifications?.filter((n) => !n.is_read).length ?? 0;

  const [drawerOpen, setDrawerOpen] = useState(false);

  // A route change should never leave the drawer hanging open behind the new
  // screen.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-page">
      {/* Desktop rail */}
      <div className="hidden md:block">
        <div className="sticky top-0 h-screen">
          <SidebarRail groups={groups} pathname={pathname} isAdmin={isAdmin} />
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-[rgba(11,16,51,.5)]"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative h-full w-[264px]">
            <SidebarRail groups={groups} pathname={pathname} isAdmin={isAdmin} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              className="absolute right-2 top-4 inline-flex h-11 w-11 items-center justify-center rounded-control text-white"
            >
              <X aria-hidden strokeWidth={1.75} className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-topbar items-center gap-3 border-b border-hairline bg-page/90 px-4 backdrop-blur md:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="inline-flex h-11 w-11 items-center justify-center rounded-control text-secondary hover:bg-cream-200 md:hidden"
          >
            <Menu aria-hidden strokeWidth={1.75} className="h-5 w-5" />
          </button>

          <div className="md:hidden">
            <Wordmark />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {!isAdmin && unread > 0 && (
              <Link href="/alerts" className="inline-flex items-center gap-1.5">
                <Badge tone="error">
                  <span className="tabular">{unread}</span> new
                </Badge>
                <span className="sr-only">unread alerts</span>
              </Link>
            )}
            <Link
              href={isAdmin ? '/admin' : '/settings'}
              className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-cream-200"
            >
              <Avatar name={profile?.full_name ?? 'Monetiq user'} size="sm" />
              <span className="hidden text-body-2 text-secondary sm:block">
                {profile?.full_name ?? '—'}
              </span>
            </Link>
          </div>
        </header>

        {/* pb-20 leaves room for the mobile tab bar. */}
        <main id="main" className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-12">
          <div className="mx-auto w-full max-w-app">{children}</div>
        </main>
      </div>

      <MobileTabBar tabs={tabs} pathname={pathname} />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-h1">{title}</h1>
        {description && <p className="mt-1 text-body-1 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
