import React, { useEffect, useState } from 'react';
import { Link, usePathname } from 'expo-router';
import { Menu, X, LineChart, BarChart2, BookMarked } from 'lucide-react-native';

export type InsightsNavItem = {
  href: string;
  label: string;
  description?: string;
  icon: 'past' | 'forecast' | 'exam';
};

const ICONS = { past: BarChart2, forecast: LineChart, exam: BookMarked } as const;

export const INSIGHTS_DASHBOARD_NAV: InsightsNavItem[] = [
  {
    href: '/insights/past-paper-insights',
    label: 'Past paper analytics',
    description: 'Topic frequency & year trends',
    icon: 'past',
  },
  {
    href: '/insights/topic-prediction',
    label: 'Topic forecast',
    description: 'Weighted importance scores',
    icon: 'forecast',
  },
  {
    href: '/insights/exam-topics',
    label: 'Exam topics',
    description: 'Board-style topic focus',
    icon: 'exam',
  },
];

type WebInsightsDashboardLayoutProps = {
  children: React.ReactNode;
  /** Page background (hex) — sidebar uses a slightly different tone */
  pageBg: string;
  sidebarBg?: string;
};

/**
 * Web-only insights shell: mobile hamburger drawer + fixed sidebar from `lg`.
 * Main column is `min-w-0` so charts flex/scroll without blowing the viewport width.
 */
export default function WebInsightsDashboardLayout({
  children,
  pageBg,
  sidebarBg = '#0f1629',
}: WebInsightsDashboardLayoutProps) {
  const pathname = usePathname() ?? '';
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div
      className="min-h-[100dvh] w-full text-slate-100"
      style={{ backgroundColor: pageBg }}
    >
      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 px-3 py-3 sm:px-4 lg:hidden"
        style={{ backgroundColor: pageBg }}
      >
        <button
          type="button"
          aria-expanded={navOpen}
          aria-controls="insights-dashboard-nav"
          onClick={() => setNavOpen((o) => !o)}
          className="inline-flex h-11 min-w-11 touch-manipulation items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 text-white hover:bg-white/10"
        >
          {navOpen ? <X size={22} color="#fff" /> : <Menu size={22} color="#fff" />}
          <span className="sr-only">{navOpen ? 'Close menu' : 'Open menu'}</span>
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-bold tracking-wide text-slate-200 sm:text-base">
          Insights dashboard
        </p>
        <div className="h-11 w-11 shrink-0" aria-hidden />
      </header>

      {/* Dim overlay (mobile / tablet only) */}
      <button
        type="button"
        aria-label="Close navigation"
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity lg:hidden ${
          navOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setNavOpen(false)}
      />

      <div className="flex min-h-[calc(100dvh-3.5rem)] w-full flex-col lg:min-h-[100dvh] lg:flex-row lg:items-stretch">
        {/* Sidebar: off-canvas on small screens; in-flow sticky column from lg */}
        <aside
          id="insights-dashboard-nav"
          className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw-2.5rem,18rem)] flex-col border-r border-white/10 transition-transform duration-200 ease-out sm:w-72 lg:relative lg:inset-auto lg:z-20 lg:h-auto lg:min-h-[100dvh] lg:w-64 lg:flex-shrink-0 lg:translate-x-0 lg:shadow-none ${
            navOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
          }`}
          style={{ backgroundColor: sidebarBg }}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 lg:py-5">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/90 sm:text-xs">Insights</p>
              <p className="truncate text-base font-black text-white sm:text-lg">Study analytics</p>
            </div>
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 lg:hidden"
              aria-label="Close menu"
            >
              <X size={22} color="#fff" />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-y-contain p-3 pb-8">
            {INSIGHTS_DASHBOARD_NAV.map((item) => {
              const active = pathname === item.href || pathname.replace(/\/$/, '') === item.href;
              const Icon = ICONS[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href as never}
                  onPress={() => setNavOpen(false)}
                  className={`flex min-h-[3rem] touch-manipulation items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                    active
                      ? 'border-cyan-500/50 bg-cyan-500/15 text-white'
                      : 'border-transparent bg-transparent text-slate-300 hover:border-white/10 hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      active ? 'bg-cyan-500/25 text-cyan-200' : 'bg-white/5 text-slate-400'
                    }`}
                  >
                    <Icon size={18} color={active ? '#a5f3fc' : '#94a3b8'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-snug sm:text-base">{item.label}</span>
                    {item.description ? (
                      <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{item.description}</span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-visible lg:max-h-[100dvh] lg:overflow-y-auto lg:overscroll-y-contain lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <div className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 pb-20 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8 lg:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Recharts needs a parent with explicit height; outer wrapper allows horizontal scroll on tiny screens.
 */
export function ResponsiveChartBox({
  children,
  className = '',
  innerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  /** Override default responsive heights for the chart viewport (Tailwind classes). */
  innerClassName?: string;
}) {
  const inner =
    innerClassName ??
    'mx-auto h-[220px] w-full min-w-[260px] sm:h-[260px] md:h-[300px] lg:h-[320px] xl:h-[340px]';
  return (
    <div
      className={`w-full max-w-full min-h-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] ${className}`}
    >
      <div className={inner}>{children}</div>
    </div>
  );
}
