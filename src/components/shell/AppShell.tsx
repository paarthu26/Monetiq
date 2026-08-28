'use client';

import {
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { Avatar, Badge } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/overlay';
import { createClient } from '@/lib/supabase/client';
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
  collapsed = false,
  onToggleCollapse,
}: {
  groups: NavGroup[];
  pathname: string;
  isAdmin: boolean;
  /** Desktop only. The drawer is never collapsed — it is dismissed instead. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <nav
      aria-label={isAdmin ? 'Admin sections' : 'Main'}
      className={cn(
        'flex h-full shrink-0 flex-col bg-sidebar-rail py-5',
        'transition-[width] duration-surface ease-standard',
        collapsed ? 'w-sidebar-collapsed px-2' : 'w-sidebar px-3',
      )}
    >
      <div
        className={cn(
          'mb-6 flex items-center gap-2',
          collapsed ? 'justify-center px-0' : 'px-2',
        )}
      >
        {!collapsed && (
          <>
            <Wordmark onDark />
            {isAdmin && (
              <span className="rounded-pill bg-action px-2 py-0.5 text-caption font-medium text-white">
                Admin
              </span>
            )}
          </>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-control',
              'text-[#B9B7D4] transition-colors duration-control ease-standard',
              'hover:bg-navy-700 hover:text-white',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
              !collapsed && 'ml-auto',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden strokeWidth={1.75} className="h-5 w-5" />
            ) : (
              <PanelLeftClose aria-hidden strokeWidth={1.75} className="h-5 w-5" />
            )}
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.section}>
            {collapsed ? (
              // The label is still needed by a screen reader; only the visual
              // heading goes away, and a divider keeps the grouping legible.
              <>
                <span className="sr-only">{group.section}</span>
                <div aria-hidden className="mx-2 mb-1.5 h-px bg-white/10" />
              </>
            ) : (
              <p className="px-2 pb-1.5 text-caption font-semibold uppercase tracking-wide text-[#B9B7D4]">
                {group.section}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      // Collapsed, the icon is the only visible affordance, so
                      // the label has to survive as a tooltip and for AT.
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center rounded-control py-2.5 text-body-1 transition-colors duration-control ease-standard',
                        collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
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
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <span className="truncate">{item.label}</span>
                      )}
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

/**
 * Global search.
 *
 * The topbar had a wide empty gap and no way to look anything up — every
 * search lived inside the ledger screen, so finding a transaction meant
 * navigating there first and knowing that was where to go. This submits into
 * the ledger's own filtered view rather than inventing a second search index.
 */
function GlobalSearch({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [term, setTerm] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = term.trim();
    if (!q) return;
    router.push(
      isAdmin ? `/admin/users?q=${encodeURIComponent(q)}` : `/ledger?q=${encodeURIComponent(q)}`,
    );
  }

  return (
    <form onSubmit={onSubmit} role="search" className="hidden min-w-0 flex-1 sm:block">
      <label htmlFor="global-search" className="sr-only">
        {isAdmin ? 'Search users' : 'Search expenses'}
      </label>
      <div className="relative max-w-sm">
        <Search
          aria-hidden
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
        />
        <input
          id="global-search"
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={isAdmin ? 'Search users…' : 'Search expenses…'}
          className={cn(
            'h-10 w-full rounded-control border border-hairline bg-surface pl-9 pr-3',
            'text-body-2 text-body placeholder:text-subtle',
            'transition-colors duration-control ease-standard',
            'hover:border-border-default focus:border-action focus:outline-none',
          )}
        />
      </div>
    </form>
  );
}

/**
 * The account menu in the topbar.
 *
 * This replaces an avatar that was only ever a link — to /settings for a user
 * and to the dashboard for an admin. That left a super admin with NO way to
 * sign out on desktop: the only sign-out control lived on /admin/more, which
 * is reachable exclusively from the mobile tab bar, and nothing in ADMIN_NAV
 * points at it. Signing out is the one action people expect to find under
 * their own avatar, so it lives there now for both variants.
 */
function AccountMenu({ isAdmin, name }: { isAdmin: boolean; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-away and Escape. Bound only while the menu is open so the app is not
  // carrying two document listeners for the entire session.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-control px-1 py-1',
          'transition-colors duration-control ease-standard hover:bg-cream-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
        )}
      >
        <Avatar name={name} size="sm" />
        <span className="hidden max-w-[12ch] truncate text-body-2 text-secondary sm:block">
          {name}
        </span>
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            'h-4 w-4 shrink-0 text-muted transition-transform duration-control ease-standard',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className={cn(
            'absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden',
            'rounded-card border border-hairline bg-surface py-1 shadow-md',
          )}
        >
          <p className="truncate px-4 py-2 text-caption text-muted">
            Signed in as <span className="text-secondary">{name}</span>
          </p>
          <div aria-hidden className="my-1 h-px bg-hairline" />

          <Link
            href={isAdmin ? '/admin/more' : '/settings'}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-body-2 text-body hover:bg-cream-200"
          >
            <Settings aria-hidden strokeWidth={1.75} className="h-4 w-4 text-muted" />
            {isAdmin ? 'All admin sections' : 'Settings'}
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirming(true);
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-body-2 text-error-text hover:bg-error-tint"
          >
            <LogOut aria-hidden strokeWidth={1.75} className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Sign out?"
        confirmLabel="Sign out"
        description="You will need to sign in again to get back to your account."
        onConfirm={signOut}
      />
    </div>
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
  const [collapsed, setCollapsed] = useState(false);

  // A route change should never leave the drawer hanging open behind the new
  // screen.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  /*
    The collapsed state is remembered per browser. Read in an effect rather
    than in the initial state so the server and the first client render agree —
    seeding useState from localStorage hydrates to a different tree and React
    discards it.

    Storage can throw outright (Safari private mode, blocked site data), and a
    remembered sidebar width is not worth a crash.
  */
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('monetiq:nav-collapsed') === '1');
    } catch {
      /* keep the default */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('monetiq:nav-collapsed', next ? '1' : '0');
      } catch {
        /* the toggle still works for this page load */
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-page">
      {/* Desktop rail */}
      <div className="hidden md:block">
        <div className="sticky top-0 h-screen">
          <SidebarRail
            groups={groups}
            pathname={pathname}
            isAdmin={isAdmin}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapsed}
          />
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

          <GlobalSearch isAdmin={isAdmin} />

          <div className="ml-auto flex shrink-0 items-center gap-3">
            {!isAdmin && unread > 0 && (
              <Link href="/alerts" className="inline-flex items-center gap-1.5">
                <Badge tone="error">
                  <span className="tabular">{unread}</span> new
                </Badge>
                <span className="sr-only">unread alerts</span>
              </Link>
            )}
            <AccountMenu
              isAdmin={isAdmin}
              name={profile?.full_name ?? (isAdmin ? 'Administrator' : 'Monetiq user')}
            />
          </div>
        </header>

        {/* pb-20 leaves room for the mobile tab bar. */}
        <main id="main" className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-12">
          <div className="mx-auto w-full max-w-app">{children}</div>
        </main>

        {/*
          The privacy policy and terms existed as public routes but nothing
          inside the signed-in app ever linked to them, so a user had no way to
          reach either without typing the URL. A footer is the conventional
          place to look for both.
        */}
        <footer className="mt-auto border-t border-hairline px-4 pb-24 pt-5 md:px-8 md:pb-6">
          <div className="mx-auto flex w-full max-w-app flex-wrap items-center gap-x-5 gap-y-2">
            <p className="text-caption text-muted">© {new Date().getFullYear()} Monetiq</p>
            <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
              <Link
                href="/privacy"
                className="text-caption text-secondary hover:text-action hover:underline"
              >
                Privacy policy
              </Link>
              <Link
                href="/terms"
                className="text-caption text-secondary hover:text-action hover:underline"
              >
                Terms &amp; conditions
              </Link>
              {!isAdmin && (
                <Link
                  href="/help-desk"
                  className="text-caption text-secondary hover:text-action hover:underline"
                >
                  Help &amp; support
                </Link>
              )}
            </nav>
          </div>
        </footer>
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
