"use client";

/**
 * app/dashboard/payments/page.tsx — Full failed-payments table page
 *
 * WHY "use client":
 * Full interactive table with search, filters, row expansion, bulk actions,
 * toasts, and countdown timers — all require client state.
 *
 * DATA STRATEGY:
 * Fetches real payments from /api/dashboard/payments?limit=50 on mount.
 * Static chart data (decline types, sparklines, gateway bars) is kept from
 * the prototype for visual richness — wired to real data in a future sprint.
 *
 * PROTOTYPE SOURCE: D:\PRSAAS\web_prototype\app\dashboard\payments\page.tsx
 * All CSS classes, layout, animations, and helper functions copied directly.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  RefreshCw, Mail, FileDown, FileText, AlertTriangle, Zap, Activity,
  TrendingUp, Search, CalendarDays, Table2, LayoutGrid, Columns,
  FastForward, CheckCircle, XCircle, Wallet, CreditCard, Smartphone,
  ShieldX, AlertOctagon, Building, Loader2, Eye, MoreHorizontal, Download, StarIcon,
  Copy, Send, Clock,
} from "lucide-react";
import {
  PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from "next/font/google";
import type { RecentPayment } from "@/lib/cache/dashboard";

const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700"] });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500"] });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"] });

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentStatus =
  | "just_failed"
  | "retry_scheduled"
  | "retrying"
  | "email_sequence"
  | "whatsapp_sent"
  | "card_updated"
  | "hard_decline"
  | "final_attempt"
  | "recovered";

type Gateway = "razorpay" | "stripe" | "cashfree" | "payu";

// ─── Static chart data (prototype values) ────────────────────────────────────

const declineTypesData = [
  { name: "Insufficient funds", value: 34, color: "#f59e0b" },
  { name: "Card expired",       value: 22, color: "#ef4444" },
  { name: "UPI failure",        value: 19, color: "#8b5cf6" },
  { name: "Do not honor",       value: 15, color: "#3b82f6" },
  { name: "Other",              value: 10, color: "#475569" },
];

const failuresOverTimeData = [
  { day: "08", failed: 42000, recovered: 31000 },
  { day: "09", failed: 45000, recovered: 35000 },
  { day: "10", failed: 38000, recovered: 38000 },
  { day: "11", failed: 32000, recovered: 29000 },
  { day: "12", failed: 41000, recovered: 33000 },
  { day: "13", failed: 55000, recovered: 31000 },
  { day: "14", failed: 60000, recovered: 42000 },
  { day: "15", failed: 48000, recovered: 45000 },
  { day: "16", failed: 39000, recovered: 48000 },
  { day: "17", failed: 43000, recovered: 51000 },
  { day: "18", failed: 46000, recovered: 42000 },
  { day: "19", failed: 62000, recovered: 40000 },
  { day: "20", failed: 58000, recovered: 51000 },
  { day: "21", failed: 65000, recovered: 55000 },
];

const gatewayData = [
  { name: "Razorpay",  amount: 182000, color: "#2563eb", maxAmount: 200000, status: "connected" },
  { name: "Stripe",    amount: 89000,  color: "#6366f1", maxAmount: 200000, status: "connected" },
  { name: "Cashfree",  amount: 37000,  color: "#059669", maxAmount: 200000, status: "connected" },
  { name: "PayU",      amount: 0,      color: "var(--bg-overlay)", maxAmount: 200000, status: "disconnected" },
];

// ─── Utils ────────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const HighlightMatch = ({ text, match }: { text: string; match: string }) => {
  if (!match) return <>{text}</>;
  const parts = text.split(new RegExp(`(${match})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === match.toLowerCase() ? (
          <span key={i} className="font-bold text-[var(--text-primary)]">{p}</span>
        ) : (
          p
        )
      )}
    </>
  );
};

const formatINR = (paise: number): string =>
  "₹" + (paise / 100).toLocaleString("en-IN");

const getProbabilityColor = (score: number) => {
  if (score >= 80) return { bg: "var(--accent-green-dim)", text: "var(--accent-green-text)", squares: 5 };
  if (score >= 60) return { bg: "var(--accent-blue-dim)", text: "var(--accent-blue)", squares: 4 };
  if (score >= 40) return { bg: "var(--accent-amber-dim)", text: "var(--accent-amber)", squares: 3 };
  if (score >= 1)  return { bg: "var(--accent-red-dim)", text: "var(--accent-red)", squares: 1 };
  return { bg: "var(--bg-overlay)", text: "var(--text-muted)", squares: 0 };
};

const getStatusBadge = (status: PaymentStatus) => {
  switch (status) {
    case "just_failed":      return { label: "Just failed",      color: "var(--accent-red)",          bg: "var(--accent-red-dim)",   outline: false };
    case "retry_scheduled":  return { label: "Retry scheduled",  color: "var(--accent-amber)",        bg: "var(--accent-amber-dim)", outline: false };
    case "retrying":         return { label: "Retrying...",      color: "var(--accent-blue)",         bg: "var(--accent-blue-dim)",  outline: false };
    case "email_sequence":   return { label: "Email sequence",   color: "var(--accent-blue)",         bg: "var(--accent-blue-dim)",  outline: false };
    case "whatsapp_sent":    return { label: "WhatsApp sent",    color: "var(--accent-green-text)",   bg: "var(--accent-green-dim)", outline: false };
    case "card_updated":     return { label: "Card updated",     color: "#c084fc",                    bg: "rgba(192,132,252,0.15)",  outline: false };
    case "hard_decline":     return { label: "Hard decline ✗",  color: "#991b1b",                    bg: "#fee2e2",                 outline: false };
    case "final_attempt":    return { label: "Final attempt",    color: "var(--accent-red)",          bg: "transparent",             outline: true  };
    case "recovered":        return { label: "Recovered",        color: "var(--accent-green-text)",   bg: "var(--accent-green-dim)", outline: false };
    default:                 return { label: status,             color: "var(--text-muted)",          bg: "var(--bg-overlay)",       outline: false };
  }
};

// Map API status strings to local PaymentStatus
function mapApiStatus(status: string): PaymentStatus {
  const map: Record<string, PaymentStatus> = {
    failed: "just_failed",
    processing: "retrying",
    recovered: "recovered",
    hard_decline: "hard_decline",
    retry_scheduled: "retry_scheduled",
    email_sequence: "email_sequence",
    whatsapp_sent: "whatsapp_sent",
    card_updated: "card_updated",
    final_attempt: "final_attempt",
  };
  return map[status] ?? "just_failed";
}

const getGatewayStyling = (gateway: string) => {
  switch (gateway) {
    case "razorpay":  return { label: "Razorpay", color: "#60a5fa", bg: "rgba(59,130,246,0.15)" };
    case "stripe":    return { label: "Stripe",   color: "#818cf8", bg: "rgba(99,102,241,0.15)" };
    case "cashfree":  return { label: "Cashfree", color: "#34d399", bg: "rgba(16,185,129,0.15)" };
    case "payu":      return { label: "PayU",     color: "#fbbf24", bg: "rgba(245,158,11,0.15)" };
    default:          return { label: gateway,    color: "var(--text-muted)", bg: "var(--bg-overlay)" };
  }
};

const getEmailHashColor = (email: string) => {
  const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const getMethodIcon = (method: string) => {
  if (method.includes("card") || method.includes("Card") || method.includes("debit") || method.includes("credit"))
    return <CreditCard className="w-3 h-3 text-[var(--text-muted)] mt-[1px]" />;
  if (method.includes("UPI"))
    return <Smartphone className="w-3 h-3 text-[#a855f7] mt-[1px]" />;
  return <Building className="w-3 h-3 text-[var(--text-muted)] mt-[1px]" />;
};

const getDeclineIcon = (code: string) => {
  if (code.includes("fund"))    return <Wallet    className="w-3 h-3 text-[var(--accent-amber)]" />;
  if (code.includes("expired")) return <CreditCard className="w-3 h-3 text-[var(--accent-red)]" />;
  if (code.includes("upi"))     return <Smartphone className="w-3 h-3 text-[#c084fc]" />;
  if (code.includes("honor"))   return <ShieldX   className="w-3 h-3 text-[#f97316]" />;
  if (code.includes("stolen"))  return <AlertOctagon className="w-3 h-3 text-[var(--accent-red)]" />;
  return <AlertTriangle className="w-3 h-3 text-[var(--text-muted)]" />;
};

// ─── Toast system ─────────────────────────────────────────────────────────────

type ToastMessage = { id: string; message: string; type: "blue" | "green" | "gray" | "amber" };
let toastIdCounter = 0;

function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (message: string, type: ToastMessage["type"]) => {
    const id = `toast-${toastIdCounter++}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));
  return { toasts, addToast, removeToast };
}

const ToastContainer = ({ toasts, removeToast }: { toasts: ToastMessage[]; removeToast: (id: string) => void }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        let borderColor = "";
        let Icon = AlertTriangle;
        let iconColor = "";
        if (t.type === "blue")  { borderColor = "var(--accent-blue)";  Icon = RefreshCw; iconColor = "text-[var(--accent-blue)]"; }
        else if (t.type === "green")  { borderColor = "var(--accent-green)"; Icon = TrendingUp; iconColor = "text-[var(--accent-green-text)]"; }
        else if (t.type === "amber")  { borderColor = "var(--accent-amber)"; Icon = AlertTriangle; iconColor = "text-[var(--accent-amber)]"; }
        else { borderColor = "var(--text-muted)"; Icon = Download; iconColor = "text-[var(--text-muted)]"; }
        return (
          <div key={t.id} className="pointer-events-auto flex items-center gap-3 bg-[var(--bg-elevated)] text-[var(--text-primary)] px-4 py-3 rounded-lg shadow-lg border-l-[3px] animate-in slide-in-from-right-8 fade-in duration-300" style={{ borderLeftColor: borderColor }}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
            <span className={`${dmSans.className} text-[13px] font-medium`}>{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="ml-2 text-[var(--text-muted)] hover:text-white transition-colors"><XCircle className="w-4 h-4" /></button>
          </div>
        );
      })}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const AttemptBar = ({ used, max, isHardDecline, isUPI }: { used: number; max: number; isHardDecline?: boolean; isUPI?: boolean }) => {
  if (isHardDecline) return <div className="flex justify-center"><XCircle className="w-4 h-4 text-[var(--accent-red)]" /></div>;
  const total = isUPI ? 4 : max;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-[2px]">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`w-2 h-2 rounded-[1px] ${i < used ? "bg-[var(--accent-blue)]" : "bg-[var(--bg-overlay)] border border-[var(--border-default)]"}`} />
        ))}
      </div>
      <span className={`${jetbrains.className} text-[11px] text-[var(--text-muted)]`}>{used}/{total}</span>
    </div>
  );
};

const ProbabilityBadge = ({ score, isHardDecline, index = 0 }: { score: number; isHardDecline?: boolean; index?: number }) => {
  const { bg, text, squares } = getProbabilityColor(score);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100 + (index * 50));
    return () => clearTimeout(timer);
  }, [index]);
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <div className="group inline-flex items-center gap-2 px-2 py-1 rounded-md cursor-help" style={{ backgroundColor: bg }}>
            {isHardDecline ? (
              <span className={`${jetbrains.className} text-[12px] font-medium text-[var(--text-muted)]`}>Hard decline</span>
            ) : (
              <>
                <div className="flex gap-[1px]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-[6px] h-[8px] rounded-[1px] transition-transform duration-[800ms] ease-out ${i < squares ? "" : "opacity-20"}`}
                      style={{
                        backgroundColor: i < squares ? text : "var(--text-muted)",
                        transform: mounted ? "scaleX(1)" : "scaleX(0)",
                        transformOrigin: "left",
                      }}
                    />
                  ))}
                </div>
                <span className={`${jetbrains.className} text-[12px] font-medium`} style={{ color: text }}>{score}%</span>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent sideOffset={8} className="bg-[var(--bg-elevated)] border-[var(--border-strong)] rounded-[10px] p-[14px] shadow-[0_8px_40px_rgba(0,0,0,0.6)] w-[240px] z-[100]">
          <div className={`${dmSans.className} text-[13px] font-semibold text-[var(--text-primary)] mb-2`}>Recovery probability: {score}%</div>
          <div className="h-px w-full bg-[var(--border-strong)] mb-2" />
          <div className="space-y-1.5 text-[12px]">
            <div className="flex justify-between"><span className="text-[var(--accent-green-text)]">✓ Soft decline</span><span className={`${jetbrains.className} text-[var(--text-muted)]`}>+20</span></div>
            <div className="flex justify-between"><span className="text-[var(--accent-green-text)]">✓ Card expired (fixable)</span><span className={`${jetbrains.className} text-[var(--text-muted)]`}>+15</span></div>
            <div className="flex justify-between"><span className="text-[var(--accent-green-text)]">✓ Opened email #2</span><span className={`${jetbrains.className} text-[var(--text-muted)]`}>+18</span></div>
            <div className="flex justify-between"><span className="text-[var(--accent-red)]">↓ Attempt 2 used</span><span className={`${jetbrains.className} text-[var(--text-muted)]`}>-8</span></div>
          </div>
          <div className="h-px w-full bg-[var(--border-strong)] mt-2.5 mb-2.5" />
          <div className={`${dmSans.className} text-[11px] text-[var(--text-muted)] mb-1`}>Best next action:</div>
          <div className={`${dmSans.className} text-[12px] font-medium text-[var(--accent-blue)] bg-[var(--accent-blue-dim)] rounded p-2`}>→ Send portal link</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const MiniSparkline = ({ data }: { data: any[] }) => (
  <div className="h-10 w-full mt-2">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="var(--accent-green)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="recovered" stroke="var(--accent-green)" fillOpacity={1} fill="url(#colorGreen)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

const CountdownTimer = ({ initialMinutes }: { initialMinutes: number }) => {
  const [timeLeft, setTimeLeft] = useState(initialMinutes * 60);
  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);
  const m = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const s = (timeLeft % 60).toString().padStart(2, "0");
  return <span className={`${jetbrains.className} text-[12px] text-[var(--accent-amber)]`}>{m}:{s}</span>;
};

// ─── Skeleton rows ────────────────────────────────────────────────────────────

const SkeletonRow = () => (
  <tr className="h-[48px] border-b border-[var(--border-strong)]">
    {Array.from({ length: 11 }).map((_, i) => (
      <td key={i} className="px-3 py-2">
        <div className="h-4 rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] bg-[var(--bg-overlay)]" style={{ width: i === 0 ? 16 : i === 1 ? 120 : i === 2 ? 70 : 80 }} />
      </td>
    ))}
  </tr>
);

// ─── Main page component ──────────────────────────────────────────────────────

export default function FailedPaymentsPage() {
  const { toasts, addToast, removeToast } = useToasts();

  // API data
  const [apiPayments, setApiPayments] = useState<RecentPayment[]>([]);
  const [isApiLoading, setIsApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // UI state
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedSearchInput = useDebounce(searchInput, 200);
  const activeSearchQuery = globalSearch || debouncedSearchInput;
  const [hoverDeclineFilter, setHoverDeclineFilter] = useState<string | null>(null);
  const [gatewayFilter, setGatewayFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const h1Ref = useRef<HTMLDivElement>(null);
  const [h1InView, setH1InView] = useState(false);

  // Fetch on mount
  useEffect(() => {
    fetch("/api/dashboard/payments?limit=50")
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<RecentPayment[]>;
      })
      .then(data => {
        setApiPayments(data);
        setIsApiLoading(false);
      })
      .catch(err => {
        setApiError(err.message);
        setIsApiLoading(false);
      });
  }, []);

  // Keyboard shortcut Cmd+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Simulated recovery toast
  useEffect(() => {
    const timer = setTimeout(() => addToast("₹8,500 recovered — meera@techstartup.in", "green"), 30000);
    return () => clearTimeout(timer);
  }, []);

  // Intersection observer for bottom section animation
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setH1InView(true); },
      { threshold: 0.1 }
    );
    if (h1Ref.current) observer.observe(h1Ref.current);
    return () => observer.disconnect();
  }, []);

  // Derive a probability-like score from the API payment fields
  const deriveProbability = (p: RecentPayment): number => {
    if (!p.isRecoverable) return 0;
    if (p.declineCategory === "network_error") return 91;
    if (p.declineCategory === "insufficient_funds") return 82;
    if (p.declineCategory === "card_expired") return 71;
    if (p.declineCategory === "upi_mandate_failed") return 76;
    if (p.declineCategory === "do_not_honor") return 54;
    return 60;
  };

  // Filter and sort
  const filteredPayments = useMemo(() => {
    let result = [...apiPayments];
    if (globalSearch) {
      const q = globalSearch.toLowerCase();
      result = result.filter(p =>
        (p.customerEmail ?? "").toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.declineCategory.toLowerCase().includes(q) ||
        formatINR(p.amountPaise).includes(q)
      );
    }
    if (hoverDeclineFilter) {
      result = result.filter(p => p.declineCategory === hoverDeclineFilter);
    }
    if (gatewayFilter !== "All") {
      result = result.filter(p => p.gatewayName.toLowerCase() === gatewayFilter.toLowerCase());
    }
    if (statusFilter !== "all") {
      result = result.filter(p => p.status === statusFilter);
    }
    return result;
  }, [apiPayments, globalSearch, hoverDeclineFilter, gatewayFilter, statusFilter]);

  const sortedPayments = useMemo(
    () => [...filteredPayments].sort((a, b) => deriveProbability(b) - deriveProbability(a)),
    [filteredPayments]
  );

  const totalPages = Math.max(1, Math.ceil(sortedPayments.length / rowsPerPage));
  const paginatedPayments = sortedPayments.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const toggleRow    = (id: string) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleSelectRow = (id: string) => setSelectedRows(prev => ({ ...prev, [id]: !prev[id] }));

  const selectedCount   = Object.values(selectedRows).filter(Boolean).length;
  const isAllSelected   = selectedCount === apiPayments.length && apiPayments.length > 0;
  const isIndeterminate = selectedCount > 0 && selectedCount < apiPayments.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRows({});
    } else {
      const newSelected: Record<string, boolean> = {};
      apiPayments.forEach(p => (newSelected[p.id] = true));
      setSelectedRows(newSelected);
    }
  };

  return (
    <div
      className="min-h-screen pb-20 select-none bg-cover bg-center"
      style={{
        backgroundColor: "var(--bg-base)",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        "--bg-base":      "#080c14",
        "--bg-surface":   "#0d1117",
        "--bg-elevated":  "#131a24",
        "--bg-overlay":   "#1a2332",
        "--bg-subtle":    "#0f1520",
        "--border-default": "rgba(255,255,255,0.06)",
        "--border-strong":  "rgba(255,255,255,0.12)",
        "--accent-blue":       "#3b82f6",
        "--accent-blue-dim":   "rgba(59,130,246,0.15)",
        "--accent-green":      "#10b981",
        "--accent-green-dim":  "rgba(16,185,129,0.12)",
        "--accent-green-text": "#34d399",
        "--accent-amber":      "#f59e0b",
        "--accent-amber-dim":  "rgba(245,158,11,0.12)",
        "--accent-red":        "#ef4444",
        "--accent-red-dim":    "rgba(239,68,68,0.12)",
        "--text-primary":   "#f1f5f9",
        "--text-secondary": "#94a3b8",
        "--text-muted":     "#475569",
      } as React.CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes risk-shimmer  { 0%,100%{text-shadow:0 0 0px rgba(239,68,68,0)} 50%{text-shadow:0 0 18px rgba(239,68,68,0.35)} }
        @keyframes money-shimmer { 0%,100%{text-shadow:0 0 0px rgba(52,211,153,0)} 50%{text-shadow:0 0 18px rgba(52,211,153,0.35)} }
        @keyframes skeleton-pulse { 0%,100%{opacity:0.2} 50%{opacity:0.5} }
        .animate-risk-shimmer  { animation: risk-shimmer  4s ease-in-out infinite; }
        .animate-money-shimmer { animation: money-shimmer 4s ease-in-out infinite; }
      ` }} />

      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="max-w-[1400px] mx-auto px-6 pt-8 flex flex-col gap-6">

        {/* SECTION A — PAGE HEADER */}
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <div className={`${dmSans.className} text-[13px] text-[var(--text-muted)] mb-1`}>
                Dashboard / <span className="text-[var(--text-primary)]">Failed Payments</span>
              </div>
              <h1 className={`${plusJakarta.className} text-[26px] font-bold text-[var(--text-primary)] tracking-tight`}>Failed Payments</h1>
              <p className={`${dmSans.className} text-[14px] text-[var(--text-muted)] mt-1`}>Monitor, investigate, and act on every payment failure</p>
            </div>
            <div className="flex items-center gap-2.5">
              <Button variant="ghost" size="icon" className="w-[34px] h-[34px] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-white" title="Refresh" onClick={() => { setIsApiLoading(true); fetch("/api/dashboard/payments?limit=50").then(r=>r.json()).then(d=>{setApiPayments(d);setIsApiLoading(false);}).catch(()=>setIsApiLoading(false)); }}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="w-[34px] h-[34px] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-white">
                <Mail className="w-4 h-4" />
              </Button>
              <Button variant="outline" className="h-[34px] px-3 bg-transparent border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]">
                <FileDown className="w-4 h-4 mr-2" /> Export CSV
              </Button>
              <Button className="h-[34px] px-3 bg-[var(--accent-blue)] hover:bg-blue-600 text-white border-0">
                <FileText className="w-4 h-4 mr-2" /> Export PDF
              </Button>
            </div>
          </div>
          <div className={`${dmSans.className} flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]`}>
            <span>Last synced: 2 minutes ago</span>
            <span className="mx-1">·</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Razorpay ✓</span>
            <span className="mx-1">·</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Stripe ✓</span>
            <span className="mx-1">·</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Cashfree ✓</span>
            <span className="mx-1">·</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> PayU ⚠</span>
            <a href="#" className="text-[var(--accent-amber)] hover:underline ml-1">Reconnect</a>
          </div>
        </section>

        {/* SECTION B — AT-RISK SUMMARY STRIP */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 — Total MRR at risk */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl py-[18px] px-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[var(--accent-red-dim)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-[var(--accent-red)]" />
              </div>
              <div>
                <div className={`${dmSans.className} text-[13px] text-[var(--text-muted)]`}>Total MRR at risk</div>
                {isApiLoading ? (
                  <div className="h-8 w-28 rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] bg-[var(--bg-overlay)] mt-1" />
                ) : (
                  <div className={`${jetbrains.className} text-[30px] font-bold text-[var(--accent-red)] leading-none mt-1 animate-risk-shimmer`}>₹3,08,000</div>
                )}
              </div>
            </div>
            <div className="flex justify-between mt-4 mb-2">
              <span className={`${dmSans.className} text-[12px] text-[var(--text-secondary)]`}>{apiPayments.length} active failures</span>
              <span className={`${dmSans.className} text-[12px] text-[var(--accent-green-text)]`}>₹2,40,000 already recovering</span>
            </div>
            <div className="w-full h-1 bg-[var(--bg-overlay)] rounded-full overflow-hidden flex">
              <div className="h-full bg-[var(--accent-green)]" style={{ width: "78%" }} />
              <div className="h-full bg-[var(--accent-red)]"   style={{ width: "22%" }} />
            </div>
            <div className={`${dmSans.className} text-[11px] text-[var(--text-muted)] mt-1.5`}>78% in active recovery</div>
          </div>

          {/* Card 2 — Needs attention */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl py-[18px] px-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[var(--accent-amber-dim)] flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-[var(--accent-amber)]" />
              </div>
              <div>
                <div className={`${dmSans.className} text-[13px] text-[var(--text-muted)]`}>Needs your attention</div>
                <div className={`${plusJakarta.className} text-[30px] font-bold text-[var(--accent-amber)] leading-none mt-1`}>23</div>
              </div>
            </div>
            <div className={`${dmSans.className} text-[13px] text-[var(--text-muted)] mb-3`}>payments require manual review</div>
            <div className="flex flex-col gap-1.5 mb-3">
              <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)]" /><span className={`${dmSans.className} text-[12px] text-[var(--text-secondary)]`}>8 hard declines — verify</span></div>
              <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)]" /><span className={`${dmSans.className} text-[12px] text-[var(--text-secondary)]`}>11 exhausted attempts</span></div>
              <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)]" /><span className={`${dmSans.className} text-[12px] text-[var(--text-secondary)]`}>4 WhatsApp/email bounced</span></div>
            </div>
            <a href="#" className={`${plusJakarta.className} text-[13px] text-[var(--accent-amber)] hover:underline font-medium`}>Review now →</a>
          </div>

          {/* Card 3 — Actively recovering */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl py-[18px] px-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[var(--accent-blue-dim)] flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5 text-[var(--accent-blue)]" />
              </div>
              <div>
                <div className={`${dmSans.className} text-[13px] text-[var(--text-muted)]`}>Actively recovering</div>
                <div className={`${plusJakarta.className} text-[30px] font-bold text-[var(--accent-blue)] leading-none mt-1`}>112</div>
              </div>
            </div>
            <div className="flex justify-between mt-4 mb-2">
              <span className={`${dmSans.className} text-[12px] text-[var(--accent-amber)]`}>54 retry scheduled</span>
              <span className={`${dmSans.className} text-[12px] text-[var(--accent-blue)]`}>51 contact sent</span>
              <span className={`${dmSans.className} text-[12px] text-[var(--accent-green-text)]`}>7 obj resp</span>
            </div>
            <div className="w-full h-2 bg-[var(--bg-overlay)] rounded-full overflow-hidden flex mb-2">
              <div className="h-full bg-[var(--accent-amber)]" style={{ width: "48%" }} />
              <div className="h-full bg-[var(--accent-blue)]"  style={{ width: "45%" }} />
              <div className="h-full bg-[var(--accent-green)]" style={{ width: "7%" }} />
            </div>
            <div className={`${dmSans.className} text-[12px] text-[var(--text-muted)] mt-2`}>
              Next retry fires in <CountdownTimer initialMinutes={23} />
            </div>
          </div>

          {/* Card 4 — Recovered today */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl py-[18px] px-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[var(--accent-green-dim)] flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-[var(--accent-green-text)]" />
              </div>
              <div>
                <div className={`${dmSans.className} text-[13px] text-[var(--text-muted)]`}>Recovered today</div>
                <div className={`${jetbrains.className} text-[30px] font-bold text-[var(--accent-green-text)] leading-none mt-1 animate-money-shimmer`}>₹38,400</div>
              </div>
            </div>
            <div className={`${dmSans.className} text-[12px] text-[var(--text-muted)] mb-1`}>8 payments · avg ₹4,800 each</div>
            <MiniSparkline data={failuresOverTimeData.slice(7)} />
            <div className="mt-2 text-[12px] font-medium px-2 py-0.5 rounded-full bg-[var(--accent-green-dim)] text-[var(--accent-green-text)] inline-block">↑ ₹9,200 more than yesterday</div>
          </div>
        </section>

        {/* SECTION C — MINI CHARTS ROW */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Chart 1 — By decline type (PieChart) */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl py-[18px] px-[22px] h-[200px] flex flex-col">
            <div>
              <h3 className={`${plusJakarta.className} text-[14px] font-semibold text-[var(--text-primary)]`}>By decline type</h3>
              <p className={`${dmSans.className} text-[12px] text-[var(--text-muted)]`}>What's causing failures</p>
            </div>
            <div className="flex-1 flex items-center -ml-4">
              <div className="w-[140px] h-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={declineTypesData} innerRadius={35} outerRadius={50} paddingAngle={2} dataKey="value" stroke="none">
                      {declineTypesData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border-strong)", borderRadius: "8px", fontSize: "12px" }} itemStyle={{ color: "#fff" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`${jetbrains.className} text-[13px] text-[var(--text-primary)] pl-4`}>5 types</span>
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-1.5 justify-center">
                {declineTypesData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: d.color }} />
                      <span className={`${dmSans.className} text-[11px] text-[var(--text-primary)] leading-none line-clamp-1 truncate block max-w-[80px]`}>{d.name}</span>
                    </div>
                    <span className={`${jetbrains.className} text-[11px] text-[var(--text-muted)]`}>{d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chart 2 — This month trend (AreaChart) */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl py-[18px] px-[22px] h-[200px] flex flex-col">
            <div>
              <h3 className={`${plusJakarta.className} text-[14px] font-semibold text-[var(--text-primary)]`}>This month trend</h3>
              <p className={`${dmSans.className} text-[12px] text-[var(--text-muted)]`}>Daily new failures vs recoveries</p>
            </div>
            <div className="flex-1 mt-4 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={failuresOverTimeData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickMargin={5} minTickGap={20} />
                  <RechartsTooltip cursor={{ stroke: "var(--border-strong)", strokeWidth: 1, strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border-strong)", borderRadius: "8px", fontSize: "12px", padding: "8px 12px" }} />
                  <Area type="monotone" dataKey="failed"    stroke="var(--accent-red)"        fill="var(--accent-red)"        fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="recovered" stroke="var(--accent-green-text)" fill="var(--accent-green-text)" fillOpacity={0.2}  strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3 — By gateway (BarChart) */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl py-[18px] px-[22px] h-[200px] flex flex-col">
            <div>
              <h3 className={`${plusJakarta.className} text-[14px] font-semibold text-[var(--text-primary)]`}>By gateway</h3>
              <p className={`${dmSans.className} text-[12px] text-[var(--text-muted)]`}>Failed amount per provider</p>
            </div>
            <div className="flex-1 flex flex-col justify-center gap-3 mt-4">
              {gatewayData.map((g, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`${dmSans.className} text-[13px] text-[var(--text-primary)] w-16`}>{g.name}</div>
                  <div className="flex-1 h-[8px] rounded-full bg-[var(--bg-overlay)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${(g.amount / g.maxAmount) * 100}%`, backgroundColor: g.color }} />
                  </div>
                  <div className={`${jetbrains.className} text-[12px] text-[var(--text-secondary)] w-[70px] text-right`}>{g.status === "disconnected" ? "Offline" : formatINR(g.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION D — SMART FILTER BAR */}
        <section className="flex flex-col gap-3 relative z-20">
          <div className="flex flex-wrap lg:flex-nowrap justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div
                className="relative group/search"
                onFocus={() => setIsSearchFocused(true)}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setTimeout(() => setIsSearchFocused(false), 150); }}
              >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  ref={searchInputRef}
                  placeholder="Search by email, ID..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchInput.trim()) {
                      setGlobalSearch(searchInput.trim());
                      setSearchInput("");
                      searchInputRef.current?.blur();
                    }
                  }}
                  className="w-full lg:w-[240px] focus:w-full lg:focus:w-[400px] transition-all duration-300 ease-out h-[36px] bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg pl-9 pr-8 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:border-[var(--accent-blue)]"
                />
                <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] text-[var(--text-muted)] font-mono px-1 border border-[var(--border-default)] rounded hidden lg:block">⌘F</kbd>
                {isSearchFocused && (
                  <div className="absolute top-full mt-2 left-0 w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-[10px] shadow-[0_8px_40px_rgba(0,0,0,0.6)] z-[60] overflow-hidden flex flex-col">
                    <div className="p-2 w-full text-[13px]">
                      <div className="px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">Quick filters</div>
                      <button className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[var(--bg-overlay)] text-[var(--text-primary)]" onMouseDown={() => { setGlobalSearch("card_expired"); setSearchInput(""); setIsSearchFocused(false); }}>· Card expired</button>
                      <button className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[var(--bg-overlay)] text-[var(--text-primary)]" onMouseDown={() => { setGlobalSearch("insufficient"); setSearchInput(""); setIsSearchFocused(false); }}>· Insufficient funds</button>
                      <button className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[var(--bg-overlay)] text-[var(--text-primary)]" onMouseDown={() => { setGlobalSearch("upi"); setSearchInput(""); setIsSearchFocused(false); }}>· UPI failures</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Active filter chips */}
              <div className="flex items-center gap-1 bg-[var(--bg-overlay)] border border-[var(--border-default)] rounded-[20px] p-0.5">
                {globalSearch && (
                  <div className="flex items-center gap-1.5 px-3 h-7 rounded-[18px] text-[12px] font-medium bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-strong)] ml-1 mr-1 relative pr-8">
                    <span className="opacity-70">Search:</span> {globalSearch}
                    <button onClick={() => setGlobalSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--accent-red)] rounded-full transition-colors"><XCircle className="w-3.5 h-3.5" /></button>
                  </div>
                )}
                {hoverDeclineFilter && (
                  <div className="flex items-center gap-1.5 px-3 h-7 rounded-[18px] text-[12px] font-medium bg-[var(--accent-amber-dim)] text-[var(--accent-amber)] border border-[rgba(245,158,11,0.2)] ml-1 mr-1 relative pr-8">
                    <span className="opacity-70">Filtered by:</span> {hoverDeclineFilter}
                    <button onClick={() => setHoverDeclineFilter(null)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--accent-amber)] hover:text-[var(--accent-red)] rounded-full transition-colors"><XCircle className="w-3.5 h-3.5" /></button>
                  </div>
                )}
                {["All", "Razorpay", "Stripe", "Cashfree", "PayU"].map((pill, i) => (
                  <button key={i} onClick={() => setGatewayFilter(pill)} className={`px-3 h-7 rounded-[18px] text-[12px] font-medium transition-colors ${gatewayFilter === pill ? "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border border-[rgba(59,130,246,0.2)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent"}`}>
                    {pill}
                  </button>
                ))}
              </div>

              {/* Status filter */}
              <DropdownMenu>
                <DropdownMenuTrigger render={<span />}>
                  <Button variant="outline" size="sm" className="h-9 bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[13px] font-normal text-[var(--text-secondary)]">
                    All statuses <span className="ml-1 opacity-50">▾</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-primary)]">
                  <DropdownMenuItem onClick={() => setStatusFilter("all")}>All active</DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-[var(--border-default)]" />
                  <DropdownMenuItem onClick={() => setStatusFilter("retrying")}>Retrying</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("email_sequence")}>Email sequence</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("whatsapp_sent")}>WhatsApp sent</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("hard_decline")}>Hard decline</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger render={<span />}>
                  <Button variant="outline" size="sm" className="h-9 bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[13px] font-normal text-[var(--text-secondary)]">
                    <CalendarDays className="w-4 h-4 mr-2 text-[var(--text-muted)]" /> Last 30 days <span className="ml-1 opacity-50">▾</span>
                  </Button>
                </DropdownMenuTrigger>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg p-0.5">
                <Button variant="ghost" size="sm" className={`h-7 w-8 p-0 ${viewMode === "table" ? "bg-[var(--bg-overlay)] text-white" : "text-[var(--text-muted)]"}`} onClick={() => setViewMode("table")}>
                  <Table2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className={`h-7 w-8 p-0 ${viewMode === "card" ? "bg-[var(--bg-overlay)] text-white" : "text-[var(--text-muted)]"}`} onClick={() => setViewMode("card")}>
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-secondary)]">
                <Columns className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* SECTION E — BULK ACTION BAR */}
          <div className={`overflow-hidden transition-all duration-250 ease-out ${selectedCount > 0 ? "max-h-[50px] opacity-100 mb-2" : "max-h-0 opacity-0 mb-0"}`}>
            <div className="flex items-center justify-between bg-[var(--bg-elevated)] border border-[var(--accent-blue-dim)] rounded-lg px-4 h-[50px] shadow-lg">
              <div className="flex items-center gap-3">
                <Checkbox checked={isAllSelected} onCheckedChange={toggleSelectAll} className="border-[var(--text-muted)] data-[state=checked]:bg-[var(--accent-blue)] data-[state=checked]:border-[var(--accent-blue)]" />
                <span className={`${dmSans.className} font-medium text-[13px] text-[var(--accent-blue)]`}>{selectedCount} payments selected</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => { addToast(`Bulk retry started for ${selectedCount} payments`, "blue"); setSelectedRows({}); }} className="h-[30px] bg-[var(--accent-blue)] hover:bg-blue-600 text-white text-[12px] px-3"><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry all now</Button>
                <Button size="sm" variant="outline" className="h-[30px] bg-transparent border-[var(--border-strong)] text-[var(--text-primary)] text-[12px] px-3"><Mail className="w-3.5 h-3.5 mr-1.5" /> Send email <span className="ml-1 opacity-50">▾</span></Button>
                <Button size="sm" variant="outline" className="h-[30px] bg-transparent border-[var(--accent-green-dim)] text-[var(--accent-green-text)] text-[12px] px-3 hover:bg-[var(--accent-green-dim)] hover:text-[var(--accent-green-text)]"><Smartphone className="w-3.5 h-3.5 mr-1.5" /> Send WhatsApp</Button>
                <Button size="sm" variant="outline" className="h-[30px] bg-transparent border-[var(--border-strong)] text-[var(--text-primary)] text-[12px] px-3 hover:bg-[var(--bg-overlay)] hover:text-[var(--accent-amber)]"><FastForward className="w-3.5 h-3.5 mr-1.5" /> Skip to next</Button>
                <Button size="sm" variant="outline" className="h-[30px] bg-transparent border-[var(--border-strong)] text-[var(--text-primary)] text-[12px] px-3 hover:bg-[var(--bg-overlay)]"><CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Mark resolved</Button>
                <Button size="sm" variant="outline" className="h-[30px] bg-transparent border border-red-900/40 text-[var(--accent-red)] text-[12px] px-3 hover:bg-[var(--accent-red-dim)] hover:text-[var(--accent-red)]"><XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel recovery</Button>
              </div>
              <div className="flex items-center">
                <Button size="sm" variant="ghost" className="h-[30px] text-[13px] text-[var(--text-muted)] hover:text-white" onClick={() => setSelectedRows({})}>Deselect all</Button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION F — TABLE VIEW */}
        {viewMode === "table" ? (
          <section className="bg-transparent border border-[var(--border-strong)] rounded-xl overflow-x-auto relative z-10">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-[var(--bg-surface)] border-b border-[var(--border-strong)] h-[40px]">
                  <th className="px-3 py-2 w-[40px] sticky left-0 z-20 bg-[var(--bg-surface)]">
                    <Checkbox checked={isAllSelected} onCheckedChange={toggleSelectAll} className="border-[var(--text-muted)] data-[state=checked]:bg-[var(--accent-blue)]" />
                  </th>
                  <th className={`${dmSans.className} px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider sticky left-[40px] z-20 bg-[var(--bg-surface)] min-w-[180px]`}>Customer</th>
                  <th className={`${dmSans.className} px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider text-right w-[100px]`}>Amount <span className="inline-block text-[var(--accent-blue)]">↓</span></th>
                  <th className={`${dmSans.className} px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider w-[90px]`}>Gateway</th>
                  <th className={`${dmSans.className} px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider w-[130px]`}>Decline type</th>
                  <th className={`${dmSans.className} px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider w-[90px]`}>Recoverable</th>
                  <th className={`${dmSans.className} px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider text-center w-[80px]`}>Prob.</th>
                  <th className={`${dmSans.className} px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider w-[120px]`}>Status</th>
                  <th className={`${dmSans.className} px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider w-[140px]`}>Failed at</th>
                  <th className={`${dmSans.className} px-2 py-2 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider w-[60px] text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isApiLoading ? (
                  Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                ) : apiError ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center">
                      <div className={`${dmSans.className} text-[14px] text-[var(--accent-red)] mb-2`}>Failed to load payments</div>
                      <div className={`${dmSans.className} text-[12px] text-[var(--text-muted)]`}>{apiError}</div>
                    </td>
                  </tr>
                ) : paginatedPayments.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center">
                      <div className={`${dmSans.className} text-[14px] text-[var(--text-muted)]`}>No payments match your filters</div>
                    </td>
                  </tr>
                ) : (
                  paginatedPayments.map((payment, i) => {
                    const isSelected = !!selectedRows[payment.id];
                    const isExpanded = !!expandedRows[payment.id];
                    const isAltRow   = i % 2 !== 0 && !isSelected;
                    const rowClass   = isSelected ? "bg-[var(--accent-blue-dim)]" : isAltRow ? "bg-[rgba(15,21,32,0.4)]" : "bg-transparent hover:bg-[var(--bg-overlay)]";
                    const mappedStatus = mapApiStatus(payment.status);
                    const probability  = deriveProbability(payment);
                    const email = payment.customerEmail ?? payment.id;

                    return (
                      <React.Fragment key={payment.id}>
                        <tr
                          className={`h-[48px] border-b border-[var(--border-strong)] transition-colors group cursor-pointer ${rowClass} relative`}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (!target.closest("button") && !target.closest("input")) toggleRow(payment.id);
                          }}
                        >
                          <td className={`px-3 py-2 sticky left-0 z-10 ${isSelected ? "bg-[var(--accent-blue-dim)]" : isAltRow ? "bg-[#0b0f16]" : "bg-[var(--bg-base)] group-hover:bg-[var(--bg-overlay)]"}`} onClick={(e) => e.stopPropagation()}>
                            {isSelected && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--accent-blue)]" />}
                            {mappedStatus === "hard_decline" && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--accent-red)]" />}
                            <div className={`transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                              <Checkbox checked={isSelected} onCheckedChange={() => toggleSelectRow(payment.id)} className="border-[var(--text-muted)] data-[state=checked]:bg-[var(--accent-blue)]" />
                            </div>
                          </td>

                          <td className={`px-3 py-2 sticky left-[40px] z-10 ${isSelected ? "bg-[var(--accent-blue-dim)]" : isAltRow ? "bg-[#0b0f16]" : "bg-[var(--bg-base)] group-hover:bg-[var(--bg-overlay)]"}`}>
                            <div className="flex items-center gap-2.5">
                              <div className="w-[24px] h-[24px] rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0" style={{ backgroundColor: getEmailHashColor(email) }}>
                                {email.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className={`${dmSans.className} text-[12px] font-medium text-[var(--text-primary)] truncate`}>
                                  <HighlightMatch text={email} match={activeSearchQuery} />
                                </div>
                                <div className={`${dmSans.className} text-[11px] text-[var(--text-muted)] truncate mt-0`}>{payment.customerName ?? payment.currency}</div>
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-2 text-right">
                            <div className={`${jetbrains.className} text-[13px] font-medium flex items-center justify-end gap-1 ${mappedStatus === "recovered" ? "text-[var(--accent-green-text)]" : mappedStatus === "hard_decline" ? "text-[var(--accent-red)]" : "text-[var(--accent-amber)]"}`}>
                              {payment.amountPaise > 1000000 && <StarIcon className="w-2 h-2 text-yellow-500 fill-yellow-500" />}
                              <HighlightMatch text={formatINR(payment.amountPaise)} match={activeSearchQuery} />
                            </div>
                          </td>

                          <td className="px-3 py-2">
                            <div className={`${dmSans.className} inline-flex items-center h-[20px] px-1.5 rounded-full text-[10px] font-medium`} style={{ backgroundColor: getGatewayStyling(payment.gatewayName).bg, color: getGatewayStyling(payment.gatewayName).color }}>
                              {getGatewayStyling(payment.gatewayName).label}
                            </div>
                          </td>

                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {getDeclineIcon(payment.declineCategory)}
                              <span className={`${dmSans.className} text-[12px] text-[var(--text-primary)] truncate`}>
                                <HighlightMatch text={payment.declineCategory.replace(/_/g, " ")} match={activeSearchQuery} />
                              </span>
                            </div>
                          </td>

                          <td className="px-3 py-2 text-center">
                            {payment.isRecoverable ? (
                              <span className={`${dmSans.className} text-[11px] px-1.5 py-0.5 rounded bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]`}>Yes</span>
                            ) : (
                              <span className={`${dmSans.className} text-[11px] px-1.5 py-0.5 rounded bg-[var(--accent-red-dim)] text-[var(--accent-red)]`}>No</span>
                            )}
                          </td>

                          <td className="px-3 py-2">
                            <ProbabilityBadge score={probability} isHardDecline={mappedStatus === "hard_decline"} index={i} />
                          </td>

                          <td className="px-3 py-2">
                            <div className={`${dmSans.className} inline-flex items-center gap-1.5 h-[22px] px-2 rounded-[20px] text-[10px] font-medium border ${getStatusBadge(mappedStatus).outline ? "bg-transparent border-[var(--accent-red)] text-[var(--accent-red)]" : "border-transparent"}`} style={{ backgroundColor: getStatusBadge(mappedStatus).outline ? "transparent" : getStatusBadge(mappedStatus).bg, color: getStatusBadge(mappedStatus).color }}>
                              {mappedStatus === "just_failed" && <div className="w-1 h-1 rounded-full bg-[var(--accent-red)] animate-pulse" />}
                              {mappedStatus === "retrying"    && <Loader2 className="w-2 h-2 animate-spin" />}
                              {getStatusBadge(mappedStatus).label}
                            </div>
                          </td>

                          <td className="px-3 py-2">
                            <div className={`${jetbrains.className} text-[11px] text-[var(--text-secondary)] font-medium truncate`}>
                              {new Date(payment.failedAt).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </td>

                          <td className="px-2 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="w-[28px] h-[28px] text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--bg-overlay)]" onClick={(e) => { e.stopPropagation(); toggleRow(payment.id); }}>
                                <Eye className="w-[14px] h-[14px]" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger render={<span />}>
                                  <Button variant="ghost" size="icon" className="w-[28px] h-[28px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]" onClick={(e) => e.stopPropagation()}>
                                    <MoreHorizontal className="w-[14px] h-[14px]" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-primary)] min-w-[180px]">
                                  <DropdownMenuItem className="focus:bg-[var(--bg-overlay)] focus:text-white cursor-pointer"><RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry now</DropdownMenuItem>
                                  <DropdownMenuItem className="focus:bg-[var(--bg-overlay)] focus:text-white cursor-pointer"><Mail className="mr-2 h-3.5 w-3.5" /> Send email</DropdownMenuItem>
                                  <DropdownMenuItem className="focus:bg-[var(--bg-overlay)] focus:text-[#34d399] cursor-pointer"><Smartphone className="mr-2 h-3.5 w-3.5" /> Send WhatsApp</DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-[var(--border-default)]" />
                                  <DropdownMenuItem className="focus:bg-[var(--accent-red-dim)] focus:text-[var(--accent-red)] text-[var(--accent-red)] cursor-pointer"><XCircle className="mr-2 h-3.5 w-3.5" /> Cancel recovery</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>

                        {/* EXPANDED ROW */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={10} className="p-0 bg-[var(--bg-base)] border-b border-[var(--border-strong)]">
                              <div className="flex flex-col md:flex-row gap-8 py-5 pr-5 pl-[60px] bg-[var(--bg-subtle)] border-t border-[var(--border-default)]">
                                <div className="flex-1">
                                  <div className={`${dmSans.className} text-[13px] font-semibold text-[var(--text-primary)] mb-3`}>Payment details</div>
                                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-[13px]">
                                    <div className="text-[var(--text-muted)]">Payment ID</div>
                                    <div className={`${jetbrains.className} text-[var(--text-primary)] text-right font-medium text-[11px] truncate cursor-pointer hover:text-[var(--accent-blue)]`}>{payment.id}</div>
                                    <div className="text-[var(--text-muted)]">Gateway</div>
                                    <div className="text-[var(--text-primary)] text-right font-medium">{getGatewayStyling(payment.gatewayName).label}</div>
                                    <div className="text-[var(--text-muted)]">Decline code</div>
                                    <div className={`${jetbrains.className} text-[var(--text-primary)] text-right font-medium text-[11px]`}>{payment.declineCode ?? payment.declineCategory}</div>
                                    <div className="text-[var(--text-muted)]">Recovery prob.</div>
                                    <div className="text-[var(--text-primary)] text-right font-medium">{probability}%</div>
                                    <div className="text-[var(--text-muted)]">Currency</div>
                                    <div className="text-[var(--text-primary)] text-right font-medium">{payment.currency}</div>
                                  </div>
                                </div>
                                <div className="w-full md:w-[220px] bg-[var(--bg-elevated)] rounded-[10px] p-4 border border-[var(--border-default)]">
                                  <div className={`${plusJakarta.className} text-[13px] font-semibold text-[var(--text-secondary)] mb-3`}>Quick actions</div>
                                  <div className="flex flex-col gap-1.5">
                                    <Button size="sm" className="w-full justify-start h-8 bg-[var(--accent-blue)] hover:bg-blue-600 text-white border-0 text-[12px]">
                                      <RefreshCw className="w-3.5 h-3.5 mr-2" /> Retry now
                                    </Button>
                                    <Button size="sm" variant="outline" className="w-full justify-start h-8 bg-transparent border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] hover:text-white text-[12px]">
                                      <Mail className="w-3.5 h-3.5 mr-2" /> Send email
                                    </Button>
                                    <Button size="sm" variant="outline" className="w-full justify-start h-8 bg-transparent border-[var(--accent-green-dim)] text-[var(--accent-green-text)] hover:bg-[var(--accent-green-dim)] text-[12px]">
                                      <Smartphone className="w-3.5 h-3.5 mr-2" /> Send WhatsApp
                                    </Button>
                                    <Button size="sm" variant="outline" className="w-full justify-start h-8 bg-transparent border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] hover:text-white text-[12px]">
                                      <CheckCircle className="w-3.5 h-3.5 mr-2" /> Mark as resolved
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>
        ) : (
          /* CARD VIEW */
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {paginatedPayments.map((payment, i) => {
              const mappedStatus = mapApiStatus(payment.status);
              const probability  = deriveProbability(payment);
              const email = payment.customerEmail ?? payment.id;
              return (
                <div key={payment.id} className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl py-[18px] px-[18px] hover:border-[var(--text-muted)] transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`${dmSans.className} inline-flex items-center h-[22px] px-2 rounded-full text-[10px] font-medium border ${getStatusBadge(mappedStatus).outline ? "bg-transparent border-[var(--accent-red)] text-[var(--accent-red)]" : "border-transparent"}`} style={{ backgroundColor: getStatusBadge(mappedStatus).outline ? "transparent" : getStatusBadge(mappedStatus).bg, color: getStatusBadge(mappedStatus).color }}>
                        {getStatusBadge(mappedStatus).label}
                      </div>
                      <div className={`${dmSans.className} text-[10px] text-[var(--text-muted)] uppercase tracking-wider`}>{payment.gatewayName}</div>
                    </div>
                    <div className={`${jetbrains.className} text-[16px] font-bold flex items-center gap-1 ${mappedStatus === "recovered" ? "text-[var(--accent-green-text)]" : mappedStatus === "hard_decline" ? "text-[var(--accent-red)]" : "text-[var(--accent-amber)]"}`}>
                      {formatINR(payment.amountPaise)}
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className={`${dmSans.className} text-[14px] font-medium text-[var(--text-primary)] truncate mb-0.5`}>{email}</div>
                    <div className={`${dmSans.className} text-[12px] text-[var(--text-muted)] truncate`}>{payment.declineCategory.replace(/_/g, " ")}</div>
                  </div>
                  <div className="flex justify-between items-center bg-[var(--bg-overlay)] rounded-lg p-2.5 mb-4">
                    <div className="flex items-center gap-1.5">
                      {getDeclineIcon(payment.declineCategory)}
                      <span className={`${dmSans.className} text-[12px] text-[var(--text-primary)] truncate`}>{payment.declineCode ?? payment.declineCategory}</span>
                    </div>
                    <span className={`${dmSans.className} text-[11px] ${payment.isRecoverable ? "text-[var(--accent-green-text)]" : "text-[var(--accent-red)]"}`}>
                      {payment.isRecoverable ? "Recoverable" : "Hard decline"}
                    </span>
                  </div>
                  <div className="flex justify-between items-end">
                    <ProbabilityBadge score={probability} isHardDecline={mappedStatus === "hard_decline"} index={i} />
                    <div className="text-right">
                      <div className={`${jetbrains.className} text-[11px] text-[var(--text-secondary)] truncate`}>
                        {new Date(payment.failedAt).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className={`${dmSans.className} text-[10px] text-[var(--text-muted)] truncate mt-0.5`}>{payment.currency}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* SECTION G — TABLE FOOTER */}
        <section className="flex flex-col md:flex-row justify-between items-center gap-4 py-2 border-t border-[var(--border-default)]">
          <div className={`${dmSans.className} text-[13px] text-[var(--text-muted)]`}>
            Showing {Math.min((currentPage - 1) * rowsPerPage + 1, sortedPayments.length)}–{Math.min(currentPage * rowsPerPage, sortedPayments.length)} of {sortedPayments.length} payments · Total at risk: <span className={`${jetbrains.className} text-[var(--accent-amber)]`}>₹3,08,000</span>
          </div>

          <Pagination className="w-auto mx-0">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#" className="text-[var(--text-muted)] hover:text-white" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)); }} />
              </PaginationItem>
              {Array.from({ length: Math.min(totalPages, 4) }).map((_, idx) => {
                const page = idx + 1;
                return (
                  <PaginationItem key={page}>
                    <PaginationLink href="#" isActive={currentPage === page} className={currentPage === page ? "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border-[var(--border-accent)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-white border-transparent"} onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}>
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext href="#" className="text-[var(--text-muted)] hover:text-white" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)); }} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>

          <div className="hidden lg:flex items-center gap-2">
            <span className={`${dmSans.className} text-[13px] text-[var(--text-muted)]`}>Rows per page:</span>
            <Button variant="outline" size="sm" className="h-8 bg-[var(--bg-surface)] border-[var(--border-strong)] text-[12px] font-normal text-[var(--text-secondary)]">
              15 <span className="ml-1 opacity-50">▾</span>
            </Button>
          </div>
        </section>

        {/* SECTION H — DECLINE PATTERNS */}
        <section className="mt-8 mb-12" ref={h1Ref}>
          <div className="flex justify-between items-end mb-4">
            <div>
              <h2 className={`${plusJakarta.className} text-[16px] font-bold text-[var(--text-primary)]`}>Decline patterns</h2>
              <p className={`${dmSans.className} text-[13px] text-[var(--text-muted)] mt-1`}>Insights based on your last 30 days</p>
            </div>
            <div className={`${jetbrains.className} text-[12px] text-[var(--text-muted)] px-3 py-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md`}>
              Mar 1 – Mar 21, 2026
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl p-[20px] shadow-sm relative overflow-hidden">
              {hoverDeclineFilter && <div className="absolute inset-0 bg-[var(--accent-amber-dim)] opacity-5 pointer-events-none transition-opacity duration-300" />}
              <h3 className={`${plusJakarta.className} text-[14px] font-semibold text-[var(--text-primary)] mb-4`}>Most common declines</h3>
              <div className="flex flex-col gap-4">
                {[
                  { rank: "#1", name: "Insufficient funds", count: "52", amount: 8420000, pct: 34, color: "var(--accent-amber)" },
                  { rank: "#2", name: "Card expired",        count: "34", amount: 6150000, pct: 22, color: "var(--accent-red)" },
                  { rank: "#3", name: "UPI mandate failed",  count: "29", amount: 4870000, pct: 19, color: "#a855f7" },
                  { rank: "#4", name: "Do not honor",        count: "23", amount: 5230000, pct: 15, color: "#f97316" },
                  { rank: "#5", name: "Other",               count: "5",  amount: 6130000, pct: 10, color: "var(--text-muted)" },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col gap-1.5 group/bar cursor-pointer"
                    onMouseEnter={() => setHoverDeclineFilter(item.name === "Other" ? null : item.name)}
                    onMouseLeave={() => setHoverDeclineFilter(null)}
                  >
                    <div className="flex items-center justify-between text-[13px]">
                      <div className="flex items-center gap-3">
                        <span className={`${jetbrains.className} text-[var(--text-muted)] text-[11px]`}>{item.rank}</span>
                        <span className={`${dmSans.className} font-medium text-[var(--text-primary)] truncate max-w-[120px] group-hover/bar:text-[var(--accent-blue)] transition-colors`}>{item.name}</span>
                        <span className={`${dmSans.className} text-[var(--text-muted)]`}>{item.count}</span>
                      </div>
                      <span className={`${jetbrains.className} text-[12px] text-[var(--text-muted)]`}>{item.pct}%</span>
                    </div>
                    <div className="w-full h-[6px] bg-[var(--bg-overlay)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500 group-hover/bar:opacity-80" style={{ width: `${item.pct * 2.5}%`, backgroundColor: item.color }} />
                    </div>
                    <div className={`${dmSans.className} text-[11px] text-[var(--text-muted)] opacity-0 group-hover/bar:opacity-100 transition-opacity`}>
                      {formatINR(item.amount)} total at risk
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl p-[20px] shadow-sm">
              <h3 className={`${plusJakarta.className} text-[14px] font-semibold text-[var(--text-primary)] mb-4`}>Recovery probability range</h3>
              <div className="flex flex-col gap-3">
                {[
                  { range: "80–100%", label: "High confidence", count: 42, color: "var(--accent-green)" },
                  { range: "60–79%",  label: "Good chance",     count: 31, color: "var(--accent-blue)" },
                  { range: "40–59%",  label: "Moderate",        count: 28, color: "var(--accent-amber)" },
                  { range: "1–39%",   label: "Low chance",      count: 34, color: "var(--accent-red)" },
                  { range: "0%",      label: "Hard decline",    count: 8,  color: "#6b7280" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`${jetbrains.className} text-[11px] w-[60px] shrink-0`} style={{ color: item.color }}>{item.range}</div>
                    <div className="flex-1 h-[6px] bg-[var(--bg-overlay)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(item.count / 143) * 100}%`, backgroundColor: item.color }} />
                    </div>
                    <div className={`${dmSans.className} text-[11px] text-[var(--text-muted)] w-[50px] text-right`}>{item.count} payments</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl p-[20px] shadow-sm">
              <h3 className={`${plusJakarta.className} text-[14px] font-semibold text-[var(--text-primary)] mb-4`}>Gateway health</h3>
              <div className="flex flex-col gap-4">
                {[
                  { name: "Razorpay",  rate: 82, trend: "+2%",  color: "#60a5fa", status: "✓ Healthy" },
                  { name: "Stripe",    rate: 76, trend: "-1%",  color: "#818cf8", status: "✓ Healthy" },
                  { name: "Cashfree",  rate: 71, trend: "+5%",  color: "#34d399", status: "✓ Healthy" },
                  { name: "PayU",      rate: 0,  trend: "N/A",  color: "#475569", status: "⚠ Offline" },
                ].map((gw, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`${dmSans.className} text-[13px] text-[var(--text-primary)] w-20 shrink-0`}>{gw.name}</div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className={`${dmSans.className} text-[11px] text-[var(--text-muted)]`}>{gw.status}</span>
                        <span className={`${jetbrains.className} text-[11px]`} style={{ color: gw.color }}>{gw.rate > 0 ? `${gw.rate}%` : "—"}</span>
                      </div>
                      <div className="w-full h-[4px] bg-[var(--bg-overlay)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${gw.rate}%`, backgroundColor: gw.color }} />
                      </div>
                    </div>
                    <span className={`${dmSans.className} text-[11px] w-[30px] text-right ${gw.trend.startsWith("+") ? "text-[var(--accent-green-text)]" : gw.trend === "N/A" ? "text-[var(--text-muted)]" : "text-[var(--accent-red)]"}`}>{gw.trend}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
