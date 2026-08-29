import {
  Activity,
  ArrowLeftRight,
  Bell,
  Bot,
  ClipboardList,
  FileText,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  Lock,
  ScanLine,
  Settings,
  Shield,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Other routes that should light this item up. */
  matches?: string[];
};

export type NavGroup = { section: string; items: NavItem[] };

/**
 * Grouping is taken from the prototype's `userSidebarItems` — Money / Plan /
 * Support / Account — not invented here. Sub-screens (add expense, OCR,
 * expense detail) light up their parent group item, as they do in the design.
 */
export const USER_NAV: NavGroup[] = [
  {
    section: 'Money',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      {
        label: 'Expenses',
        href: '/ledger',
        icon: ArrowLeftRight,
        matches: ['/ledger', '/expenses'],
      },
    ],
  },
  {
    section: 'Plan',
    items: [
      { label: 'Bank statements', href: '/statements', icon: FileText },
      { label: 'Debt', href: '/debt', icon: Landmark },
      {
        label: 'Budgets & analytics',
        href: '/analytics',
        icon: Target,
        matches: ['/analytics', '/budget', '/health-score', '/categories'],
      },
    ],
  },
  {
    section: 'Support',
    items: [
      { label: 'AI chat', href: '/chat', icon: Sparkles },
      { label: 'Alerts', href: '/alerts', icon: Bell },
      { label: 'Help desk', href: '/help-desk', icon: HelpCircle },
    ],
  },
  {
    section: 'Account',
    items: [
      {
        label: 'Settings',
        href: '/settings',
        icon: Settings,
        matches: ['/settings', '/profile'],
      },
    ],
  },
];

/**
 * Admin grouping, taken from the prototype's `adminSidebarItems`:
 * Platform / AI & services / Support / Access / Content / Privacy.
 */
export const ADMIN_NAV: NavGroup[] = [
  {
    section: 'Platform',
    items: [
      { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { label: 'Users', href: '/admin/users', icon: Users, matches: ['/admin/users'] },
    ],
  },
  {
    section: 'AI & services',
    items: [
      { label: 'AI management', href: '/admin/ai', icon: Bot },
      { label: 'OCR management', href: '/admin/ocr', icon: ScanLine },
      { label: 'System monitoring', href: '/admin/system', icon: Activity },
    ],
  },
  {
    section: 'Support',
    items: [
      {
        label: 'Tickets',
        href: '/admin/tickets',
        icon: HelpCircle,
        matches: ['/admin/tickets'],
      },
      { label: 'System alerts', href: '/admin/alerts', icon: Bell },
    ],
  },
  {
    section: 'Access',
    items: [
      { label: 'Roles & permissions', href: '/admin/roles', icon: Shield },
      { label: 'Audit logs', href: '/admin/audit', icon: ClipboardList },
    ],
  },
  {
    section: 'Content',
    items: [{ label: 'Content management', href: '/admin/content', icon: FileText }],
  },
  {
    section: 'Privacy',
    items: [{ label: 'Data & privacy', href: '/admin/privacy', icon: Lock }],
  },
];

/** Bottom tab bar on mobile. Everything else lives behind "More". */
export const USER_TABS: NavItem[] = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Expenses',
    href: '/ledger',
    icon: ArrowLeftRight,
    matches: ['/ledger', '/expenses'],
  },
  { label: 'Chat', href: '/chat', icon: Sparkles },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'More', href: '/more', icon: Settings },
];

export const ADMIN_TABS: NavItem[] = [
  { label: 'Home', href: '/admin', icon: LayoutDashboard },
  { label: 'Users', href: '/admin/users', icon: Users, matches: ['/admin/users'] },
  {
    label: 'Tickets',
    href: '/admin/tickets',
    icon: HelpCircle,
    matches: ['/admin/tickets'],
  },
  { label: 'Alerts', href: '/admin/alerts', icon: Bell },
  { label: 'More', href: '/admin/more', icon: Settings },
];

export function isActive(pathname: string, item: NavItem): boolean {
  const candidates = item.matches ?? [item.href];
  return candidates.some((c) =>
    c === '/admin' || c === '/dashboard' ? pathname === c : pathname.startsWith(c),
  );
}
