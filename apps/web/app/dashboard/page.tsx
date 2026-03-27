"use client";

/**
 * app/dashboard/page.tsx — Overview dashboard
 *
 * WHY "use client":
 * This page has a live activity feed that auto-updates every 8s via setInterval,
 * chart animations that require client-side rendering, and skeleton loading states.
 * All of this requires client-side React state — server components can't do timers.
 *
 * DATA STRATEGY:
 * KPIs and payments are fetched via the /api/dashboard/kpis and /api/dashboard/payments
 * API routes which use Redis caching. On cache hit: <20ms. On miss: ~200ms DB query.
 *
 * PROTOTYPE SOURCE: D:\PRSAAS\web_prototype\app\dashboard\page.tsx
 * All CSS classes, layout, and animations are copied directly from the prototype.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  TrendingUp, AlertCircle, Zap, Percent, Activity,
  CalendarDays, Download, ArrowUpRight, ArrowDownRight,
  X, Mail, MessageSquare, RefreshCw, Pause, Play, Unplug, CheckCircle,
} from "lucide-react";
import { cn, resolveCustomerDisplay } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import type { DashboardKpis, RecentPayment, GatewayStatus, AnalyticsPoint } from "@/lib/cache/dashboard";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityType = "recovered" | "email" | "whatsapp" | "scheduled" | "hard_decline" | "new_failure";

interface ActivityItem {
  id: number;
  text: string;
  createdAt: number;
  type: ActivityType;
  isNew?: boolean;
}

// ─── Static demo activity (replaced by real events via SSE in v2) ─────────────

const initialActivityItems: Omit<ActivityItem, "id" | "createdAt">[] = [
  { text: "₹4,299 recovered — Razorpay retry #2 succeeded", type: "recovered" },
  { text: "Email #2 sent to priya@startup.in", type: "email" },
  { text: "WhatsApp reminder sent to raj@example.com", type: "whatsapp" },
  { text: "₹8,500 recovered — Customer updated card via portal", type: "recovered" },
  { text: "New failed payment: amit@venture.com ₹19,999", type: "new_failure" },
  { text: "Hard decline detected — skipping retries", type: "hard_decline" },
  { text: 'Campaign "7-day aggressive" triggered for nisha@...', type: "scheduled" },
  { text: "₹6,499 scheduled for retry on next payday window", type: "scheduled" },
];

const incomingActivities: Omit<ActivityItem, "id" | "createdAt">[] = [
  { text: "₹7,200 recovered — Stripe retry #3 succeeded", type: "recovered" },
  { text: "WhatsApp payment link sent to dev@saas.io", type: "whatsapp" },
  { text: "Email #1 sent to finance@corp.in", type: "email" },
  { text: "₹3,499 recovered — UPI mandate renewed", type: "recovered" },
  { text: "New failed payment: ops@startup.co ₹15,000", type: "new_failure" },
  { text: "Retry scheduled for kiran@app.dev on next payday", type: "scheduled" },
  { text: "₹11,200 recovered — Card updated via portal", type: "recovered" },
  { text: "Hard decline: bank rejected — no retries", type: "hard_decline" },
];

const activityTypeConfig: Record<ActivityType, { icon: typeof ArrowUpRight; iconClass: string }> = {
  recovered:    { icon: ArrowUpRight,   iconClass: "text-rx-green" },
  email:        { icon: Mail,           iconClass: "text-rx-blue" },
  whatsapp:     { icon: MessageSquare,  iconClass: "text-rx-green" },
  scheduled:    { icon: RefreshCw,      iconClass: "text-rx-amber" },
  hard_decline: { icon: X,             iconClass: "text-rx-red" },
  new_failure:  { icon: AlertCircle,   iconClass: "text-rx-red" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatRupee = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const formatRelativeTime = (timestamp: number) => {
  const diffS = Math.floor((Date.now() - timestamp) / 1000);
  if (diffS < 60) return "just now";
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  return `${diffH}h ago`;
};

const statusStyles: Record<string, string> = {
  just_failed:    "bg-rx-red-dim text-rx-red",
  retrying:       "bg-rx-amber-dim text-rx-amber",
  email_sent:     "bg-rx-blue-dim text-rx-blue",
  whatsapp_sent:  "bg-rx-green-dim text-rx-green",
  recovered:      "bg-rx-green text-background",
  hard_declined:  "bg-rx-red-dim text-rx-red",
  scheduled:      "bg-rx-overlay text-rx-text-secondary",
  cancelled:      "bg-rx-overlay text-rx-text-muted",
};

const gatewayPillStyles: Record<string, string> = {
  razorpay: "bg-rx-blue-dim text-rx-blue",
  stripe:   "bg-[hsl(239_84%_67%/0.15)] text-[hsl(239_84%_67%)]",
  cashfree: "bg-rx-green-dim text-rx-green",
  payu:     "bg-rx-amber-dim text-rx-amber",
};

const gatewayColors: Record<string, string> = {
  razorpay: "hsl(var(--razorpay))",
  stripe:   "hsl(var(--stripe))",
  cashfree: "hsl(var(--cashfree))",
  payu:     "hsl(var(--payu))",
};

// ─── Custom Tooltips ──────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-rx-elevated border border-border rounded-lg px-3.5 py-2.5 shadow-2xl">
      <p className="text-xs font-body text-rx-text-muted mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-sm font-mono">
          <span className={p.dataKey === "recovered" ? "text-rx-green-text" : "text-rx-red"}>
            {formatRupee(p.value * 100)}
          </span>
          <span className="text-rx-text-muted ml-2 text-xs font-body">
            {p.dataKey === "recovered" ? "Recovered" : "Failed"}
          </span>
        </p>
      ))}
    </div>
  );
};

const BarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-rx-elevated border border-border rounded-lg px-3.5 py-2.5 shadow-2xl">
      <p className="text-xs font-body text-rx-text-muted mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-sm font-mono">
          <span className={p.dataKey === "fynback" ? "text-rx-green-text" : "text-rx-text-muted"}>
            {p.value}%
          </span>
          <span className="text-rx-text-muted ml-2 text-xs font-body">
            {p.dataKey === "fynback" ? "FynBack" : "Baseline"}
          </span>
        </p>
      ))}
    </div>
  );
};

// Performance comparison data (static — would come from analytics in v2)
const performanceData = [
  { type: "Insufficient funds", fynback: 82, baseline: 41 },
  { type: "Card expired",       fynback: 71, baseline: 8 },
  { type: "UPI mandate failed", fynback: 68, baseline: 35 },
  { type: "Do not honor",       fynback: 54, baseline: 28 },
  { type: "Network error",      fynback: 91, baseline: 75 },
  { type: "Bank decline",       fynback: 49, baseline: 22 },
];

// Channel distribution (static — from analytics snapshots in v2)
const channelData = [
  { name: "WhatsApp",    value: 42, color: "hsl(var(--accent-green))" },
  { name: "Email",       value: 31, color: "hsl(var(--accent-blue))" },
  { name: "Retry only",  value: 19, color: "#8b5cf6" },
  { name: "Self-service",value: 8,  color: "hsl(var(--accent-amber))" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // ─── Data state ──────────────────────────────────────────────────────────
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [payments, setPayments] = useState<RecentPayment[]>([]);
  const [gateways, setGateways] = useState<GatewayStatus[]>([]);
  const [analyticsHistory, setAnalyticsHistory] = useState<AnalyticsPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasGateway, setHasGateway] = useState(false);

  // ─── Live Activity Feed ───────────────────────────────────────────────────
  const now = useRef(Date.now());
  const nextId = useRef(9);
  const incomingIdx = useRef(0);
  const [activities, setActivities] = useState<ActivityItem[]>(() =>
    initialActivityItems.map((item, i) => ({
      ...item,
      id: i + 1,
      createdAt: now.current - [120, 300, 480, 720, 1080, 1080, 1440, 1860][i] * 1000,
    }))
  );
  const [isPaused, setIsPaused] = useState(false);
  const [, setTick] = useState(0);

  // ─── Fetch dashboard data ─────────────────────────────────────────────────
  useEffect(() => {
    async function loadDashboard() {
      try {
        const [kpisRes, paymentsRes, gatewaysRes, analyticsRes] = await Promise.all([
          fetch("/api/dashboard/kpis"),
          fetch("/api/dashboard/payments?limit=6"),
          fetch("/api/dashboard/gateways"),
          fetch("/api/dashboard/analytics"),
        ]);

        if (kpisRes.ok) {
          const data = await kpisRes.json();
          setKpis(data);
        }
        if (paymentsRes.ok) {
          const data = await paymentsRes.json();
          setPayments(data);
        }
        if (gatewaysRes.ok) {
          const data = await gatewaysRes.json();
          setGateways(data);
          setHasGateway(data.length > 0);
        }
        if (analyticsRes.ok) {
          const data = await analyticsRes.json();
          setAnalyticsHistory(data);
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, []);

  // ─── Activity feed timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      const incoming = incomingActivities[incomingIdx.current % incomingActivities.length];
      incomingIdx.current++;
      const newItem: ActivityItem = {
        ...incoming,
        id: nextId.current++,
        createdAt: Date.now(),
        isNew: true,
      };
      setActivities((prev) => {
        const updated = [newItem, ...prev.slice(0, 7)];
        setTimeout(() => {
          setActivities((curr) =>
            curr.map((a) => (a.id === newItem.id ? { ...a, isNew: false } : a))
          );
        }, 350);
        return updated;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [isPaused]);

  // Update relative timestamps every 30s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Convert analytics history to chart format (amounts in thousands of rupees)
  const recoveryData = analyticsHistory.map((p) => ({
    date: new Date(p.snapshotDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    failed: p.failedAmountPaise / 100,
    recovered: p.recoveredAmountPaise / 100,
  }));

  const recoveryRate = kpis?.recoveryRatePct ?? 0;

  // ─── Empty state — no gateway connected ──────────────────────────────────
  if (!isLoading && !hasGateway) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-rx-surface border border-border rounded-xl mt-6">
        <div className="w-16 h-16 rounded-2xl bg-rx-overlay flex items-center justify-center mb-6">
          <Unplug size={32} className="text-rx-text-muted" strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-heading font-bold text-rx-text-primary mb-2">
          Connect your first gateway to start recovering payments
        </h2>
        <p className="text-sm font-body text-rx-text-muted mb-8 max-w-md">
          FynBack needs to connect to your payment processor to detect failed payments
          and automatically trigger recovery flows.
        </p>
        <a
          href="/dashboard/gateways"
          className="px-6 py-2.5 rounded-lg bg-rx-blue text-sm font-heading font-semibold text-white btn-glow hover:opacity-90 transition-opacity flex items-center gap-2 mb-4"
        >
          Connect Razorpay <ArrowUpRight size={16} />
        </a>
        <p className="text-xs font-body text-rx-text-muted">Also supports: Stripe · Cashfree · PayU</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Mobile pull-to-refresh hint */}
      <div className="md:hidden flex items-center justify-center -mt-2 pb-2 text-[10px] text-rx-text-muted font-body animate-pulse">
        <RefreshCw size={12} className="mr-1.5" /> Pull down to refresh
      </div>

      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-fade-up" style={{ animationDelay: "0ms" }}>
        <div>
          <h1 className="text-2xl font-heading font-bold text-rx-text-primary">
            Recovery overview
          </h1>
          <p className="text-sm font-body text-rx-text-muted mt-1">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-rx-surface text-sm font-body text-rx-text-secondary hover:border-rx-text-muted/30 transition-colors">
            <CalendarDays size={14} /> Last 30 days
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-body text-rx-text-muted hover:text-rx-text-secondary transition-colors">
            <Download size={14} /> Export
          </button>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4 animate-fade-up" style={{ animationDelay: "80ms" }}>
        {/* Card 1: Recovered MRR */}
        <div className="kpi-card bg-rx-surface border border-border rounded-xl p-3.5 sm:p-5 relative overflow-hidden">
          <div className="kpi-noise" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-rx-green-dim flex items-center justify-center">
                <TrendingUp size={16} className="text-rx-green sm:w-5 sm:h-5" />
              </div>
              <span className="text-[11px] sm:text-[13px] font-body text-rx-text-muted">Recovered this month</span>
            </div>
            {isLoading ? (
              <>
                <div className="h-8 sm:h-10 w-32 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] mt-1 mb-2" />
                <div className="h-4 w-24 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
              </>
            ) : (
              <>
                <p className="text-[24px] sm:text-[32px] font-heading font-bold text-rx-green-text font-mono animate-money-shimmer">
                  {kpis ? formatRupee(kpis.totalRecoveredPaise) : "₹0"}
                </p>
                <div className="mt-3 h-[3px] rounded-full bg-rx-overlay overflow-hidden">
                  <div
                    className="h-full rounded-full bg-rx-green"
                    style={{
                      width: `${kpis && kpis.totalFailedPaise > 0
                        ? (kpis.totalRecoveredPaise / kpis.totalFailedPaise) * 100
                        : 0}%`,
                    }}
                  />
                </div>
                <p className="hidden sm:block text-[11px] text-rx-text-muted font-body mt-1.5">
                  <span className="font-mono text-rx-green-text">{kpis ? formatRupee(kpis.totalRecoveredPaise) : "₹0"}</span>
                  {" "}of{" "}
                  <span className="font-mono">{kpis ? formatRupee(kpis.totalFailedPaise) : "₹0"}</span> failed
                </p>
              </>
            )}
          </div>
        </div>

        {/* Card 2: At risk */}
        <div className="kpi-card bg-rx-surface border border-border rounded-xl p-3.5 sm:p-5 relative overflow-hidden">
          <div className="kpi-noise" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-rx-amber-dim flex items-center justify-center">
                <AlertCircle size={16} className="text-rx-amber sm:w-5 sm:h-5" />
              </div>
              <span className="text-[11px] sm:text-[13px] font-body text-rx-text-muted">Currently at risk</span>
            </div>
            {isLoading ? (
              <>
                <div className="h-8 sm:h-10 w-24 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] mt-1 mb-2" />
                <div className="h-4 w-20 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
              </>
            ) : (
              <p className="text-[24px] sm:text-[32px] font-heading font-bold text-rx-amber font-mono">
                {kpis ? formatRupee(kpis.totalAtRiskPaise) : "₹0"}
              </p>
            )}
          </div>
        </div>

        {/* Card 3: Active campaigns */}
        <div className="kpi-card bg-rx-surface border border-border rounded-xl p-3.5 sm:p-5 relative overflow-hidden">
          <div className="kpi-noise" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-rx-blue-dim flex items-center justify-center">
                <Zap size={16} className="text-rx-blue sm:w-5 sm:h-5" />
              </div>
              <span className="text-[11px] sm:text-[13px] font-body text-rx-text-muted">Active campaigns</span>
            </div>
            {isLoading ? (
              <>
                <div className="h-8 sm:h-10 w-12 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] mt-1 mb-2" />
                <div className="h-4 w-28 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
              </>
            ) : (
              <>
                <p className="text-[24px] sm:text-[32px] font-heading font-bold text-rx-text-primary">
                  {kpis?.activeCampaignsCount ?? 0}
                </p>
                <p className="hidden sm:block text-xs text-rx-text-muted font-body mt-2">
                  {kpis ? `${kpis.failedCount - kpis.recoveredCount} payments in flow` : "0 in flow"}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Card 4: Recovery rate — Arc meter */}
        <div className="kpi-card bg-rx-surface border border-border rounded-xl p-3.5 sm:p-5 relative overflow-hidden">
          <div className="kpi-noise" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-rx-green-dim flex items-center justify-center">
                <Percent size={16} className="text-rx-green sm:w-5 sm:h-5" />
              </div>
              <span className="text-[11px] sm:text-[13px] font-body text-rx-text-muted">Overall recovery rate</span>
            </div>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center mt-2">
                <div className="w-[80px] h-[80px] sm:w-[120px] sm:h-[120px] rounded-full bg-rx-overlay animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center my-1 sm:my-2">
                  <div
                    className="arc-meter relative w-[80px] h-[80px] sm:w-[120px] sm:h-[120px] rounded-full"
                    style={{ "--arc-target": `${recoveryRate}%` } as React.CSSProperties}
                  >
                    <div className="absolute inset-[10px] sm:inset-[14px] rounded-full bg-rx-surface z-10" />
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                      <span className="text-[18px] sm:text-[28px] font-heading font-bold text-rx-green-text font-mono">
                        {recoveryRate}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center justify-center gap-1.5 text-xs">
                  <span className="flex items-center gap-0.5 text-rx-green font-mono">
                    <ArrowUpRight size={12} /> Industry avg: 23%
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Card 5: Payments processed */}
        <div className="kpi-card bg-rx-surface border border-border rounded-xl p-3.5 sm:p-5 relative overflow-hidden col-span-2 xl:col-span-1">
          <div className="kpi-noise" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-rx-blue-dim flex items-center justify-center">
                <Activity size={16} className="text-rx-blue sm:w-5 sm:h-5" />
              </div>
              <span className="text-[11px] sm:text-[13px] font-body text-rx-text-muted">Failed payments</span>
            </div>
            {isLoading ? (
              <>
                <div className="h-8 sm:h-10 w-24 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] mt-1 mb-2" />
                <div className="h-4 w-20 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
              </>
            ) : (
              <>
                <p className="text-[24px] sm:text-[32px] font-heading font-bold text-rx-text-primary font-mono">
                  {kpis?.failedCount?.toLocaleString("en-IN") ?? "0"}
                </p>
                <p className="hidden sm:block text-xs text-rx-text-muted font-body mt-2">All time</p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Charts Row */}
      <section className="relative grid grid-cols-1 lg:grid-cols-5 gap-4 animate-fade-up" style={{ animationDelay: "160ms" }}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: "rgba(59,130,246,0.04)", filter: "blur(120px)" }} />

        {/* Area Chart — Recovery Trend */}
        <div className="lg:col-span-3 bg-rx-surface border border-border rounded-xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 sm:mb-4 gap-2">
            <h2 className="text-base font-heading font-semibold text-rx-text-primary">Recovery trend</h2>
            <div className="flex flex-wrap gap-1 text-[10px] sm:text-xs font-body">
              {["All", "Razorpay", "Stripe", "Cashfree"].map((t, i) => (
                <button key={t} className={cn("px-2 py-1 sm:px-2.5 rounded-md transition-colors", i === 0 ? "bg-rx-overlay text-rx-text-primary" : "text-rx-text-muted hover:text-rx-text-secondary")}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Sparkline */}
          <div className="md:hidden mt-2">
            <div className="mb-2">
              <span className="text-[28px] font-heading font-bold text-rx-green-text font-mono leading-none">
                {kpis ? formatRupee(kpis.totalRecoveredPaise) : "₹0"}
              </span>
              <span className="text-xs text-rx-text-muted font-body ml-2">Total Recovered</span>
            </div>
            {isLoading ? (
              <div className="w-full h-[80px] bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
            ) : (
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={recoveryData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradRecoveredMob" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent-green))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--accent-green))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="recovered" stroke="hsl(var(--accent-green))" fill="url(#gradRecoveredMob)" strokeWidth={2} dot={false} isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Desktop Full Chart */}
          <div className="hidden md:block">
            {isLoading ? (
              <div className="w-full h-[260px] bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
            ) : recoveryData.length === 0 ? (
              <div className="w-full h-[260px] flex items-center justify-center text-sm font-body text-rx-text-muted">
                No data yet — recovery trend will appear once payments are processed.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={recoveryData}>
                  <defs>
                    <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent-red))" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="hsl(var(--accent-red))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradRecovered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent-green))" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(var(--accent-green))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-default))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--text-muted))", fontFamily: "DM Sans" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--text-muted))", fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <ReTooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="failed" stroke="hsl(var(--accent-red))" fill="url(#gradFailed)" strokeWidth={2} dot={false} isAnimationActive />
                  <Area type="monotone" dataKey="recovered" stroke="hsl(var(--accent-green))" fill="url(#gradRecovered)" strokeWidth={2} dot={false} isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Donut — Recovery by channel */}
        <div className="lg:col-span-2 bg-rx-surface border border-border rounded-xl p-5">
          <h2 className="text-base font-heading font-semibold text-rx-text-primary mb-4">Recovery by channel</h2>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center">
              <div className="w-[200px] h-[200px] rounded-full bg-rx-overlay animate-[skeleton-pulse_2s_ease-in-out_infinite] mb-6" />
              <div className="w-full space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex justify-between items-center w-full">
                    <div className="h-4 w-24 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
                    <div className="h-4 w-16 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <div className="relative">
                  <PieChart width={200} height={200}>
                    <Pie data={channelData} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={2} isAnimationActive>
                      {channelData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[28px] font-mono font-bold text-rx-green-text">{recoveryRate}%</span>
                    <span className="text-[11px] font-body text-rx-text-muted">recovery rate</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {channelData.map((ch) => (
                  <div key={ch.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: ch.color }} />
                      <span className="font-body text-rx-text-secondary">{ch.name}</span>
                    </div>
                    <span className="font-mono text-rx-text-secondary">{ch.value}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Gateway Status */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-fade-up" style={{ animationDelay: "240ms" }}>
        {isLoading ? (
          [...Array(2)].map((_, i) => (
            <div key={i} className="bg-rx-surface border border-border rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-rx-overlay animate-[skeleton-pulse_2s_ease-in-out_infinite] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
                <div className="h-3 w-16 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
              </div>
            </div>
          ))
        ) : gateways.length === 0 ? (
          <div className="col-span-full text-sm font-body text-rx-text-muted text-center py-6">
            No gateways connected. <a href="/dashboard/gateways" className="text-rx-blue hover:underline">Connect one →</a>
          </div>
        ) : (
          gateways.map((gw) => {
            const lastSeen = gw.lastWebhookAt
              ? formatRelativeTime(new Date(gw.lastWebhookAt).getTime())
              : "Never";
            return (
              <div key={gw.gatewayName} className="bg-rx-surface border border-border rounded-xl p-4 card-hover flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-heading font-bold shrink-0"
                  style={{ background: gatewayColors[gw.gatewayName] ?? "#6b7280", color: "#fff" }}
                >
                  {gw.gatewayName[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-semibold text-sm text-rx-text-primary capitalize">{gw.gatewayName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md font-body bg-rx-green-dim text-rx-green">
                      Connected
                    </span>
                  </div>
                  <span className="text-[11px] font-body text-rx-text-muted">{lastSeen}</span>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Recent Payments Table + Live Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4 animate-fade-up" style={{ animationDelay: "320ms" }}>
        {/* Table */}
        <div className="lg:col-span-3 bg-rx-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-base font-heading font-semibold text-rx-text-primary">Recent failed payments</h2>
            <a href="/dashboard/payments" className="text-xs font-body text-rx-blue hover:underline">View all →</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-body text-rx-text-muted">
                  <th className="text-left px-5 py-3 font-medium">Customer</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-left px-4 py-3 font-medium">Gateway</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Reason</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-5 py-4"><div className="h-4 w-[60%] bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-16 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] ml-auto" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-20 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" /></td>
                      <td className="px-4 py-4 hidden md:table-cell"><div className="h-4 w-[70%] bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-24 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" /></td>
                      <td className="px-5 py-4"><div className="h-6 w-16 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] ml-auto" /></td>
                    </tr>
                  ))
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <CheckCircle size={32} className="text-rx-green mb-4" strokeWidth={1.5} />
                        <h3 className="text-base font-heading font-medium text-rx-text-primary mb-1">No failed payments yet</h3>
                        <p className="text-sm font-body text-rx-text-muted">They will appear here as they come in from your gateways.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-rx-overlay/50 transition-colors cursor-pointer">
                      <td className="px-5 py-3 font-body text-rx-text-secondary">{resolveCustomerDisplay(p.customerEmail, p.customerPhone)}</td>
                      <td className="px-4 py-3 text-right font-mono text-rx-text-primary">{formatRupee(p.amountPaise)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[11px] px-1.5 py-0.5 rounded-md font-body", gatewayPillStyles[p.gatewayName] ?? "bg-rx-overlay text-rx-text-secondary")}>
                          {p.gatewayName}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-body text-rx-text-muted hidden md:table-cell">{p.declineCategory.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[11px] px-2 py-1 rounded-md font-body inline-flex items-center gap-1", statusStyles[p.status] ?? "bg-rx-overlay text-rx-text-secondary")}>
                          {p.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {p.status === "just_failed" ? (
                          <button className="text-xs px-2.5 py-1 rounded-md border border-rx-blue text-rx-blue hover:bg-rx-blue-dim transition-colors font-body">
                            Retry now
                          </button>
                        ) : (
                          <button className="text-xs text-rx-text-muted hover:text-rx-text-secondary font-body transition-colors">View</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="lg:col-span-2 bg-rx-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rx-green animate-live-pulse" />
              <h2 className="text-base font-heading font-semibold text-rx-text-primary">Live activity</h2>
            </div>
            <button
              onClick={() => setIsPaused((p) => !p)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-body text-rx-text-muted hover:text-rx-text-secondary hover:bg-rx-overlay transition-colors"
            >
              {isPaused ? <Play size={12} /> : <Pause size={12} />}
              {isPaused ? "Resume" : "Pause"}
            </button>
          </div>
          <div className="relative">
            <div className="max-h-[400px] overflow-y-auto">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-4 border-b border-border last:border-0">
                    <div className="w-4 h-4 rounded-md bg-rx-overlay animate-[skeleton-pulse_2s_ease-in-out_infinite] shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2.5">
                      <div className={`h-3 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] ${i % 2 === 0 ? "w-[90%]" : "w-[75%]"}`} />
                      <div className="h-2.5 w-12 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
                    </div>
                  </div>
                ))
              ) : (
                activities.map((item) => {
                  const config = activityTypeConfig[item.type];
                  const IconComp = config.icon;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-start gap-3 px-5 py-3 border-b border-border last:border-0 transition-colors",
                        item.isNew && "animate-slide-in-top"
                      )}
                    >
                      <div className={cn("mt-0.5 shrink-0", config.iconClass)}>
                        <IconComp size={14} />
                      </div>
                      <p className="flex-1 text-sm font-body text-rx-text-secondary leading-snug">
                        {item.text.split(/(₹[\d,]+)/).map((part, j) =>
                          part.match(/₹[\d,]+/) ? (
                            <span key={j} className="font-mono text-rx-green-text">{part}</span>
                          ) : (
                            part
                          )
                        )}
                      </p>
                      <span className="text-[11px] font-body text-rx-text-muted whitespace-nowrap">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-t from-rx-surface to-transparent" />
          </div>
        </div>
      </section>

      {/* Performance Bar Chart */}
      <section className="bg-rx-surface border border-border rounded-xl p-5 animate-fade-up" style={{ animationDelay: "400ms" }}>
        <div className="mb-1">
          <h2 className="text-base font-heading font-semibold text-rx-text-primary">Recovery performance by decline type</h2>
          <p className="text-xs font-body text-rx-text-muted mt-1">How FynBack handles each failure reason vs payment processor baseline</p>
        </div>
        {isLoading ? (
          <div className="w-full h-[300px] bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] mt-4" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={performanceData} layout="vertical" margin={{ left: 20, right: 20, top: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-default))" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: "hsl(var(--text-muted))", fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <YAxis dataKey="type" type="category" width={130} tick={{ fontSize: 12, fill: "hsl(var(--text-secondary))", fontFamily: "DM Sans" }} axisLine={false} tickLine={false} />
              <ReTooltip content={<BarTooltip />} />
              <Bar dataKey="baseline" fill="hsl(var(--bg-overlay))" stroke="hsl(var(--border-strong))" radius={[0, 4, 4, 0]} barSize={10} isAnimationActive name="Baseline" />
              <Bar dataKey="fynback" fill="hsl(var(--accent-green))" radius={[0, 4, 4, 0]} barSize={10} isAnimationActive name="FynBack" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
