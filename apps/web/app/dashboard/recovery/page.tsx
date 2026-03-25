"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  TrendingUp,
  Zap,
  Clock,
  IndianRupee,
  CalendarDays,
  Download,
  AlertTriangle,
  Lightbulb,
  ExternalLink,
  RefreshCw,
  Mail,
  CheckCircle2,
  X,
  SkipForward
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart,
  Line,
  Cell
} from "recharts";
import { cn } from "@/lib/utils";
import CampaignTimeline, { TimelineStep } from "@/components/dashboard/CampaignTimeline";

// --- STATIC DATA CONSTANTS ---

const RECOVERY_STATS = {
  totalInRecovery: 143,
  recoveredToday: 3840000,
  activeRetries: 7,
  avgRecoveryDays: 2.4,
  monthlyRecovered: 24000000,
  monthlyAtRisk: 30800000,
  recoveryRate: 78,
};

const dayData = [
  { day: 1, rate: 84 }, { day: 2, rate: 81 }, { day: 3, rate: 79 },
  { day: 4, rate: 71 }, { day: 5, rate: 68 }, { day: 6, rate: 64 },
  { day: 7, rate: 62 }, { day: 8, rate: 58 }, { day: 9, rate: 55 },
  { day: 10, rate: 53 }, { day: 11, rate: 51 }, { day: 12, rate: 49 },
  { day: 13, rate: 48 }, { day: 14, rate: 47 }, { day: 15, rate: 50 },
  { day: 16, rate: 48 }, { day: 17, rate: 46 }, { day: 18, rate: 44 },
  { day: 19, rate: 43 }, { day: 20, rate: 44 }, { day: 21, rate: 46 },
  { day: 22, rate: 47 }, { day: 23, rate: 49 }, { day: 24, rate: 62 },
  { day: 25, rate: 78 }, { day: 26, rate: 83 }, { day: 27, rate: 80 },
  { day: 28, rate: 74 }, { day: 29, rate: 64 }, { day: 30, rate: 59 },
  { day: 31, rate: 55 },
];

const channelData = [
  { channel: "WhatsApp",    conversion: 88, responseTime: 85 },
  { channel: "Email seq.",  conversion: 72, responseTime: 55 },
  { channel: "SMS",         conversion: 61, responseTime: 70 },
  { channel: "Auto-retry",  conversion: 79, responseTime: 95 },
  { channel: "Portal link", conversion: 65, responseTime: 40 },
];

const defaultPipelineCards = {
  justFailed: [
    { id: 1, email: "meera@techstartup.in", amount: "₹8,500", gateway: "Razorpay", gatewayColor: "bg-[#3395FF]", reason: "Card expired", time: "4 minutes ago" },
    { id: 2, email: "karthik@saasco.in", amount: "₹22,000", gateway: "Stripe", gatewayColor: "bg-[#635BFF]", reason: "Insufficient funds", time: "12 minutes ago" },
    { id: 3, email: "ankita@brand.co", amount: "₹4,299", gateway: "Cashfree", gatewayColor: "bg-[#F37021]", reason: "UPI mandate failed", time: "28 minutes ago" }
  ],
  scheduled: [
    { id: 4, email: "priya@startup.in", amount: "₹12,800", gateway: "Stripe", gatewayColor: "bg-[#635BFF]", reason: "Card expired", campaign: "7-Day Aggressive", progress: 2 }
  ],
  contacted: [
    { id: 5, email: "raj@example.com", amount: "₹2,999", gateway: "Cashfree", gatewayColor: "bg-[#F37021]", reason: "UPI failure", channel: "WhatsApp", status: "Read", next: "Retry tomorrow" }
  ],
  updated: [
    { id: 6, email: "nisha@brand.co", amount: "₹6,499", gateway: "Razorpay", gatewayColor: "bg-[#3395FF]", reason: "Insufficient funds", via: "Portal link", status: "Confirmation pending" }
  ],
  recovered: [
    { id: 7, email: "amit@venture.com", amount: "₹8,200", gateway: "Razorpay", gatewayColor: "bg-[#3395FF]", via: "Email click → Portal", timeToRecover: "1.4 days" }
  ]
};

const tableData = [
  { id: 1, email: "meera@techstartup.in", amount: "₹8,500", gateway: "Razorpay", declineReason: "Card expired", steps: 3, score: { val: "72%", type: "blue", label: "Good chance" }, status: "Email #2", action: "Email sent · 3h ago", color: "bg-[#3395FF]", isSuccess: false },
  { id: 2, email: "priya@startup.in", amount: "₹12,800", gateway: "Stripe", declineReason: "Card expired", steps: 2, score: { val: "68%", type: "blue", label: "Good chance" }, status: "Retrying", action: "Retry in 3h 42m", color: "bg-[#635BFF]", isSuccess: false },
  { id: 3, email: "raj@example.com", amount: "₹2,999", gateway: "Cashfree", declineReason: "UPI mandate failed", steps: 4, score: { val: "81%", type: "green", label: "High chance" }, status: "WA sent", action: "WA read · 2h ago", color: "bg-[#F37021]", isSuccess: false },
  { id: 4, email: "amit@venture.com", amount: "₹8,200", gateway: "Razorpay", declineReason: "Insufficient funds", steps: 5, score: { val: "100%", type: "green", label: "Recovered" }, status: "Recovered", action: "Recovered · 1d ago", color: "bg-[#3395FF]", isSuccess: true },
  { id: 5, email: "karthik@saasco.in", amount: "₹22,000", gateway: "Stripe", declineReason: "Insufficient funds", steps: 1, score: { val: "51%", type: "amber", label: "Moderate" }, status: "Scheduled", action: "Retry tomorrow", color: "bg-[#635BFF]", isSuccess: false },
  { id: 6, email: "ankita@brand.co", amount: "₹4,299", gateway: "Cashfree", declineReason: "UPI failure", steps: 3, score: { val: "76%", type: "blue", label: "Good chance" }, status: "WA pending", action: "WA queued · 1h ago", color: "bg-[#F37021]", isSuccess: false },
  { id: 7, email: "nisha@brand.co", amount: "₹6,499", gateway: "Razorpay", declineReason: "Insufficient funds", steps: 4, score: { val: "88%", type: "green", label: "High chance" }, status: "Pending", action: "Card updated · 4h ago", color: "bg-[#3395FF]", isSuccess: false },
  { id: 8, email: "dev@company.in", amount: "₹19,999", gateway: "Stripe", declineReason: "Stolen card", steps: 1, score: { val: "0%", type: "red", label: "Hard decline" }, status: "Hard fail", action: "Stopped (fraud flag)", color: "bg-[#635BFF]", isSuccess: false }
];

// Campaign timeline steps for display
const campaignTimelineSteps: TimelineStep[] = [
  { day: "Day 0", channels: ["email", "retry"], stat: "41% conv." },
  { day: "Day 1", channels: ["retry"], stat: "28% conv." },
  { day: "Day 3", channels: ["whatsapp", "email"], stat: "22% conv." },
  { day: "Day 5", channels: ["email"], stat: "18% conv." },
  { day: "Day 7", channels: ["whatsapp", "retry"], },
];

const formatINR = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN")}`;

// --- SUB COMPONENTS ---

const CountdownTimer = ({ targetMinutes = 23 }: { targetMinutes?: number }) => {
  const [timeLeft, setTimeLeft] = useState({ m: targetMinutes, s: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.s > 0) return { ...prev, s: prev.s - 1 };
        if (prev.m > 0) return { m: prev.m - 1, s: 59 };
        return { m: 0, s: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [targetMinutes]);

  return (
    <span className="font-mono">
      {timeLeft.m}h {timeLeft.s < 10 ? `0${timeLeft.s}` : timeLeft.s}m
    </span>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const isPayday = [1, 2, 3, 25, 26, 27, 28].includes(parseInt(label));
    return (
      <div className="bg-rx-elevated border border-border p-3 rounded-lg shadow-xl">
        <p className="text-sm font-body text-rx-text-primary mb-1">Day {label}</p>
        <p className="text-xs font-mono text-rx-green-text">Rate: {payload[0].value}%</p>
        {isPayday && <p className="text-xs mt-1 font-body text-rx-text-muted">Payday effect active</p>}
      </div>
    );
  }
  return null;
};

const FunnelChart = () => {
  const [mounted, setMounted] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  const stages = [
    { label: "FAILED PAYMENTS", count: "308 payments", pct: "100%", w: 100, color: "hsl(var(--accent-red))", nextDropoff: "12% hard declines", dropoffColor: "text-rx-red", tooltipDesc: "Total failed payments this month." },
    { label: "RETRY ELIGIBLE", count: "271 payments", pct: "88%", w: 88, color: "#f97316", nextDropoff: "2% not triggered", dropoffColor: "text-rx-amber", tooltipDesc: "88% of failed payments are retry-eligible." },
    { label: "CAMPAIGN TRIGGERED", count: "265 payments", pct: "86%", w: 86, color: "hsl(var(--accent-amber))", nextDropoff: "8% no contact info", dropoffColor: "text-rx-text-muted", tooltipDesc: "98% of eligible payments triggered a campaign." },
    { label: "CUSTOMER CONTACTED", count: "241 payments", pct: "78%", w: 78, color: "#84cc16", nextDropoff: "14% didn't update", dropoffColor: "text-rx-text-muted", tooltipDesc: "91% of targeted users were successfully contacted." },
    { label: "PAYMENT UPDATED", count: "198 payments", pct: "64%", w: 64, color: "#22c55e", nextDropoff: "0% capture failure", dropoffColor: "text-rx-text-muted", tooltipDesc: "82% of contacted users updated their payment info." },
    { label: "RECOVERED", count: "240 payments", pct: "78%", w: 78, color: "hsl(var(--accent-green))", nextDropoff: null, tooltipDesc: "Total payments successfully recovered." }
  ];

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 relative">
        {stages.map((s, i) => {
          const rightOffset = (i + 1) * 2;
          const clipPath = `polygon(0 0, 100% ${rightOffset}px, 100% calc(100% - ${rightOffset}px), 0 100%)`;
          const isDimmed = hoveredIndex !== null && hoveredIndex !== i;

          return (
            <div
              key={i}
              className="flex items-center text-[13px] relative h-8"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className={cn("w-[140px] font-body text-xs transition-opacity duration-300 cursor-default", isDimmed ? "opacity-50 text-rx-text-muted" : "text-rx-text-secondary")}>
                {s.label}
              </div>

              <div className="flex-1 px-3 relative h-full flex items-center">
                <div
                  className={cn(
                    "absolute left-3 h-full rounded-sm transition-all duration-1000 ease-out cursor-crosshair",
                    isDimmed ? "opacity-30" : hoveredIndex === i ? "opacity-100" : "opacity-85"
                  )}
                  style={{
                    width: mounted ? `${s.w}%` : "0%",
                    backgroundColor: s.color,
                    clipPath,
                    transitionDelay: mounted ? "0ms" : `${i * 120}ms`
                  }}
                />

                {hoveredIndex === i && (
                  <div className="absolute top-0 right-0 z-50 transform -translate-y-full -translate-x-1/2 mb-1 pointer-events-none animate-slide-in-top">
                    <div className="bg-rx-elevated border border-border px-3 py-2 rounded-lg shadow-xl whitespace-nowrap">
                      <div className="font-heading font-semibold text-rx-text-primary text-xs mb-0.5">{s.label}: {s.count}</div>
                      <div className="font-body text-rx-text-muted text-[11px]">{s.tooltipDesc}</div>
                    </div>
                  </div>
                )}

                {s.nextDropoff && mounted && i === 0 && (
                  <div className={`absolute -bottom-[15px] right-[20%] text-[11px] font-body z-10 ${s.dropoffColor} opacity-0 animate-[fade-in_0.5s_ease-out_1s_forwards] text-right pointer-events-none`}>
                    ↘ {s.nextDropoff}
                  </div>
                )}
              </div>

              <div className={cn("w-[100px] flex items-center justify-end font-mono text-xs transition-opacity duration-300", isDimmed ? "opacity-50 text-rx-text-muted" : "text-rx-text-secondary")}>
                <span className={cn("mr-3", isDimmed ? "text-rx-text-muted" : "text-rx-text-primary")}>{s.count.split(" ")[0]}</span>
                <span>{s.pct}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-7 bg-rx-green-dim border-l-2 border-rx-green px-3 py-2 rounded-r-lg text-[13px] font-body text-rx-text-secondary leading-tight">
        71 payments (23%) were lost to hard declines and were correctly skipped — no wasted retries.
      </div>
    </div>
  );
};

const KanbanCard = ({
  data,
  type,
  onCardClick,
  isDragging,
  onDragStart,
}: {
  data: any;
  type: string;
  onCardClick?: () => void;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
    const diff = touchCurrentX.current - touchStartX.current;
    if (Math.abs(diff) < 15) return;
    let newOffset = diff;
    if (newOffset > 80) newOffset = 80;
    if (newOffset < -160) newOffset = -160;
    setSwipeOffset(newOffset);
  };

  const handleTouchEnd = () => {
    if (swipeOffset > 40) setSwipeOffset(80);
    else if (swipeOffset < -60) setSwipeOffset(-160);
    else setSwipeOffset(0);
  };

  const isRevealed = swipeOffset !== 0;

  return (
    <div className="relative overflow-hidden rounded-lg group w-full shrink-0">
      <div className="absolute inset-0 flex justify-between bg-rx-subtle rounded-lg overflow-hidden md:hidden shadow-[inset_0_0_10px_rgba(0,0,0,0.2)]">
        <div
          className="w-[80px] bg-rx-blue flex flex-col items-center justify-center text-white text-xs font-body font-medium h-full px-2"
          onClick={(e) => { e.stopPropagation(); setSwipeOffset(0); }}
        >
          <RefreshCw size={16} className="mb-1" />
          Retry
        </div>
        <div className="w-[160px] flex h-full">
          <div
            className="flex-1 bg-rx-amber flex flex-col items-center justify-center text-black text-[11px] font-body font-medium px-2"
            onClick={(e) => { e.stopPropagation(); setSwipeOffset(0); }}
          >
            <SkipForward size={16} className="mb-1" />
            Skip
          </div>
          <div
            className="flex-1 bg-rx-red flex flex-col items-center justify-center text-white text-[11px] font-body font-medium px-2"
            onClick={(e) => { e.stopPropagation(); setSwipeOffset(0); }}
          >
            <X size={16} className="mb-1" />
            Cancel
          </div>
        </div>
      </div>

      <div
        draggable
        onDragStart={onDragStart}
        onClick={onCardClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${swipeOffset}px)` }}
        className={cn(
          "bg-rx-surface border p-3.5 md:p-3.5 py-4 cursor-pointer select-none relative overflow-hidden z-10 w-full h-full",
          isRevealed ? "transition-transform ease-out duration-200" : "transition-all duration-200",
          !isRevealed && "hover:-translate-y-[1px] hover:border-rx-text-muted",
          isDragging ? "scale-[1.03] opacity-50 shadow-[0_0_15px_rgba(59,130,246,0.3)] border-rx-blue ring-2 ring-rx-blue" : "border-border",
          data._isNew && type === "justFailed" && "animate-slide-in-top"
        )}
      >
        {type === "recovered" && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-rx-green" />}
        {type === "recovered" && <div className="absolute inset-0 bg-rx-green/5 pointer-events-none" />}

        <div className="flex items-center gap-1.5 mb-2">
          <div className={`w-2 h-2 rounded-full ${data.gatewayColor}`} />
          <span className="text-[10px] font-body text-rx-text-muted uppercase tracking-wider">{data.gateway}</span>
        </div>

        <div className="text-[13px] font-body font-medium text-rx-text-primary truncate">{data.email}</div>
        <div className={cn("text-[15px] md:text-[15px] text-[16px] font-mono font-semibold mt-0.5", type === "recovered" ? "text-rx-green-text" : type === "justFailed" ? "text-rx-red" : "text-rx-text-primary")}>
          {type === "recovered" ? `${data.amount} recovered ✓` : data.amount}
        </div>

        <div className="mt-3 space-y-1.5 flex flex-col items-start w-full">
          {type === "justFailed" && (
            <>
              <div className="text-[11px] md:text-[11px] text-[12px] font-body text-rx-text-muted truncate w-full">{data.reason}</div>
              <div className="text-[11px] md:text-[11px] text-[12px] font-body text-rx-text-secondary">Failed: {data.time}</div>
              <button className="w-full mt-2 h-[30px] rounded-md bg-rx-blue hover:bg-rx-blue/90 text-white text-xs font-body transition-colors pointer-events-none hidden md:block">Start recovery</button>
            </>
          )}
          {type === "scheduled" && (
            <>
              <div className="text-[11px] font-body text-rx-text-muted truncate w-full">{data.reason}</div>
              <div className="text-[11px] font-body text-rx-amber flex items-center gap-1">
                <Clock size={10} /> Retry in: <CountdownTimer targetMinutes={222} />
              </div>
              <div className="text-[10px] font-body text-rx-text-muted mt-2 truncate w-full">Camp: {data.campaign}</div>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map(step => (
                  <div key={step} className={cn("w-1.5 h-1.5 rounded-full", step <= data.progress ? "bg-rx-blue shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "border border-border")} />
                ))}
              </div>
            </>
          )}
          {type === "contacted" && (
            <>
              <div className="text-[11px] font-body text-rx-text-muted truncate w-full">{data.reason}</div>
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-body bg-rx-green-dim text-rx-green">
                {data.channel} ✓ {data.status}
              </div>
              <div className="text-[10px] font-body text-rx-text-muted mt-1 w-full">Next: {data.next}</div>
            </>
          )}
          {type === "updated" && (
            <>
              <div className="text-[11px] font-body text-rx-text-muted truncate w-full">{data.reason}</div>
              <div className="text-[11px] font-body text-rx-text-secondary w-full">Via: {data.via}</div>
              <div className="text-[10px] font-body text-rx-text-muted mt-1 w-full">Status: {data.status}</div>
            </>
          )}
          {type === "recovered" && (
            <>
              <div className="text-[11px] font-body text-rx-text-secondary truncate w-full">Via: {data.via}</div>
              <div className="text-[11px] font-body text-rx-text-muted mt-1 w-full">Time: {data.timeToRecover}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const TimelineEntry = ({
  time, title, desc, type, isLast, index = 0, expanded = true
}: {
  time: string;
  title: string;
  desc: string;
  type: "success" | "outreach" | "retry" | "failure" | "info";
  isLast?: boolean;
  index?: number;
  expanded?: boolean;
}) => {
  const dotColor =
    type === "success" ? "bg-rx-green" :
    type === "outreach" ? "bg-rx-blue" :
    type === "retry" ? "bg-rx-amber" :
    type === "failure" ? "bg-rx-red" :
    "bg-rx-blue";

  return (
    <div
      className={cn(
        "flex items-start transition-all duration-500 ease-out",
        expanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
      )}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <div className="w-[120px] shrink-0 text-right pr-4 font-mono text-[12px] text-rx-text-muted mt-0.5">{time}</div>
      <div className="flex flex-col items-center mr-4 relative self-stretch">
        <div className={`w-2 h-2 rounded-full ${dotColor} relative z-10 shadow-[0_0_8px_rgba(0,0,0,0.2)]`} />
        {!isLast && <div className="w-[1px] h-full bg-border absolute top-2 pb-4" />}
      </div>
      <div className="pb-5">
        <div className="text-[13px] font-body font-medium text-rx-text-primary">{title}</div>
        <div className="text-[12px] font-body text-rx-text-muted mt-0.5 whitespace-pre-line leading-relaxed">{desc}</div>
      </div>
    </div>
  );
};

// --- Payment type for API data ---
interface PaymentRecord {
  id: string;
  email?: string;
  customerEmail?: string;
  amount: number;
  currency?: string;
  gateway?: string;
  status: string;
  failedAt?: string;
  createdAt?: string;
  declineReason?: string;
}

// --- MAIN PAGE ---

export default function RecoveryPage() {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [pipelineData, setPipelineData] = useState(defaultPipelineCards);
  const [draggingCard, setDraggingCard] = useState<{ id: number; type: string } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [toast, setToast] = useState<{ message: string; amount: string; email: string } | null>(null);
  const [mobileStage, setMobileStage] = useState<"justFailed" | "scheduled" | "contacted" | "updated" | "recovered">("justFailed");
  const [isPaused, setIsPaused] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced">("idle");
  const [nextRetry, setNextRetry] = useState(23 * 60 + 41);
  const [isRetrying, setIsRetrying] = useState(false);

  // Fetch real payment data on mount
  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const res = await fetch("/api/dashboard/payments?limit=20");
        if (!res.ok) return;
        const json = await res.json();
        const payments: PaymentRecord[] = json.data ?? json.payments ?? json ?? [];

        if (payments.length === 0) return;

        // Map API data to pipeline cards, placing them in justFailed
        const mapped = payments.map((p, idx) => ({
          id: typeof p.id === "string" ? idx + 100 : Number(p.id) + 100,
          email: p.email ?? p.customerEmail ?? `customer-${idx}@unknown.com`,
          amount: p.currency === "INR" || !p.currency
            ? `₹${(p.amount / 100).toLocaleString("en-IN")}`
            : `₹${(p.amount / 100).toLocaleString("en-IN")}`,
          gateway: p.gateway ?? "Razorpay",
          gatewayColor:
            p.gateway?.toLowerCase() === "stripe"   ? "bg-[#635BFF]" :
            p.gateway?.toLowerCase() === "cashfree" ? "bg-[#F37021]" :
            "bg-[#3395FF]",
          reason: p.declineReason ?? "Payment failed",
          time: p.failedAt ?? p.createdAt ?? "Recently",
        }));

        setPipelineData(prev => ({
          ...prev,
          justFailed: [...mapped, ...prev.justFailed],
        }));
      } catch {
        // Silently fall back to static data
      }
    };

    fetchPayments();
  }, []);

  // Recovery engine timer
  useEffect(() => {
    if (isPaused || isRetrying) return;
    const timer = setInterval(() => {
      setNextRetry(prev => {
        if (prev <= 1) {
          setIsRetrying(true);
          setTimeout(() => {
            setIsRetrying(false);
            setNextRetry(23 * 60 + 41);
          }, 3000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPaused, isRetrying]);

  const handleSync = () => {
    if (syncState !== "idle") return;
    setSyncState("syncing");
    setTimeout(() => {
      setSyncState("synced");
      setTimeout(() => setSyncState("idle"), 1000);
    }, 2000);
  };

  // Auto-add simulated failed payments every 45s
  useEffect(() => {
    const timer = setInterval(() => {
      const newCard = {
        id: Date.now(),
        email: `u${Math.floor(Math.random() * 900)}@customer.com`,
        amount: "₹" + Math.floor(1000 + Math.random() * 9000).toLocaleString("en-IN"),
        gateway: ["Razorpay", "Stripe", "Cashfree"][Math.floor(Math.random() * 3)],
        gatewayColor: "bg-[#3395FF]",
        reason: "Card expired",
        time: "Just now",
        _isNew: true
      };
      if (newCard.gateway === "Stripe") newCard.gatewayColor = "bg-[#635BFF]";
      if (newCard.gateway === "Cashfree") newCard.gatewayColor = "bg-[#F37021]";

      setPipelineData(prev => ({ ...prev, justFailed: [newCard, ...prev.justFailed] }));
      setToast({ message: "New failed payment detected", amount: newCard.amount, email: newCard.email });
      setTimeout(() => setToast(null), 6000);
    }, 45000);
    return () => clearInterval(timer);
  }, []);

  const handleDragStart = (e: React.DragEvent, id: number, type: string) => {
    e.dataTransfer.setData("cardId", id.toString());
    e.dataTransfer.setData("sourceType", type);
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => setDraggingCard({ id, type }), 0);
  };

  const handleDragOver = (e: React.DragEvent, colType: string) => {
    e.preventDefault();
    if (dragOverCol !== colType) setDragOverCol(colType);
  };

  const handleDrop = (e: React.DragEvent, destType: string) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggingCard) return;
    const sourceId = draggingCard.id;
    const sourceType = draggingCard.type;
    setDraggingCard(null);
    if (sourceType === destType) return;

    setPipelineData(prev => {
      const sourceList = [...prev[sourceType as keyof typeof prev]];
      const destList = [...prev[destType as keyof typeof prev]];
      const cardIndex = sourceList.findIndex(c => c.id === sourceId);
      if (cardIndex === -1) return prev;
      const [card] = sourceList.splice(cardIndex, 1);
      destList.unshift(card);
      return { ...prev, [sourceType]: sourceList, [destType]: destList };
    });
  };

  const getColClass = (colType: string, defaultBorder: string) => cn(
    "flex-1 bg-rx-subtle border-border/50 border rounded-xl p-3.5 flex flex-col gap-3 min-w-full md:min-w-[280px] transition-colors duration-200",
    dragOverCol === colType ? "border-rx-blue shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]" : `border-t-[3px] ${defaultBorder}`,
    mobileStage !== colType && "hidden md:flex"
  );

  const stageTabs = [
    { id: "justFailed",  label: "Just Failed",  count: pipelineData.justFailed.length },
    { id: "scheduled",   label: "Scheduled",    count: pipelineData.scheduled.length },
    { id: "contacted",   label: "Contacted",    count: pipelineData.contacted.length },
    { id: "updated",     label: "Updated",      count: pipelineData.updated.length },
    { id: "recovered",   label: "Recovered",    count: pipelineData.recovered.length },
  ];

  return (
    <div className="min-h-screen pb-24 relative overflow-hidden" style={{
      backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.025) 1px, transparent 1px)",
      backgroundSize: "24px 24px"
    }}>
      {/* Ambient Glow */}
      <div className="absolute top-[300px] left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-rx-blue/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="px-8 py-6 mb-2">
        <a href="/dashboard" className="text-rx-text-muted text-[13px] hover:text-rx-text-secondary transition-colors mb-2 inline-block">
          ← Dashboard
        </a>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[26px] font-heading font-bold text-rx-text-primary tracking-tight">Recovery Intelligence</h1>
            <p className="text-sm font-body text-rx-text-muted mt-1">Real-time view of all active recovery operations</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rx-green-dim border border-rx-green/30">
              <div className="w-2 h-2 rounded-full bg-rx-green animate-live-pulse" />
              <span className="text-xs font-body text-rx-green-text font-medium">Recovery engine active</span>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-rx-surface hover:bg-rx-elevated text-sm font-body text-rx-text-secondary transition-colors">
              <CalendarDays size={14} />
              Last 30 days ▾
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-rx-surface text-sm font-body text-rx-text-secondary transition-colors">
              <Download size={14} />
              Export recovery report
            </button>
          </div>
        </div>
      </header>

      <div className="px-8 space-y-6">
        {/* SECTION A — KPI STRIP */}
        <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-rx-surface border border-border rounded-xl p-5 card-hover transition-all hover:-translate-y-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-rx-blue-dim flex items-center justify-center text-rx-blue">
                <Users size={18} />
              </div>
              <span className="text-[13px] font-body text-rx-text-muted">Customers in recovery</span>
            </div>
            <div className="text-[32px] font-heading font-bold text-rx-text-primary leading-none">143</div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-body bg-rx-blue/15 text-rx-blue">↑ 12 new today</span>
              <div className="flex items-end gap-[3px] h-5">
                {[4, 8, 12, 16, 10, 14, 20].map((h, i) => (
                  <div key={i} className="w-1 bg-rx-blue rounded-t-sm opacity-80" style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>
          </div>

          <div className="bg-rx-surface border border-border rounded-xl p-5 card-hover transition-all hover:-translate-y-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-rx-green-dim flex items-center justify-center text-rx-green">
                <TrendingUp size={18} />
              </div>
              <span className="text-[13px] font-body text-rx-text-muted">Recovered today</span>
            </div>
            <div className="text-[32px] font-mono font-bold text-rx-green-text leading-none animate-[money-shimmer_2s_infinite]">₹38,400</div>
            <div className="mt-4">
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-body bg-rx-green-dim text-rx-green">↑ from ₹29,200 yesterday</span>
            </div>
          </div>

          <div className="bg-rx-surface border border-border rounded-xl p-5 card-hover transition-all hover:-translate-y-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-rx-amber-dim flex items-center justify-center text-rx-amber">
                <Zap size={18} />
              </div>
              <span className="text-[13px] font-body text-rx-text-muted">Payments being retried</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-8 h-8">
                <div className="absolute inset-0 rounded-full bg-rx-amber opacity-30 animate-ping" />
                <div className="text-[32px] font-heading font-bold text-rx-amber leading-none relative z-10">7</div>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-body bg-rx-amber-dim text-rx-amber border border-rx-amber/20">
                Next retry in <CountdownTimer targetMinutes={23} />
              </span>
            </div>
          </div>

          <div className="bg-rx-surface border border-border rounded-xl p-5 card-hover transition-all hover:-translate-y-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>
                <Clock size={18} />
              </div>
              <span className="text-[13px] font-body text-rx-text-muted">Avg time to recover</span>
            </div>
            <div className="text-[32px] font-heading font-bold text-rx-text-primary leading-none">2.4 days</div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-body bg-rx-green-dim text-rx-green">↓ 0.3 days vs last month</span>
            </div>
            <div className="mt-2 text-[11px] font-body text-rx-text-muted">Fastest: 4 hours · Slowest: 11 days</div>
          </div>

          <div className="bg-rx-surface border border-border rounded-xl p-5 card-hover transition-all hover:-translate-y-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-rx-green-dim flex items-center justify-center text-rx-green">
                <IndianRupee size={18} />
              </div>
              <span className="text-[13px] font-body text-rx-text-muted">Revenue saved this month</span>
            </div>
            <div className="text-[32px] font-mono font-bold text-rx-green-text leading-none animate-[money-shimmer_2s_infinite]">₹2,40,000</div>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-body bg-rx-green-dim text-rx-green">+₹18,400 vs last month</span>
            </div>
            <div className="mt-3">
              <div className="h-[3px] w-full bg-rx-overlay rounded-full overflow-hidden">
                <div className="h-full bg-rx-green w-[78%]" />
              </div>
              <div className="text-[10px] font-body text-rx-text-muted mt-1.5">78% of at-risk MRR recovered</div>
            </div>
          </div>
        </section>

        {/* SECTION B — CHARTS ROW */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-10 gap-4">
          {/* B1: Funnel */}
          <div className="lg:col-span-4 bg-rx-surface border border-border rounded-xl p-6">
            <div className="mb-2">
              <h2 className="text-[15px] font-heading font-semibold text-rx-text-primary">Recovery funnel</h2>
              <p className="text-[13px] font-body text-rx-text-muted mt-0.5">This month&apos;s payment lifecycle</p>
            </div>
            <FunnelChart />
          </div>

          {/* B2: Best recovery days */}
          <div className="lg:col-span-3 bg-rx-surface border border-border rounded-xl p-6">
            <div className="mb-4">
              <h2 className="text-[15px] font-heading font-semibold text-rx-text-primary">Best recovery days</h2>
              <p className="text-[13px] font-body text-rx-text-muted mt-0.5">When retries succeed most</p>
            </div>
            <div className="h-[220px] w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayData} margin={{ top: 15, right: 0, left: -25, bottom: 0 }}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--text-muted))", fontFamily: '"DM Sans", sans-serif' }}
                         ticks={[1, 5, 10, 15, 20, 25, 31]} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--text-muted))", fontFamily: '"DM Sans", sans-serif' }} />
                  <ReTooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
                  <Bar dataKey="rate" radius={[2, 2, 0, 0]}>
                    {dayData.map((entry, index) => {
                      const isGovtPayday = entry.day >= 1 && entry.day <= 7;
                      const isPrivatePayday = entry.day >= 24 && entry.day <= 28;
                      const color = isGovtPayday ? "hsl(var(--accent-green-text))" : isPrivatePayday ? "hsl(var(--accent-green))" : "hsl(var(--bg-overlay))";
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* B3: Channel effectiveness — RadarChart (static data) */}
          <div className="lg:col-span-3 bg-rx-surface border border-border rounded-xl p-6">
            <div className="mb-2">
              <h2 className="text-[15px] font-heading font-semibold text-rx-text-primary">Channel effectiveness</h2>
              <p className="text-[13px] font-body text-rx-text-muted mt-0.5">Conversion rate per outreach type</p>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={channelData}>
                  <PolarGrid stroke="hsl(var(--border-default))" />
                  <PolarAngleAxis dataKey="channel" tick={{ fill: "hsl(var(--text-secondary))", fontSize: 11, fontFamily: '"DM Sans", sans-serif' }} />
                  <Radar name="Conversion rate %" dataKey="conversion" stroke="hsl(var(--accent-blue))" fill="hsl(var(--accent-blue))" fillOpacity={0.4} />
                  <Radar name="Response time (hrs)" dataKey="responseTime" stroke="hsl(var(--accent-amber))" fill="transparent" strokeDasharray="3 3" />
                  <ReTooltip contentStyle={{ backgroundColor: "hsl(var(--bg-elevated))", borderColor: "hsl(var(--border-default))", borderRadius: "8px" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1.5 mt-2 px-2">
              <div className="flex items-center gap-2 text-[11px] font-body text-rx-text-muted">
                <div className="w-2.5 h-2.5 rounded-sm bg-rx-blue opacity-50 border border-rx-blue" />
                <span>Conversion rate %</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-body text-rx-text-muted">
                <div className="w-2.5 h-2.5 rounded-sm border-[1.5px] border-dashed border-rx-amber" />
                <span>Response time (hrs)</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION B.5 — CAMPAIGN TIMELINE */}
        <section className="bg-rx-surface border border-border rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-[15px] font-heading font-semibold text-rx-text-primary">7-Day Aggressive campaign</h2>
            <p className="text-[13px] font-body text-rx-text-muted mt-0.5">Active campaign sequence · 143 customers enrolled</p>
          </div>
          <CampaignTimeline steps={campaignTimelineSteps} currentStep={2} />
        </section>

        {/* SECTION C — ACTIVE RECOVERY PIPELINE */}
        <section className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-[16px] font-heading font-semibold text-rx-text-primary">Active recovery pipeline</h2>
              <span className="px-2 py-0.5 text-xs font-body rounded-md bg-rx-blue-dim text-rx-blue font-medium hidden md:inline-block">143 customers</span>
            </div>
            <div className="flex items-center gap-3">
              <a href="#" className="hidden md:block text-xs font-body text-rx-blue hover:underline">View all</a>
              <div className="flex items-center bg-rx-surface border border-border rounded-lg p-1">
                {["All", "Razorpay", "Stripe", "Cashfree"].map((gw, idx) => (
                  <button key={gw} className={cn("px-3 py-1 text-[11px] font-body rounded-md transition-colors", idx === 0 ? "bg-rx-blue-dim text-rx-blue border border-rx-blue/30" : "text-rx-text-muted hover:text-rx-text-secondary")}>
                    {gw}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile Stage Selector */}
          <div className="md:hidden flex overflow-x-auto gap-2 pb-3 mb-2 scrollbar-hide -mx-8 px-8">
            {stageTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setMobileStage(tab.id as any)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-body whitespace-nowrap transition-colors",
                  mobileStage === tab.id
                    ? "bg-rx-blue text-white font-medium"
                    : "bg-rx-overlay text-rx-text-muted hover:text-rx-text-primary"
                )}
              >
                {tab.label}
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium",
                  mobileStage === tab.id ? "bg-white/20 text-white" : "bg-rx-surface text-rx-text-muted"
                )}>{tab.count}</span>
              </button>
            ))}
          </div>

          <div className={cn("pb-4 transition-all duration-500 overflow-x-auto custom-scrollbar", isPaused ? "grayscale-[0.4] opacity-80" : "")}>
            <div className="flex gap-4 min-w-full md:min-w-[1450px] mb-2 px-0 md:px-0">
              {/* Column 1 — Just Failed */}
              <div
                className={getColClass("justFailed", "border-t-rx-red")}
                onDragOver={(e) => handleDragOver(e, "justFailed")}
                onDrop={(e) => handleDrop(e, "justFailed")}
              >
                <div className="flex items-center gap-2 mb-1 shrink-0">
                  <h3 className="text-sm font-heading font-semibold text-rx-red">Just Failed</h3>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-rx-red/10 text-rx-red font-mono">{pipelineData.justFailed.length}</span>
                </div>
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[640px] pr-1.5 custom-scrollbar pb-2">
                  {pipelineData.justFailed.map(c => (
                    <KanbanCard
                      key={c.id}
                      data={c}
                      type="justFailed"
                      onCardClick={() => setSelectedCard(c)}
                      isDragging={draggingCard?.id === c.id}
                      onDragStart={(e) => handleDragStart(e, c.id, "justFailed")}
                    />
                  ))}
                </div>
                <button className="text-xs font-body text-rx-text-muted hover:text-rx-text-primary transition-colors py-1 shrink-0">+ 15 more</button>
              </div>

              {/* Column 2 — Retry Scheduled */}
              <div
                className={getColClass("scheduled", "border-t-rx-amber")}
                onDragOver={(e) => handleDragOver(e, "scheduled")}
                onDrop={(e) => handleDrop(e, "scheduled")}
              >
                <div className="flex items-center gap-2 mb-1 shrink-0">
                  <h3 className="text-sm font-heading font-semibold text-rx-amber">Retry Scheduled</h3>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-rx-amber/10 text-rx-amber font-mono">{pipelineData.scheduled.length}</span>
                </div>
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[640px] pr-1.5 custom-scrollbar pb-2">
                  {pipelineData.scheduled.map(c => (
                    <KanbanCard
                      key={c.id}
                      data={c}
                      type="scheduled"
                      onCardClick={() => setSelectedCard(c)}
                      isDragging={draggingCard?.id === c.id}
                      onDragStart={(e) => handleDragStart(e, c.id, "scheduled")}
                    />
                  ))}
                </div>
              </div>

              {/* Column 3 — Contacted */}
              <div
                className={getColClass("contacted", "border-t-rx-blue")}
                onDragOver={(e) => handleDragOver(e, "contacted")}
                onDrop={(e) => handleDrop(e, "contacted")}
              >
                <div className="flex items-center gap-2 mb-1 shrink-0">
                  <h3 className="text-sm font-heading font-semibold text-rx-blue">Contacted</h3>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-rx-blue/10 text-rx-blue font-mono">{pipelineData.contacted.length}</span>
                </div>
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[640px] pr-1.5 custom-scrollbar pb-2">
                  {pipelineData.contacted.map(c => (
                    <KanbanCard
                      key={c.id}
                      data={c}
                      type="contacted"
                      onCardClick={() => setSelectedCard(c)}
                      isDragging={draggingCard?.id === c.id}
                      onDragStart={(e) => handleDragStart(e, c.id, "contacted")}
                    />
                  ))}
                </div>
              </div>

              {/* Column 4 — Payment Updated */}
              <div
                className={getColClass("updated", "border-t-[#8b5cf6]")}
                onDragOver={(e) => handleDragOver(e, "updated")}
                onDrop={(e) => handleDrop(e, "updated")}
              >
                <div className="flex items-center gap-2 mb-1 shrink-0">
                  <h3 className="text-sm font-heading font-semibold text-[#8b5cf6]">Payment Updated</h3>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-[#8b5cf6]/10 text-[#8b5cf6] font-mono">{pipelineData.updated.length}</span>
                </div>
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[640px] pr-1.5 custom-scrollbar pb-2">
                  {pipelineData.updated.map(c => (
                    <KanbanCard
                      key={c.id}
                      data={c}
                      type="updated"
                      onCardClick={() => setSelectedCard(c)}
                      isDragging={draggingCard?.id === c.id}
                      onDragStart={(e) => handleDragStart(e, c.id, "updated")}
                    />
                  ))}
                </div>
              </div>

              {/* Column 5 — Recovered */}
              <div
                className={getColClass("recovered", "border-t-rx-green")}
                onDragOver={(e) => handleDragOver(e, "recovered")}
                onDrop={(e) => handleDrop(e, "recovered")}
              >
                <div className="flex items-center gap-2 mb-1 shrink-0">
                  <h3 className="text-sm font-heading font-semibold text-rx-green">Recovered ✓</h3>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-rx-green/10 text-rx-green font-mono">{pipelineData.recovered.length}</span>
                </div>
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[640px] pr-1.5 custom-scrollbar pb-2">
                  {pipelineData.recovered.map(c => (
                    <KanbanCard
                      key={c.id}
                      data={c}
                      type="recovered"
                      onCardClick={() => setSelectedCard(c)}
                      isDragging={draggingCard?.id === c.id}
                      onDragStart={(e) => handleDragStart(e, c.id, "recovered")}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile View All Button */}
          <div className="md:hidden mt-4 pt-2 mb-2">
            <button className="w-full py-3 bg-rx-surface border border-border text-rx-text-secondary rounded-lg text-sm font-body font-medium flex items-center justify-center gap-2 hover:bg-rx-elevated active:bg-rx-overlay transition-colors shadow-sm">
              View all {stageTabs.find(t => t.id === mobileStage)?.count} {mobileStage} customers →
            </button>
          </div>
        </section>

        {/* SECTION D — RECOVERY TIMELINE TABLE */}
        <section className="pt-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4">
            <h2 className="text-[16px] font-heading font-semibold text-rx-text-primary">Recovery timeline</h2>
            <div className="flex items-center gap-2">
              <input type="text" placeholder="Search by email, amount or decline reason..." className="w-[280px] bg-rx-elevated border border-border rounded-md px-3 py-1.5 text-xs font-body text-rx-text-primary outline-none focus:border-rx-blue/50" />
              <button className="px-3 py-1.5 bg-rx-surface border border-border rounded-md text-xs font-body text-rx-text-secondary hover:bg-rx-elevated">All statuses ▾</button>
              <button className="px-3 py-1.5 bg-rx-surface border border-border rounded-md text-xs font-body text-rx-text-secondary hover:bg-rx-elevated">All gateways ▾</button>
              <button className="px-3 py-1.5 bg-rx-surface border border-border rounded-md text-xs font-body text-rx-text-secondary hover:bg-rx-elevated">Columns ▾</button>
              <button className="px-3 py-1.5 bg-rx-surface border border-border rounded-md text-xs font-body text-rx-text-secondary hover:bg-rx-elevated">Export ▾</button>
            </div>
          </div>

          <div className="bg-rx-surface border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-border bg-rx-elevated/50">
                  <th className="px-4 py-3 w-10"><div className="w-4 h-4 rounded border border-border" /></th>
                  <th className="px-4 py-3 font-body font-medium text-rx-text-secondary">Customer</th>
                  <th className="px-4 py-3 font-body font-medium text-rx-text-secondary sticky right-[180px] bg-rx-elevated/95 z-10 md:static border-l border-border/50 md:border-l-0 shadow-[-4px_0_10px_rgba(0,0,0,0.05)] md:shadow-none">Amount</th>
                  <th className="px-4 py-3 font-body font-medium text-rx-text-secondary">Gateway</th>
                  <th className="px-4 py-3 font-body font-medium text-rx-text-secondary">Decline type</th>
                  <th className="px-4 py-3 font-body font-medium text-rx-text-secondary text-center">Steps</th>
                  <th className="px-4 py-3 font-body font-medium text-rx-text-secondary">Score</th>
                  <th className="px-4 py-3 font-body font-medium text-rx-text-secondary sticky right-[80px] bg-rx-elevated/95 z-10 md:static shadow-[-4px_0_10px_rgba(0,0,0,0.05)] md:shadow-none">Status</th>
                  <th className="px-4 py-3 font-body font-medium text-rx-text-secondary">Last action</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row) => {
                  const isExpanded = expandedRow === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <tr onClick={() => setExpandedRow(isExpanded ? null : row.id)} className="border-b border-border hover:bg-rx-overlay/50 cursor-pointer transition-colors group relative z-20">
                        <td className="px-4 py-3 bg-transparent"><div className="w-4 h-4 rounded border border-border" /></td>
                        <td className="px-4 py-3 bg-transparent">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-rx-overlay flex items-center justify-center text-[10px] font-heading font-medium text-rx-text-secondary">{row.email[0].toUpperCase()}</div>
                            <div>
                              <div className="text-[13px] font-body text-rx-text-primary">{row.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className={cn("px-4 py-3 font-mono text-right sticky right-[180px] z-10 md:static border-l border-border/50 md:border-l-0 shadow-[-4px_0_10px_rgba(0,0,0,0.05)] md:shadow-none", isExpanded ? "bg-rx-subtle" : "bg-rx-surface group-hover:bg-rx-overlay/50 transition-colors", row.isSuccess ? "text-rx-green-text" : row.status === "Hard fail" ? "text-rx-red" : "text-rx-text-primary")}>{row.amount}</td>
                        <td className="px-4 py-3 bg-transparent">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${row.color}`} />
                            <span className="text-[12px] font-body text-rx-text-muted">{row.gateway}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[12px] font-body text-rx-text-secondary bg-transparent">{row.declineReason}</td>
                        <td className="px-4 py-3 bg-transparent">
                          <div className="flex items-center justify-center gap-[3px]">
                            {[1, 2, 3, 4, 5].map(step => (
                              <div key={step} className={cn("w-1.5 h-1.5 rounded-full transition-colors", step <= row.steps ? (row.isSuccess ? "bg-rx-green" : "bg-rx-blue") : "border border-border")} />
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 bg-transparent">
                          {row.score.val !== "0%" && (
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-mono font-medium",
                                row.score.type === "green" ? "bg-rx-green-dim text-rx-green" :
                                row.score.type === "blue" ? "bg-rx-blue-dim text-rx-blue" :
                                row.score.type === "amber" ? "bg-rx-amber-dim text-rx-amber" : "bg-rx-red/10 text-rx-red"
                              )}>
                                {row.score.val}
                              </span>
                              <span className="text-[10px] font-body text-rx-text-muted whitespace-nowrap hidden lg:inline">{row.score.label}</span>
                            </div>
                          )}
                        </td>
                        <td className={cn("px-4 py-3 sticky right-[80px] z-10 md:static shadow-[-4px_0_10px_rgba(0,0,0,0.05)] md:shadow-none", isExpanded ? "bg-rx-subtle" : "bg-rx-surface group-hover:bg-rx-overlay/50 transition-colors")}>
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-body whitespace-nowrap",
                            row.isSuccess ? "bg-rx-green-dim text-rx-green" :
                            row.status === "Hard fail" ? "bg-rx-red/10 text-rx-red" :
                            row.status.includes("Scheduled") || row.status.includes("Pending") ? "bg-rx-amber-dim text-rx-amber" : "bg-rx-blue-dim text-rx-blue"
                          )}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] font-body text-rx-text-muted bg-transparent min-w-[140px]">{row.action}</td>
                      </tr>

                      {/* Expanded timeline row */}
                      <tr>
                        <td colSpan={9} className="p-0 border-b border-border bg-rx-subtle relative z-0">
                          <div
                            className="overflow-hidden transition-[max-height,opacity] duration-350 ease-[cubic-bezier(0.4,0,0.2,1)]"
                            style={{
                              maxHeight: isExpanded ? "400px" : "0px",
                              opacity: isExpanded ? 1 : 0
                            }}
                          >
                            {row.id === 2 ? (
                              <div className="p-6 ml-12 max-w-3xl">
                                <h3 className="text-sm font-heading font-semibold text-rx-text-primary mb-6">RECOVERY TIMELINE for {row.email}</h3>
                                <TimelineEntry index={0} expanded={isExpanded} time="Mar 15, 2:14 PM" type="failure" title="Payment failed — Card expired" desc="Razorpay · ₹12,800 · inv_NhGk234" />
                                <TimelineEntry index={1} expanded={isExpanded} time="Mar 15, 2:14 PM" type="info" title="Classified: SOFT_DECLINE (retryable)" desc="Campaign: 7-Day Aggressive triggered" />
                                <TimelineEntry index={2} expanded={isExpanded} time="Mar 15, 2:15 PM" type="outreach" title="Email #1 sent" desc={'Subject: "Payment issue — update card"\nDelivered ✓ · Opened ✓ · Not clicked'} />
                                <TimelineEntry index={3} expanded={isExpanded} time="Mar 16, 10:00 AM" type="failure" title="Retry attempt #1 — Failed again" desc="Same decline: card still expired" />
                                <TimelineEntry index={4} expanded={isExpanded} time="Mar 17, 11:30 AM" type="outreach" title="Email #2 sent" desc={'Subject: "Your subscription is at risk"\nDelivered ✓ · Opened ✓ · Clicked ✓'} />

                                <div
                                  className={cn("flex items-center mt-2 ml-5 transition-all duration-500", isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2")}
                                  style={{ transitionDelay: `${5 * 60}ms` }}
                                >
                                  <div className="w-[85px] text-right font-mono text-[12px] text-rx-amber mr-6 line-through decoration-transparent flex items-center justify-end gap-1.5"><Clock size={12} /></div>
                                  <div className="text-[13px] font-body text-rx-amber font-medium flex items-center gap-1.5"><RefreshCw size={14} /> Next: Retry attempt #2 in 3h 42m</div>
                                </div>

                                <div
                                  className={cn("mt-6 ml-[110px] flex gap-3 transition-all duration-500", isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2")}
                                  style={{ transitionDelay: `${6 * 60}ms` }}
                                >
                                  <button className="px-3 py-1.5 bg-rx-surface border border-border hover:bg-rx-elevated rounded text-xs font-body text-rx-text-primary transition-colors">Manual retry now</button>
                                  <button className="px-3 py-1.5 bg-rx-surface border border-border hover:bg-rx-elevated rounded text-xs font-body text-rx-text-primary transition-colors">Skip to email #3</button>
                                  <button className="px-3 py-1.5 bg-rx-surface border border-border hover:bg-rx-elevated rounded text-xs font-body text-rx-text-primary transition-colors">Mark as resolved</button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-6 ml-12 text-sm text-rx-text-muted font-body">Timeline for this payment will appear here once recovery steps are logged.</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs font-body text-rx-text-muted">
              <div>Showing 1–8 of 143 customers</div>
              <div className="flex items-center gap-1">
                <button className="px-2 py-1 opacity-50 cursor-not-allowed">← Previous</button>
                <div className="px-2 py-1 bg-rx-blue-dim text-rx-blue rounded">1</div>
                <button className="px-2 py-1 hover:bg-rx-elevated rounded transition-colors">2</button>
                <button className="px-2 py-1 hover:bg-rx-elevated rounded transition-colors">3</button>
                <span className="px-2">...</span>
                <button className="px-2 py-1 hover:bg-rx-elevated rounded transition-colors">6</button>
                <button className="px-2 py-1 hover:bg-rx-elevated text-rx-text-primary transition-colors">Next →</button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION E — CHANNEL PERFORMANCE GRID */}
        <section className="pt-6">
          <div className="mb-4">
            <h2 className="text-[16px] font-heading font-semibold text-rx-text-primary">Channel performance breakdown</h2>
            <p className="text-[13px] font-body text-rx-text-muted mt-0.5">How each recovery channel is performing this month</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* WhatsApp */}
            <div className="bg-rx-surface border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="text-[#25D366]"><Zap size={20} /></div>
                  <span className="text-[14px] font-heading font-medium text-rx-text-primary">WhatsApp Business</span>
                </div>
                <span className="px-1.5 py-0.5 text-[10px] bg-rx-green-dim text-rx-green rounded font-body whitespace-nowrap">Best performer</span>
              </div>
              <div className="grid grid-cols-3 gap-2 divide-x divide-border mb-4">
                <div>
                  <div className="text-[22px] font-mono text-rx-text-primary">42%</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">Messages<br/>sent: 143</div>
                </div>
                <div className="pl-3">
                  <div className="text-[22px] font-mono text-rx-text-primary">88%</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">Read rate<br/>of messages</div>
                </div>
                <div className="pl-3">
                  <div className="text-[22px] font-mono text-rx-text-primary">1.2h</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">Avg response<br/>time</div>
                </div>
              </div>
              <div className="h-[60px] w-full mt-2 border-b border-border/50 translate-y-2 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[{ v: 10 }, { v: 15 }, { v: 12 }, { v: 22 }, { v: 18 }, { v: 25 }, { v: 30 }]}>
                    <Line type="monotone" dataKey="v" stroke="#25D366" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="pt-3 font-mono text-[13px] text-rx-green-text mt-2 animate-[money-shimmer_2s_infinite]">
                ₹1,00,800 recovered via WhatsApp
              </div>
            </div>

            {/* Email */}
            <div className="bg-rx-surface border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="text-rx-blue"><Mail size={20} /></div>
                  <span className="text-[14px] font-heading font-medium text-rx-text-primary">Email sequences</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 divide-x divide-border mb-5">
                <div>
                  <div className="text-[22px] font-mono text-rx-text-primary">31%</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">of total<br/>recovered</div>
                </div>
                <div className="pl-3">
                  <div className="text-[22px] font-mono text-rx-text-primary">67%</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">Open rate</div>
                </div>
                <div className="pl-3">
                  <div className="text-[22px] font-mono text-rx-text-primary">4.8h</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">Avg response<br/>time</div>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-[11px] font-body text-rx-text-secondary">
                  <span>Email #1</span>
                  <span className="font-mono">143 sent · 68% open</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-body text-rx-blue">
                  <span>Email #2 <span className="text-rx-text-muted ml-0.5">← best</span></span>
                  <span className="font-mono">98 sent · 71% open</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-body text-rx-text-secondary">
                  <span>Email #3</span>
                  <span className="font-mono">54 sent · 64% open</span>
                </div>
              </div>
              <div className="pt-4 border-t border-border font-mono text-[13px] text-rx-green-text mt-2 animate-[money-shimmer_2s_infinite]">
                ₹74,400 recovered via email
              </div>
            </div>

            {/* Auto-retry */}
            <div className="bg-rx-surface border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="text-[#a855f7]"><RefreshCw size={20} /></div>
                  <span className="text-[14px] font-heading font-medium text-rx-text-primary">Smart retry</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 divide-x divide-border mb-5">
                <div>
                  <div className="text-[22px] font-mono text-rx-text-primary">19%</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">of total<br/>recovered</div>
                </div>
                <div className="pl-3">
                  <div className="text-[22px] font-mono text-rx-text-primary">73%</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">Direct<br/>success</div>
                </div>
                <div className="pl-3">
                  <div className="text-[22px] font-mono text-rx-text-primary">2.1d</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">Avg to<br/>succeed</div>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-[11px] font-body text-rx-text-secondary">
                  <span>Attempt #1</span>
                  <span className="font-mono">271 fired · 41% success</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-body text-rx-text-secondary">
                  <span>Attempt #2</span>
                  <span className="font-mono">159 fired · 28% success</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-body text-rx-text-secondary">
                  <span>Attempt #3</span>
                  <span className="font-mono">94 fired · 22% success</span>
                </div>
              </div>
              <div className="pt-4 border-t border-border font-mono text-[13px] text-rx-green-text mt-2 animate-[money-shimmer_2s_infinite]">
                ₹45,600 recovered via retry
              </div>
            </div>

            {/* Portal */}
            <div className="bg-rx-surface border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="text-rx-amber"><ExternalLink size={20} /></div>
                  <span className="text-[14px] font-heading font-medium text-rx-text-primary">Customer portal</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 divide-x divide-border mb-4">
                <div>
                  <div className="text-[22px] font-mono text-rx-text-primary">8%</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">of total<br/>recovered</div>
                </div>
                <div className="pl-3">
                  <div className="text-[22px] font-mono text-rx-text-primary">44%</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">Portal<br/>visit rate</div>
                </div>
                <div className="pl-3">
                  <div className="text-[22px] font-mono text-rx-text-primary">6.2h</div>
                  <div className="text-[11px] font-body text-rx-text-muted leading-tight mt-1">Avg time<br/>to update</div>
                </div>
              </div>
              <table className="w-full text-left text-[11px] font-body mb-3">
                <thead><tr className="text-rx-text-muted"><th className="pb-1">Source</th><th className="pb-1">Clicks</th><th className="pb-1 text-right">Converted</th></tr></thead>
                <tbody className="text-rx-text-secondary">
                  <tr><td className="py-0.5">Email link</td><td className="font-mono">67</td><td className="font-mono text-right text-rx-amber">41%</td></tr>
                  <tr><td className="py-0.5">WhatsApp link</td><td className="font-mono">38</td><td className="font-mono text-right text-rx-green-text">52% <span className="text-rx-text-muted font-body text-[10px]">← highest</span></td></tr>
                  <tr><td className="py-0.5">SMS link</td><td className="font-mono">19</td><td className="font-mono text-right text-rx-amber">37%</td></tr>
                  <tr><td className="py-0.5">Direct portal</td><td className="font-mono">9</td><td className="font-mono text-right text-rx-text-muted">33%</td></tr>
                </tbody>
              </table>
              <div className="pt-2 border-t border-border font-mono text-[13px] text-rx-green-text animate-[money-shimmer_2s_infinite]">
                ₹19,200 recovered via portal
              </div>
            </div>
          </div>
        </section>

        {/* SECTION F — AI INSIGHTS */}
        <section className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb size={20} className="text-rx-amber" />
            <h2 className="text-[16px] font-heading font-semibold text-rx-text-primary">AI Insights &amp; Top Issues</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-rx-amber-dim border border-rx-amber/20 rounded-xl p-4 flex gap-4">
              <div className="mt-0.5"><AlertTriangle size={18} className="text-rx-amber" /></div>
              <div>
                <h3 className="text-[13px] font-heading font-semibold text-rx-amber">Stripe retry rates dropping</h3>
                <p className="text-[12px] font-body text-rx-text-secondary mt-1">Stripe success rate has fallen by 14% this week. Consider routing high-value failed payments through Razorpay for the next 48h.</p>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-1.5 bg-rx-amber/20 text-rx-amber text-xs font-body rounded hover:bg-rx-amber/30 transition-colors">Apply routing rule</button>
                  <button className="px-3 py-1.5 text-rx-text-muted text-xs font-body hover:text-rx-text-secondary transition-colors">Dismiss</button>
                </div>
              </div>
            </div>
            <div className="bg-rx-blue-dim border border-rx-blue/20 rounded-xl p-4 flex gap-4">
              <div className="mt-0.5"><Lightbulb size={18} className="text-rx-blue" /></div>
              <div>
                <h3 className="text-[13px] font-heading font-semibold text-rx-blue">Optimal send time discovered</h3>
                <p className="text-[12px] font-body text-rx-text-secondary mt-1">Emails sent between 11:30 AM and 1:00 PM IST convert 22% better for B2B SaaS customers.</p>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-1.5 bg-rx-blue/20 text-rx-blue text-xs font-body rounded hover:bg-rx-blue/30 transition-colors">Update schedules</button>
                </div>
              </div>
            </div>
            <div className="bg-rx-surface border border-border rounded-xl p-4 flex gap-4">
              <div className="mt-0.5"><TrendingUp size={18} className="text-rx-green" /></div>
              <div>
                <h3 className="text-[13px] font-heading font-semibold text-rx-text-primary">New recovery record</h3>
                <p className="text-[12px] font-body text-rx-text-secondary mt-1">Yesterday generated ₹1.2L in recovered revenue, the highest single day this quarter.</p>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-1.5 border border-border text-rx-text-secondary text-xs font-body rounded hover:bg-rx-elevated transition-colors">View report</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* SECTION G — STICKY BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 left-[240px] right-0 h-16 bg-rx-surface/80 backdrop-blur-md border-t border-border z-30 hidden md:flex items-center justify-between px-8">
        <div className="flex items-center gap-6 h-full">
          {/* Recovery Health Score */}
          <div className="group relative flex items-center gap-3 pr-6 border-r border-border/50 h-full cursor-help">
            <div className="relative w-8 h-8 rounded-full flex items-center justify-center bg-rx-green-dim/30">
              <svg className="absolute inset-0 w-8 h-8 -rotate-90">
                <circle cx="16" cy="16" r="14" fill="none" stroke="hsl(var(--border-default))" strokeWidth="2" />
                <circle cx="16" cy="16" r="14" fill="none" stroke="hsl(var(--bg-green))" strokeWidth="2" strokeDasharray="88" strokeDashoffset={88 * (1 - 0.92)} className="transition-all duration-1000" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-mono font-bold text-rx-green">92</span>
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-[11px] font-body text-rx-text-muted uppercase tracking-wider">Health</span>
              <span className="text-[13px] font-heading font-medium text-rx-text-primary">Excellent</span>
            </div>
            <div className="absolute bottom-full left-0 mb-4 w-48 bg-rx-elevated border border-border shadow-2xl rounded-lg p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              <h4 className="text-[11px] font-heading font-semibold text-rx-text-muted uppercase tracking-wider mb-2">Health breakdown</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[12px] font-body text-rx-text-secondary"><span>Webhook uptime</span><span className="text-rx-green font-mono">99.9%</span></div>
                <div className="flex justify-between items-center text-[12px] font-body text-rx-text-secondary"><span>Retry success</span><span className="text-rx-green font-mono">82%</span></div>
                <div className="flex justify-between items-center text-[12px] font-body text-rx-text-secondary"><span>Email delivery</span><span className="text-rx-green font-mono">98%</span></div>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-[11px] font-body text-rx-text-muted uppercase tracking-wider">At Risk Tonight</span>
            <span className="text-[15px] font-mono font-bold text-rx-red">₹4,20,000 <span className="text-[12px] text-rx-text-muted font-normal">(42)</span></span>
          </div>

          <div className="h-4 w-[1px] bg-border" />

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full", isPaused ? "bg-rx-amber" : "bg-rx-green")} />
              <span className="text-[11px] font-body text-rx-text-muted uppercase tracking-wider">Engine status</span>
            </div>
            {isPaused ? (
              <span className="text-[15px] font-heading font-bold text-rx-amber">Paused</span>
            ) : isRetrying ? (
              <span className="text-[15px] font-heading font-bold text-rx-blue flex items-center gap-1.5 mt-0.5">
                <RefreshCw size={14} className="animate-spin" /> Retrying now...
              </span>
            ) : (
              <span className="text-[15px] font-heading font-bold text-rx-text-primary mt-0.5">Next retry in {Math.floor(nextRetry / 60)}:{Math.floor(nextRetry % 60).toString().padStart(2, "0")}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={cn("px-4 py-2 border text-[13px] font-body rounded-md transition-colors shadow-sm",
              isPaused
                ? "bg-rx-green border-rx-green text-black hover:bg-rx-green/90 font-medium"
                : "bg-rx-elevated border-border hover:border-rx-text-muted text-rx-text-secondary"
            )}
          >
            {isPaused ? "Resume all recoveries" : "Pause all recovery"}
          </button>

          <button
            onClick={handleSync}
            className="px-4 py-2 bg-rx-blue hover:bg-rx-blue/90 text-white text-[13px] font-body rounded-md transition-colors shadow-[0_0_15px_rgba(59,130,246,0.5)] font-medium flex items-center justify-center gap-2 min-w-[140px]"
          >
            {syncState === "idle" && <><RefreshCw size={14} /> Force sync now</>}
            {syncState === "syncing" && <><RefreshCw size={14} className="animate-spin" /> Syncing...</>}
            {syncState === "synced" && <><CheckCircle2 size={14} /> Synced</>}
          </button>
        </div>
      </div>

      {/* Pause Banner */}
      {isPaused && (
        <div className="fixed top-0 left-[240px] right-0 z-[100] bg-rx-amber/95 backdrop-blur-md border-b border-rx-amber text-black px-4 py-3 flex items-center justify-center gap-3 animate-slide-in-top shadow-md">
          <AlertTriangle size={16} />
          <span className="text-[13px] font-medium font-body">⚠ Recovery engine paused — no retries or emails will be sent.</span>
          <button onClick={() => setIsPaused(false)} className="text-[12px] font-bold underline decoration-black/50 hover:decoration-black ml-2">Resume now</button>
          <button onClick={() => setIsPaused(false)} className="absolute right-4 hover:bg-black/10 p-1 rounded transition-colors"><X size={16} /></button>
        </div>
      )}

      {/* Slide-over Panel for Customer Detail */}
      {selectedCard && (
        <div className="relative z-50">
          <div className="fixed inset-0 bg-rx-base/60 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedCard(null)} />
          <div className="fixed top-0 right-0 h-full w-[400px] bg-rx-surface border-l border-border animate-slide-in-right shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col">
            <div className="p-6 border-b border-border flex justify-between items-start bg-rx-elevated">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-rx-overlay flex items-center justify-center text-lg font-heading font-medium text-rx-text-secondary border border-border/50">
                  {selectedCard.email[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="text-[16px] font-heading font-semibold text-rx-text-primary line-clamp-1">{selectedCard.email}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[14px] font-mono font-medium text-rx-text-primary">{selectedCard.amount}</span>
                    <span className="text-[11px] text-rx-text-muted px-1.5 py-0.5 rounded bg-rx-subtle border border-border font-body flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedCard.gatewayColor}`} />
                      {selectedCard.gateway}
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedCard(null)} className="text-rx-text-muted hover:text-rx-text-primary transition-colors p-1.5 hover:bg-rx-overlay rounded-md"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              <h3 className="text-[12px] font-heading font-semibold text-rx-text-muted uppercase tracking-wider mb-6">RECOVERY TIMELINE</h3>
              <TimelineEntry time="Mar 15, 2:14 PM" type="failure" title={`Payment failed — ${selectedCard.reason || "Insufficient funds"}`} desc={`Gateway: ${selectedCard.gateway}\nAmount: ${selectedCard.amount}`} />
              <TimelineEntry time="Mar 15, 2:14 PM" type="info" title="Classified: SOFT_DECLINE (retryable)" desc="Campaign: 7-Day Aggressive triggered" />
              <TimelineEntry time="Mar 15, 2:15 PM" type="outreach" title="Email #1 sent" desc={'Subject: "Payment issue — update card"\nDelivered ✓ · Opened ✓ · Not clicked'} />
              <TimelineEntry time="Mar 16, 10:00 AM" type="failure" title="Retry attempt #1 — Failed" desc="Same decline reason." />
              <TimelineEntry time="Mar 17, 11:30 AM" type="outreach" title="WhatsApp message sent" desc={"Template: Payment_Failed_v2\nDelivered ✓ · Read ✓"} isLast />

              <div className="flex items-center mt-3 ml-5">
                <div className="w-[85px] text-right font-mono text-[12px] text-rx-amber mr-6 decoration-transparent flex items-center justify-end gap-1.5"><Clock size={12} /></div>
                <div className="text-[12px] font-body text-rx-amber font-medium flex items-center gap-1.5"><RefreshCw size={13} /> Next: Retry attempt #2 tomorrow</div>
              </div>
            </div>

            <div className="p-6 border-t border-border bg-rx-elevated space-y-4">
              <h4 className="text-[11px] font-body text-rx-text-muted uppercase tracking-wider">MANUAL ACTIONS</h4>
              <div className="grid grid-cols-2 gap-2.5">
                <button className="py-2.5 bg-rx-blue hover:bg-rx-blue/90 text-white rounded-md text-[13px] font-medium transition-colors border border-rx-blue/50 shadow-[0_0_10px_rgba(59,130,246,0.2)] flex justify-center items-center gap-1.5">
                  <RefreshCw size={13} /> Retry now
                </button>
                <button className="py-2.5 bg-rx-surface border border-border hover:bg-rx-elevated rounded-md text-[13px] font-body text-rx-text-primary transition-colors flex justify-center items-center gap-1.5">
                  <Mail size={13} /> Send email now
                </button>
                <button className="py-2.5 bg-rx-surface border border-border hover:bg-rx-elevated rounded-md text-[13px] font-body text-rx-text-secondary transition-colors flex justify-center items-center gap-1.5">
                  <SkipForward size={13} /> Skip step
                </button>
                <button className="py-2.5 bg-rx-surface border border-rx-red/30 hover:bg-rx-red-dim rounded-md text-[13px] font-body text-rx-red transition-colors flex justify-center items-center gap-1.5">
                  <X size={13} /> Cancel recovery
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-20 right-6 z-50 flex items-center gap-3 bg-rx-elevated border-l-4 border-rx-amber rounded-lg px-4 py-3 shadow-2xl animate-slide-in-top">
          <AlertTriangle size={16} className="text-rx-amber shrink-0" />
          <div>
            <p className="text-[13px] font-body font-medium text-rx-text-primary">{toast.message}</p>
            <p className="text-[12px] font-body text-rx-text-muted">{toast.email} · {toast.amount}</p>
          </div>
          <button onClick={() => setToast(null)} className="ml-2 text-rx-text-muted hover:text-rx-text-secondary transition-colors"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
