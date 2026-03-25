"use client";

/**
 * app/dashboard/analytics/page.tsx — Full analytics page
 *
 * WHY "use client": Time period selector, gateway filters, heatmap interactions,
 * compare mode toggle — all require client state.
 *
 * DATA STRATEGY:
 * - Primary timeline chart: fetches from /api/dashboard/analytics (real DB data)
 * - KPI strip, cohort table, decline codes: static data matching prototype
 *   (will be wired to real analytics snapshots in a future sprint)
 *
 * PROTOTYPE SOURCE: D:\PRSAAS\web_prototype\app\dashboard\analytics\page.tsx
 * All CSS classes, layout, helpers, and animations copied directly.
 */

import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart3, Mail, FileText, Download, TrendingUp, Percent,
  AlertTriangle, ArrowUpRight, Clock, Activity, Calendar,
  ChevronDown, Flag, Printer, Link as LinkIcon, X,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, RadialBarChart, RadialBar,
  PieChart, Pie, Cell, Bar, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, LineChart as RechartsLineChart,
} from "recharts";
import type { AnalyticsPoint } from "@/lib/cache/dashboard";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimePeriod = "7d" | "30d" | "90d" | "6m" | "1y";
type Gateway = "razorpay" | "stripe" | "cashfree" | "payu" | "all";

// ─── Static prototype data (wired to real DB in future sprint) ────────────────

const cohortData = [
  { month: "Oct 2024", retry: 41, email: 18, whatsapp: 14, recovering: 0,  lost: 27 },
  { month: "Nov 2024", retry: 38, email: 20, whatsapp: 16, recovering: 0,  lost: 26 },
  { month: "Dec 2024", retry: 43, email: 19, whatsapp: 15, recovering: 0,  lost: 23 },
  { month: "Jan 2025", retry: 40, email: 22, whatsapp: 17, recovering: 2,  lost: 19 },
  { month: "Feb 2025", retry: 39, email: 24, whatsapp: 19, recovering: 4,  lost: 14 },
  { month: "Mar 2025", retry: 35, email: 18, whatsapp: 14, recovering: 22, lost: 11 },
];

const declineCodes = [
  { code: "insufficient_funds",      label: "Insufficient funds",  count: 52, failedAmount: 1240000, recoveredAmount: 1017600, rate: 82, trend: "up",   trendPct: 8 },
  { code: "card_expired",            label: "Card expired",        count: 34, failedAmount: 890000,  recoveredAmount: 631900,  rate: 71, trend: "flat",  trendPct: 0 },
  { code: "upi_mandate_failed",      label: "UPI mandate failed",  count: 29, failedAmount: 720000,  recoveredAmount: 489600,  rate: 68, trend: "up",   trendPct: 5 },
  { code: "do_not_honor",            label: "Do not honor",        count: 23, failedAmount: 610000,  recoveredAmount: 329400,  rate: 54, trend: "down", trendPct: 3 },
  { code: "network_error",           label: "Network/timeout",     count: 18, failedAmount: 380000,  recoveredAmount: 345800,  rate: 91, trend: "up",   trendPct: 12 },
  { code: "bank_decline",            label: "Generic bank decline",count: 15, failedAmount: 290000,  recoveredAmount: 142100,  rate: 49, trend: "down", trendPct: 6 },
  { code: "insufficient_upi_balance",label: "UPI balance low",     count: 12, failedAmount: 198000,  recoveredAmount: 158400,  rate: 80, trend: "up",   trendPct: 15 },
  { code: "stolen_card",             label: "Stolen/fraud",        count: 8,  failedAmount: 380000,  recoveredAmount: 0,       rate: 0,  trend: "flat",  trendPct: 0 },
];

const topRecoveries = [
  { rank: 1, email: "vikram@enterprise.in",  company: "Enterprise Ltd", gateway: "razorpay", amount: 4999900, channel: "Auto-retry + WA",  daysToRecover: 2.1, date: "Mar 27" },
  { rank: 2, email: "harsh@fintech.in",       company: "FinTech Co",     gateway: "razorpay", amount: 2999900, channel: "Email → portal",   daysToRecover: 1.3, date: "Mar 22" },
  { rank: 3, email: "arjun@edtech.co",        company: "EdTech Co",      gateway: "stripe",   amount: 1499900, channel: "WhatsApp",          daysToRecover: 0.8, date: "Mar 25" },
  { rank: 4, email: "karthik@saasco.in",      company: "SaaSCo",         gateway: "stripe",   amount: 1280000, channel: "Auto-retry",        daysToRecover: 3.2, date: "Mar 20" },
  { rank: 5, email: "sunita@startup.co",      company: "Startup Co",     gateway: "stripe",   amount: 999900,  channel: "Email #3 + retry",  daysToRecover: 4.7, date: "Mar 19" },
];

const radialData = [
  { name: "Auto-retry", value: 35, fill: "hsl(var(--accent-green))" },
  { name: "Email",      value: 28, fill: "hsl(var(--accent-blue))" },
  { name: "WhatsApp",   value: 24, fill: "#10b981" },
  { name: "Portal",     value: 13, fill: "hsl(var(--accent-amber))" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatINR = (paise: number): string =>
  "₹" + (paise / 100).toLocaleString("en-IN");

const formatINRLakh = (paise: number): string => {
  const rupees = paise / 100;
  if (rupees >= 100000) return "₹" + (rupees / 100000).toFixed(1) + "L";
  return formatINR(paise);
};

// ─── Chart Tooltips ───────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const failed = payload.find((p: any) => p.dataKey === "failed")?.value || 0;
  const recovered = payload.find((p: any) => p.dataKey === "recovered")?.value || 0;
  const rate = failed > 0 ? Math.round((recovered / failed) * 100) : 0;
  return (
    <div className="bg-rx-elevated border border-border rounded-[10px] p-[12px_16px] shadow-[0_8px_40px_rgba(0,0,0,0.5)] text-[13px] text-rx-text-primary min-w-[180px] font-body">
      <p className="mb-3 font-medium">{label}</p>
      <div className="flex justify-between gap-6 py-0.5">
        <span className="text-rx-text-muted">Failed:</span>
        <span className="font-mono text-rx-red">{formatINR(failed)}</span>
      </div>
      <div className="flex justify-between gap-6 py-0.5">
        <span className="text-rx-text-muted">Recovered:</span>
        <span className="font-mono text-rx-green-text">{formatINR(recovered)}</span>
      </div>
      <div className="flex justify-between gap-6 py-0.5 mt-1 border-t border-border pt-1">
        <span className="text-rx-text-muted">Rate:</span>
        <span className="font-mono text-rx-green-text">{rate}%</span>
      </div>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [activePeriod, setActivePeriod] = useState<TimePeriod>("30d");
  const [compareMode, setCompareMode] = useState(false);
  const [activeGateways, setActiveGateways] = useState<Gateway[]>(["all"]);
  const [isLoading, setIsLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsPoint[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [isCohortExpanded, setIsCohortExpanded] = useState(false);

  // Fetch real analytics data
  useEffect(() => {
    const days = activePeriod === "7d" ? 7 : activePeriod === "30d" ? 30 : activePeriod === "90d" ? 90 : activePeriod === "6m" ? 180 : 365;
    fetch(`/api/dashboard/analytics?days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAnalyticsData(data);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [activePeriod]);

  const handlePeriodChange = (p: TimePeriod) => {
    setActivePeriod(p);
    setIsLoading(true);
  };

  const toggleGateway = (gw: Gateway) => {
    if (gw === "all") {
      setActiveGateways(["all"]);
    } else {
      let next: Gateway[] = activeGateways.filter((g) => g !== "all");
      if (next.includes(gw)) next = next.filter((g) => g !== gw);
      else next.push(gw);
      if (next.length === 0) next = ["all"];
      setActiveGateways(next);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setToastMessage("Link copied!");
    setTimeout(() => setToastMessage(null), 2000);
  };

  // Convert analytics snapshots → chart format (amounts in paise for display)
  const timelineData = analyticsData.map((p) => ({
    date: new Date(p.snapshotDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    failed: p.failedAmountPaise,
    recovered: p.recoveredAmountPaise,
  }));

  const enhancedTimelineData = useMemo(() =>
    timelineData.map((d) => ({
      ...d,
      failedPrev: compareMode ? Math.round(d.failed * 0.85) : undefined,
      recoveredPrev: compareMode ? Math.round(d.recovered * 0.82) : undefined,
    })),
  [timelineData, compareMode]);

  // Summary KPIs from real data
  const totalRecovered = analyticsData.reduce((s, p) => s + p.recoveredAmountPaise, 0);
  const totalFailed = analyticsData.reduce((s, p) => s + p.failedAmountPaise, 0);
  const avgRate = totalFailed > 0 ? Math.round((totalRecovered / totalFailed) * 100) : 0;

  const gatewayBtns: { key: Gateway; label: string; color: string }[] = [
    { key: "all",      label: "All gateways", color: "" },
    { key: "razorpay", label: "Razorpay",     color: "#3b82f6" },
    { key: "stripe",   label: "Stripe",       color: "#6366f1" },
    { key: "cashfree", label: "Cashfree",     color: "#f97316" },
    { key: "payu",     label: "PayU",         color: "#10b981" },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] pb-24">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-rx-green text-background text-sm font-body px-4 py-2 rounded-lg shadow-lg">
          {toastMessage}
        </div>
      )}

      {/* Header + Time Controls */}
      <div className="bg-rx-surface border border-border rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-heading font-bold text-rx-text-primary">Analytics</h1>
            <p className="text-sm font-body text-rx-text-muted mt-1">
              Revenue recovery intelligence · Updated {analyticsData.length > 0 ? "recently" : "never"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Period selector */}
            <div className="flex items-center bg-rx-surface border border-border rounded-lg p-1">
              {(["7d", "30d", "90d", "6m", "1y"] as TimePeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={`px-3 py-1.5 text-[13px] font-body rounded-md transition-all duration-150 ${activePeriod === p ? "bg-rx-overlay text-rx-text-primary" : "text-rx-text-muted hover:text-rx-text-primary"}`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Compare toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
                className="w-4 h-4 rounded accent-[hsl(var(--accent-blue))] cursor-pointer"
              />
              <span className="text-[13px] font-body text-rx-text-secondary">Compare to previous period</span>
            </label>

            {/* Action buttons */}
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <button
                onClick={() => setAnnotationMode(!annotationMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[13px] font-body transition-colors ${annotationMode ? "border-rx-blue bg-rx-blue-dim text-rx-blue" : "border-border text-rx-text-secondary hover:bg-rx-overlay"}`}
              >
                <Flag size={13} /> Annotate
              </button>
              <button onClick={handleCopyLink} className="w-[34px] h-[34px] flex items-center justify-center rounded-md hover:bg-rx-overlay text-rx-text-muted hover:text-rx-text-primary transition-colors">
                <LinkIcon size={15} />
              </button>
              <button className="w-[34px] h-[34px] flex items-center justify-center rounded-md border border-border hover:bg-rx-overlay text-rx-text-muted hover:text-rx-text-primary transition-colors">
                <FileText size={15} />
              </button>
              <button onClick={() => window.print()} className="w-[34px] h-[34px] flex items-center justify-center rounded-md border border-border hover:bg-rx-overlay text-rx-text-muted hover:text-rx-text-primary transition-colors">
                <Printer size={15} />
              </button>
            </div>
          </div>
        </div>

        {compareMode && (
          <div className="mb-4 inline-flex items-center bg-rx-overlay border border-border rounded-md px-4 py-2 text-[13px] font-body text-rx-text-secondary">
            Comparing {activePeriod.toUpperCase()} vs previous period
          </div>
        )}

        {/* Gateway filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {gatewayBtns.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleGateway(key)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-body border whitespace-nowrap flex items-center gap-1.5 transition-colors ${activeGateways.includes(key) ? "bg-rx-overlay border-border text-rx-text-primary" : "border-border/50 text-rx-text-muted hover:border-border"}`}
            >
              {color && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
              {label}
              {key === "all" && <ChevronDown size={13} />}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-up" style={{ animationDelay: "80ms" }}>
        {[
          { title: "Recovered", value: formatINRLakh(totalRecovered), icon: TrendingUp, color: "bg-rx-green-dim text-rx-green", valueColor: "text-rx-green-text" },
          { title: "Recovery rate", value: `${avgRate}%`, icon: Percent, color: "bg-rx-blue-dim text-rx-blue", valueColor: "text-rx-blue" },
          { title: "At risk", value: formatINRLakh(Math.max(0, totalFailed - totalRecovered)), icon: AlertTriangle, color: "bg-rx-amber-dim text-rx-amber", valueColor: "text-rx-amber" },
        ].map(({ title, value, icon: Icon, color, valueColor }) => (
          <div key={title} className="bg-rx-surface border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${color}`}>
                <Icon size={16} />
              </div>
              <span className="text-[12px] font-body text-rx-text-muted">{title}</span>
            </div>
            {isLoading ? (
              <div className="h-8 w-28 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
            ) : (
              <p className={`text-[28px] font-heading font-bold font-mono ${valueColor}`}>{value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Primary Timeline Chart */}
      <div className="bg-rx-surface border border-border rounded-xl p-5 animate-fade-up" style={{ animationDelay: "120ms" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
          <div>
            <h2 className="text-base font-heading font-semibold text-rx-text-primary">Revenue recovery timeline</h2>
            <p className="text-[13px] font-body text-rx-text-muted">Daily failed payments vs recovered revenue</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-[2px] bg-rx-red opacity-60" />
              <span className="text-xs font-body text-rx-text-secondary">Failed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-[2px] bg-rx-green" />
              <span className="text-xs font-body text-rx-text-secondary">Recovered</span>
            </div>
            <button className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-rx-overlay text-rx-text-muted transition-colors">
              <Download size={15} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="w-full h-[300px] bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
        ) : enhancedTimelineData.length === 0 ? (
          <div className="w-full h-[300px] flex items-center justify-center text-sm font-body text-rx-text-muted">
            No data for this period. Recovery trend will appear as payments are processed.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={enhancedTimelineData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradFailed2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent-red))" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="hsl(var(--accent-red))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRecovered2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent-green))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--accent-green))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-default))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--text-muted))", fontFamily: "DM Sans" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--text-muted))", fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
              <RechartsTooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="failed" stroke="hsl(var(--accent-red))" fill="url(#gradFailed2)" strokeWidth={2} dot={false} isAnimationActive />
              <Area type="monotone" dataKey="recovered" stroke="hsl(var(--accent-green))" fill="url(#gradRecovered2)" strokeWidth={2} dot={false} isAnimationActive />
              {compareMode && (
                <>
                  <Line type="monotone" dataKey="failedPrev" stroke="hsl(var(--accent-red))" strokeDasharray="4 4" strokeWidth={1.5} dot={false} opacity={0.4} />
                  <Line type="monotone" dataKey="recoveredPrev" stroke="hsl(var(--accent-green))" strokeDasharray="4 4" strokeWidth={1.5} dot={false} opacity={0.4} />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Charts Row: Cohort + Channel Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-up" style={{ animationDelay: "160ms" }}>
        {/* Cohort Analysis */}
        <div className="lg:col-span-2 bg-rx-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-heading font-semibold text-rx-text-primary">Recovery cohort by channel</h2>
              <p className="text-[13px] font-body text-rx-text-muted">% of failed payments recovered per channel each month</p>
            </div>
            <button
              onClick={() => setIsCohortExpanded(!isCohortExpanded)}
              className="text-xs font-body text-rx-blue hover:underline"
            >
              {isCohortExpanded ? "Collapse" : "Expand"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-body text-rx-text-muted">
                  <th className="text-left py-2 pr-4 font-medium">Month</th>
                  <th className="text-right py-2 px-3 font-medium text-rx-green">Auto-retry</th>
                  <th className="text-right py-2 px-3 font-medium text-rx-blue">Email</th>
                  <th className="text-right py-2 px-3 font-medium" style={{ color: "#10b981" }}>WhatsApp</th>
                  <th className="text-right py-2 px-3 font-medium text-rx-amber">In recovery</th>
                  <th className="text-right py-2 pl-3 font-medium text-rx-red">Lost</th>
                </tr>
              </thead>
              <tbody>
                {cohortData.map((row) => (
                  <tr key={row.month} className="border-b border-border last:border-0 hover:bg-rx-overlay/50 transition-colors">
                    <td className="py-2.5 pr-4 font-body text-rx-text-secondary text-[13px]">{row.month}</td>
                    {[
                      { v: row.retry,     bar: "bg-rx-green",  text: "text-rx-green-text" },
                      { v: row.email,     bar: "bg-rx-blue",   text: "text-rx-blue" },
                      { v: row.whatsapp,  bar: "bg-[#10b981]", text: "text-[#10b981]" },
                      { v: row.recovering,bar: "bg-rx-amber",  text: "text-rx-amber" },
                      { v: row.lost,      bar: "bg-rx-red",    text: "text-rx-red" },
                    ].map(({ v, bar, text }, i) => (
                      <td key={i} className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-rx-overlay rounded-full overflow-hidden hidden sm:block">
                            <div className={`h-full rounded-full ${bar}`} style={{ width: `${v}%` }} />
                          </div>
                          <span className={`font-mono text-[13px] ${text}`}>{v}%</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Channel Recovery Split — RadialBar */}
        <div className="bg-rx-surface border border-border rounded-xl p-5">
          <h2 className="text-base font-heading font-semibold text-rx-text-primary mb-1">Recovery by channel</h2>
          <p className="text-[13px] font-body text-rx-text-muted mb-4">% of total recovered amount</p>
          <div className="flex justify-center">
            <RadialBarChart width={200} height={200} innerRadius={30} outerRadius={90} data={radialData} startAngle={90} endAngle={-270}>
              <RadialBar dataKey="value" cornerRadius={4} />
            </RadialBarChart>
          </div>
          <div className="mt-3 space-y-2">
            {radialData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.fill }} />
                  <span className="font-body text-rx-text-secondary">{d.name}</span>
                </div>
                <span className="font-mono text-rx-text-secondary">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Decline Code Breakdown */}
      <div className="bg-rx-surface border border-border rounded-xl overflow-hidden animate-fade-up" style={{ animationDelay: "200ms" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-heading font-semibold text-rx-text-primary">Decline code breakdown</h2>
            <p className="text-[13px] font-body text-rx-text-muted">Recovery rates per decline type — sorted by recovery rate</p>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[13px] font-body text-rx-text-secondary hover:bg-rx-overlay transition-colors">
            <Download size={14} /> Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-body text-rx-text-muted">
                <th className="text-left px-5 py-3 font-medium">Decline code</th>
                <th className="text-right px-4 py-3 font-medium">Count</th>
                <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Failed amount</th>
                <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">Recovered</th>
                <th className="text-left px-4 py-3 font-medium">Rate</th>
                <th className="text-right px-5 py-3 font-medium hidden md:table-cell">Trend</th>
              </tr>
            </thead>
            <tbody>
              {declineCodes.map((row) => (
                <tr key={row.code} className="border-b border-border last:border-0 hover:bg-rx-overlay/50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-body text-rx-text-primary text-[13px]">{row.label}</p>
                    <p className="font-mono text-[11px] text-rx-text-muted">{row.code}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-rx-text-secondary">{row.count}</td>
                  <td className="px-4 py-3 text-right font-mono text-rx-text-secondary hidden md:table-cell">{formatINRLakh(row.failedAmount * 100)}</td>
                  <td className="px-4 py-3 text-right font-mono text-rx-green-text hidden lg:table-cell">{formatINRLakh(row.recoveredAmount * 100)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-rx-overlay rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.rate >= 75 ? "bg-rx-green" : row.rate >= 50 ? "bg-rx-amber" : "bg-rx-red"}`}
                          style={{ width: `${row.rate}%` }}
                        />
                      </div>
                      <span className={`font-mono text-[13px] ${row.rate >= 75 ? "text-rx-green-text" : row.rate >= 50 ? "text-rx-amber" : "text-rx-red"}`}>
                        {row.rate}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right hidden md:table-cell">
                    <span className={`text-[12px] font-body ${row.trend === "up" ? "text-rx-green" : row.trend === "down" ? "text-rx-red" : "text-rx-text-muted"}`}>
                      {row.trend === "up" ? `↑ +${row.trendPct}%` : row.trend === "down" ? `↓ -${row.trendPct}%` : "→ flat"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Recoveries */}
      <div className="bg-rx-surface border border-border rounded-xl overflow-hidden animate-fade-up" style={{ animationDelay: "240ms" }}>
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-heading font-semibold text-rx-text-primary">Top recovered payments</h2>
          <p className="text-[13px] font-body text-rx-text-muted">Highest value successful recoveries this period</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-body text-rx-text-muted">
                <th className="text-left px-5 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Gateway</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Channel</th>
                <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Days</th>
                <th className="text-right px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {topRecoveries.map((r) => (
                <tr key={r.rank} className="border-b border-border last:border-0 hover:bg-rx-overlay/50 transition-colors">
                  <td className="px-5 py-3 font-mono text-rx-text-muted text-[13px]">#{r.rank}</td>
                  <td className="px-4 py-3">
                    <p className="font-body text-rx-text-secondary text-[13px]">{r.email}</p>
                    <p className="font-body text-[11px] text-rx-text-muted">{r.company}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-rx-green-text">{formatINRLakh(r.amount)}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-[11px] px-1.5 py-0.5 rounded-md font-body bg-rx-blue-dim text-rx-blue capitalize">{r.gateway}</span>
                  </td>
                  <td className="px-4 py-3 font-body text-rx-text-muted text-[13px] hidden lg:table-cell">{r.channel}</td>
                  <td className="px-4 py-3 text-right font-mono text-rx-text-secondary hidden md:table-cell">{r.daysToRecover}d</td>
                  <td className="px-5 py-3 text-right font-body text-rx-text-muted text-[13px]">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
