"use client";

/**
 * app/dashboard/campaigns/page.tsx — Recovery Campaigns dashboard
 *
 * WHY "use client":
 * Interactive campaign cards with create/edit modal, pause/resume actions,
 * AI-generate buttons, and real-time pause-offer badges all require client state.
 *
 * DATA STRATEGY:
 * - Campaign runs: /api/dashboard/campaigns?page=...
 * - Merchant templates: /api/dashboard/campaigns (POST for create)
 * - Payday alerts: /api/dashboard/campaigns/payday-alerts
 * - Pause offer action: /api/dashboard/campaigns/runs/[runId]/pause-offer
 *
 * PROTOTYPE SOURCE: D:\PRSAAS\web_prototype\app\dashboard\campaigns\page.tsx
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Zap, Pause, Play, X, Plus, Bell,
  Loader2, AlertTriangle, Sparkles, Calendar, RefreshCw,
  Settings, Mail, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import CampaignTimeline, { type TimelineStep } from "@/components/dashboard/CampaignTimeline";
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700"] });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500"] });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"] });

// ─── Types ────────────────────────────────────────────────────────────────────

type RunStatus = "active" | "paused" | "recovered" | "cancelled" | "exhausted";
type PauseOfferStatus = "pending" | "approved" | "rejected" | null;
type ChannelType = "email" | "whatsapp" | "sms";
type PlanName = "trial" | "starter" | "growth" | "scale";

interface CampaignStep {
  id: string;
  stepNumber: number;
  dayOffset: number;
  preferredChannel: ChannelType;
  isPauseOffer: boolean;
}

interface TemplateStats {
  totalRuns: number;
  recoveredRuns: number;
  activeRuns: number;
}

interface CampaignTemplate {
  id: string;
  name: string;
  type: "system_default" | "merchant_master";
  planRequired: string;
  maxSteps: number;
  isActive: boolean;
  isPaused: boolean;
  isReadOnly: boolean;
  steps: CampaignStep[];
  stats: TemplateStats;
}

interface CampaignRun {
  id: string;
  status: RunStatus;
  currentStep: number;
  totalSteps: number;
  pauseOfferSent: boolean;
  pauseOfferStatus: PauseOfferStatus;
  completedAt: string | null;
  startedAt: string;
  failedPaymentId: string;
  customerName: string | null;
  customerEmail: string | null;
  amountPaise: number;
  currency: string;
  templateName: string;
  templateSteps: CampaignStep[];
}

interface PaydayAlert {
  campaignRunId: string;
  failedPaymentId: string;
  customerName: string | null;
  customerEmail: string | null;
  amountPaise: number;
  currency: string;
  exhaustedAt: string | null;
}

interface MerchantInfo {
  plan: PlanName;
  companyName: string;
  campaignsPaused: boolean;
  defaultCampaignPreference: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amountPaise: number, currency: string) {
  const amount = amountPaise / 100;
  if (currency === "INR") return `₹${amount.toLocaleString("en-IN")}`;
  return `${currency} ${amount.toFixed(2)}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const statusStyle: Record<RunStatus, string> = {
  active: "bg-rx-blue/10 text-rx-blue",
  paused: "bg-rx-amber-dim text-rx-amber",
  recovered: "bg-rx-green-dim text-rx-green",
  cancelled: "bg-rx-overlay text-rx-text-muted",
  exhausted: "bg-red-500/10 text-red-400",
};

const statusLabel: Record<RunStatus, string> = {
  active: "Active",
  paused: "Paused",
  recovered: "Recovered",
  cancelled: "Cancelled",
  exhausted: "Exhausted",
};

const planLimits: Record<PlanName, { maxTemplates: number; canCreate: boolean }> = {
  trial:   { maxTemplates: 0, canCreate: false },
  starter: { maxTemplates: 0, canCreate: false },
  growth:  { maxTemplates: 1, canCreate: true },
  scale:   { maxTemplates: 5, canCreate: true },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function PauseOfferBadge({
  runId,
  status,
  onAction,
}: {
  runId: string;
  status: PauseOfferStatus;
  onAction: (runId: string, action: "approve" | "reject") => void;
}) {
  if (!status || status !== "pending") return null;
  return (
    <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-rx-amber-dim border border-rx-amber/20">
      <Bell size={13} className="text-rx-amber shrink-0" />
      <span className="text-[11px] font-body text-rx-amber flex-1">Customer requested pause</span>
      <button
        onClick={() => onAction(runId, "approve")}
        className="text-[10px] px-2 py-0.5 rounded bg-rx-green/20 text-rx-green font-semibold hover:bg-rx-green/30 transition-colors"
      >
        Approve
      </button>
      <button
        onClick={() => onAction(runId, "reject")}
        className="text-[10px] px-2 py-0.5 rounded bg-rx-overlay text-rx-text-muted font-semibold hover:bg-rx-overlay/80 transition-colors"
      >
        Reject
      </button>
    </div>
  );
}


function PaydayAlertsBanner({ alerts, onDismiss }: { alerts: PaydayAlert[]; onDismiss: () => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-rx-blue/5 border border-rx-blue/20">
      <Calendar size={16} className="text-rx-blue mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold text-rx-text-primary mb-1", plusJakarta.className)}>
          Payday retry opportunity
        </p>
        <p className={cn("text-[12px] text-rx-text-secondary", dmSans.className)}>
          {alerts.length} exhausted campaign{alerts.length > 1 ? "s" : ""} may convert now —
          consider reaching out to these customers directly.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {alerts.slice(0, 3).map((a) => (
            <span key={a.campaignRunId} className="text-[10px] px-2 py-0.5 rounded-md bg-rx-overlay text-rx-text-secondary font-mono">
              {a.customerEmail || a.customerName || "Customer"} · {formatAmount(a.amountPaise, a.currency)}
            </span>
          ))}
          {alerts.length > 3 && (
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-rx-overlay text-rx-text-muted">
              +{alerts.length - 3} more
            </span>
          )}
        </div>
      </div>
      <button onClick={onDismiss} className="p-1 rounded-md hover:bg-rx-overlay text-rx-text-muted transition-colors shrink-0">
        <X size={13} />
      </button>
    </div>
  );
}

function NewTemplateModal({
  onClose,
  onCreated,
  plan,
}: {
  onClose: () => void;
  onCreated: (template: CampaignTemplate) => void;
  plan: PlanName;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) { setError("Name is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to create"); return; }
      onCreated(data.template);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-rx-surface border border-border rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className={cn("text-base font-bold text-rx-text-primary", plusJakarta.className)}>
            New campaign template
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-rx-overlay text-rx-text-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={cn("block text-xs font-medium text-rx-text-secondary mb-1.5", dmSans.className)}>
              Campaign name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="e.g. Aggressive 7-day sequence"
              className="w-full px-3 py-2 rounded-lg bg-rx-overlay border border-border text-sm text-rx-text-primary placeholder:text-rx-text-muted focus:outline-none focus:ring-1 focus:ring-rx-blue/50"
            />
          </div>

          {plan === "growth" && (
            <p className={cn("text-[11px] text-rx-text-muted", dmSans.className)}>
              Growth plan: 1 custom campaign template, up to 5 steps.
            </p>
          )}
          {plan === "scale" && (
            <p className={cn("text-[11px] text-rx-text-muted", dmSans.className)}>
              Scale plan: up to 5 custom campaign templates, up to 15 steps each. AI generation enabled.
            </p>
          )}

          {error && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertTriangle size={11} /> {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className={cn("px-4 py-2 rounded-lg text-sm text-rx-text-muted hover:bg-rx-overlay transition-colors", dmSans.className)}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rx-blue text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Template Email Panel ─────────────────────────────────────────────────────

interface EmailMsgData {
  subject: string | null;
  bodyText: string | null;
}

interface EmailStepData {
  id: string;
  stepNumber: number;
  dayOffset: number;
  isPauseOffer: boolean;
  messages: { email: EmailMsgData | null; whatsapp: EmailMsgData | null; sms: EmailMsgData | null };
}

function substituteVars(text: string, companyName: string): string {
  const vars: Record<string, string> = {
    customer_name: "Priya",
    amount: "₹2,499",
    merchant_name: companyName || "Your Company",
    payment_link: "https://pay.example.com/retry/abc123",
    product_name: "Premium Plan",
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function TemplateEmailsPanel({ companyName }: { companyName: string }) {
  const [steps, setSteps] = useState<EmailStepData[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const [isOverride, setIsOverride] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState(true);

  useEffect(() => {
    fetch("/api/settings/merchant/email-templates")
      .then((r) => r.json())
      .then((data) => {
        if (data.steps) {
          setSteps(data.steps);
          setIsOverride(data.isOverride ?? false);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEmails(false));
  }, []);

  if (loadingEmails) {
    return (
      <div className="mt-4 pt-4 border-t border-border flex items-center justify-center py-6">
        <Loader2 size={16} className="animate-spin text-rx-text-muted" />
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <p className={cn("text-[11px] text-rx-text-muted text-center py-2", dmSans.className)}>
          No email templates found.
        </p>
      </div>
    );
  }

  const currentStep = steps[activeStep] ?? steps[0];
  const emailMsg = currentStep?.messages?.email;

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className={cn("text-[11px] font-medium text-rx-text-secondary", dmSans.className)}>
          Email messages
          {isOverride ? (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-rx-blue/10 text-rx-blue">Customized</span>
          ) : (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-rx-overlay text-rx-text-muted">System default</span>
          )}
        </span>
        <a
          href="/dashboard/settings"
          className={cn("flex items-center gap-1 text-[10px] text-rx-blue hover:opacity-80 transition-opacity", dmSans.className)}
        >
          {isOverride ? "Edit in Settings" : "Customize in Settings"} <ExternalLink size={9} />
        </a>
      </div>

      {/* Step tabs */}
      <div className="flex flex-wrap gap-1">
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActiveStep(i)}
            className={cn(
              "text-[10px] px-2.5 py-1 rounded-md font-medium transition-colors",
              activeStep === i
                ? "bg-rx-blue text-white"
                : "bg-rx-overlay text-rx-text-muted hover:text-rx-text-secondary"
            )}
          >
            Day {s.dayOffset}
            {s.isPauseOffer && " · ⏸"}
          </button>
        ))}
      </div>

      {/* Email content */}
      {emailMsg ? (
        <div className="rounded-lg bg-rx-bg border border-border overflow-hidden">
          {/* Subject */}
          <div className="px-3 py-2 border-b border-border bg-rx-overlay">
            <span className={cn("text-[10px] text-rx-text-muted", dmSans.className)}>Subject: </span>
            <span className={cn("text-[11px] text-rx-text-primary font-medium", dmSans.className)}>
              {substituteVars(emailMsg.subject ?? "", companyName)}
            </span>
          </div>
          {/* Body */}
          <div className={cn(
            "px-3 py-3 text-[11px] text-rx-text-secondary whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto",
            dmSans.className
          )}>
            {substituteVars(emailMsg.bodyText ?? "", companyName)}
          </div>
        </div>
      ) : (
        <p className={cn("text-[11px] text-rx-text-muted py-1", dmSans.className)}>
          No email message for this step.
        </p>
      )}
    </div>
  );
}

// ─── Active Strategy Card ─────────────────────────────────────────────────────

function ActiveStrategyCard({
  template,
  isEffectivelyActive,
  campaignsPaused,
  plan,
  companyName,
  onTogglePause,
  onToggleTemplatePause,
  actionLoading,
}: {
  template: CampaignTemplate;
  isEffectivelyActive: boolean;
  campaignsPaused: boolean;
  plan: PlanName;
  companyName: string;
  onTogglePause: () => void;
  onToggleTemplatePause: (templateId: string, isPaused: boolean) => void;
  actionLoading: boolean;
}) {
  const [showEmails, setShowEmails] = useState(false);
  const isSystemDefault = template.type === "system_default";
  const canControl = plan === "growth" || plan === "scale";

  const timelineSteps: TimelineStep[] = template.steps.map((s) => ({
    day: `Day ${s.dayOffset}`,
    channels: [s.preferredChannel],
  }));

  const recoveryRate = template.stats.totalRuns > 0
    ? Math.round((template.stats.recoveredRuns / template.stats.totalRuns) * 100)
    : null;

  let badgeText: string;
  let badgeClass: string;
  if (campaignsPaused) {
    badgeText = "Paused";
    badgeClass = "bg-rx-amber-dim text-rx-amber";
  } else if (isEffectivelyActive) {
    badgeText = "Active";
    badgeClass = "bg-rx-green-dim text-rx-green";
  } else {
    badgeText = "Fallback";
    badgeClass = "bg-rx-overlay text-rx-text-muted";
  }

  return (
    <div className={cn(
      "bg-rx-surface border rounded-2xl p-5 transition-all",
      isEffectivelyActive && !campaignsPaused ? "border-rx-green/30" : "border-border"
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className={cn("font-semibold text-sm text-rx-text-primary", plusJakarta.className)}>
              {template.name}
            </h3>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-medium", badgeClass)}>
              {badgeText}
            </span>
            {isSystemDefault && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rx-overlay text-rx-text-muted">
                System default
              </span>
            )}
          </div>
          <p className={cn("text-[11px] text-rx-text-muted", dmSans.className)}>
            {template.steps.length} steps
            {template.steps.some((s) => s.isPauseOffer) && " · includes pause offer"}
          </p>
        </div>

        {/* Control buttons — Growth/Scale only */}
        {canControl && (
          <div className="flex items-center gap-1.5 ml-3 shrink-0">
            {/* For merchant master templates: toggle the template itself */}
            {!isSystemDefault && (
              <button
                disabled={actionLoading}
                onClick={() => onToggleTemplatePause(template.id, !template.isPaused)}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg font-medium transition-colors",
                  template.isPaused
                    ? "bg-rx-green/10 text-rx-green hover:bg-rx-green/20"
                    : "bg-rx-overlay text-rx-text-secondary hover:bg-rx-overlay/80"
                )}
              >
                {actionLoading ? <Loader2 size={11} className="animate-spin" /> : template.isPaused ? <Play size={11} /> : <Pause size={11} />}
                {template.isPaused ? "Activate" : "Pause"}
              </button>
            )}
            {/* Global pause toggle (system default card) */}
            {isSystemDefault && (
              <button
                disabled={actionLoading}
                onClick={onTogglePause}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg font-medium transition-colors",
                  campaignsPaused
                    ? "bg-rx-green/10 text-rx-green hover:bg-rx-green/20"
                    : "bg-rx-overlay text-rx-text-secondary hover:bg-rx-overlay/80"
                )}
              >
                {actionLoading ? <Loader2 size={11} className="animate-spin" /> : campaignsPaused ? <Play size={11} /> : <Pause size={11} />}
                {campaignsPaused ? "Resume campaigns" : "Pause campaigns"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Timeline */}
      {timelineSteps.length > 0 && (
        <div className="mb-4 px-1">
          <CampaignTimeline steps={timelineSteps} currentStep={-1} />
        </div>
      )}

      {/* Stats row */}
      {template.stats.totalRuns > 0 ? (
        <div className="flex items-center gap-4 text-[11px] pt-3 border-t border-border">
          <span className={cn("text-rx-text-muted", dmSans.className)}>
            <span className={cn("font-semibold text-rx-text-secondary", jetbrains.className)}>
              {template.stats.totalRuns}
            </span> total runs
          </span>
          <span className="text-rx-text-muted">·</span>
          <span className={cn("text-rx-text-muted", dmSans.className)}>
            <span className={cn("font-semibold text-rx-green-text", jetbrains.className)}>
              {template.stats.recoveredRuns}
            </span> recovered
          </span>
          {recoveryRate !== null && (
            <>
              <span className="text-rx-text-muted">·</span>
              <span className={cn("font-semibold text-rx-green-text", jetbrains.className)}>
                {recoveryRate}% rate
              </span>
            </>
          )}
          {template.stats.activeRuns > 0 && (
            <>
              <span className="text-rx-text-muted">·</span>
              <span className={cn("text-rx-text-muted", dmSans.className)}>
                <span className={cn("font-semibold text-rx-blue", jetbrains.className)}>
                  {template.stats.activeRuns}
                </span> in progress
              </span>
            </>
          )}
          {/* Spacer + email toggle */}
          <span className="flex-1" />
          <button
            onClick={() => setShowEmails((v) => !v)}
            className={cn(
              "flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-medium transition-colors",
              showEmails
                ? "bg-rx-blue/10 text-rx-blue"
                : "bg-rx-overlay text-rx-text-muted hover:text-rx-text-secondary"
            )}
          >
            <Mail size={10} />
            {showEmails ? "Hide emails" : "View emails"}
            {showEmails ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <p className={cn("text-[11px] text-rx-text-muted", dmSans.className)}>
            No runs yet — campaigns start automatically on new payment failures.
          </p>
          <button
            onClick={() => setShowEmails((v) => !v)}
            className={cn(
              "flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-medium transition-colors shrink-0",
              showEmails
                ? "bg-rx-blue/10 text-rx-blue"
                : "bg-rx-overlay text-rx-text-muted hover:text-rx-text-secondary"
            )}
          >
            <Mail size={10} />
            {showEmails ? "Hide emails" : "View emails"}
            {showEmails ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
        </div>
      )}

      {/* Email panel */}
      {showEmails && <TemplateEmailsPanel companyName={companyName} />}
    </div>
  );
}

// ─── Compact run row ──────────────────────────────────────────────────────────

function RunRow({
  run,
  onPauseOffer,
  actionLoading,
}: {
  run: CampaignRun;
  onPauseOffer: (runId: string, action: "approve" | "reject") => void;
  actionLoading: string | null;
}) {
  const customerDisplay = run.customerName || run.customerEmail || "Unknown customer";
  const amount = formatAmount(run.amountPaise, run.currency);

  return (
    <div className={cn(
      "flex items-center justify-between py-3 px-4 rounded-xl bg-rx-surface border border-border",
      actionLoading === run.id ? "opacity-60" : ""
    )}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn("text-sm font-medium text-rx-text-primary truncate", plusJakarta.className)}>
            {customerDisplay}
          </span>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md shrink-0", statusStyle[run.status])}>
            {statusLabel[run.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={cn("font-semibold text-rx-green-text", jetbrains.className)}>{amount}</span>
          <span className="text-rx-text-muted">·</span>
          <span className={cn("text-rx-text-muted", dmSans.className)}>
            Step {run.currentStep}/{run.totalSteps}
          </span>
          <span className="text-rx-text-muted">·</span>
          <span className={cn("text-rx-text-muted", dmSans.className)}>{timeAgo(run.startedAt)}</span>
        </div>
      </div>
      {/* Pause offer inline */}
      {run.pauseOfferSent && run.pauseOfferStatus === "pending" && (
        <div className="flex items-center gap-1.5 ml-3 shrink-0">
          <span className="text-[10px] text-rx-amber flex items-center gap-1">
            <Bell size={10} /> Pause req.
          </span>
          <button
            onClick={() => onPauseOffer(run.id, "approve")}
            className="text-[10px] px-2 py-0.5 rounded bg-rx-green/20 text-rx-green font-semibold hover:bg-rx-green/30 transition-colors"
          >
            ✓
          </button>
          <button
            onClick={() => onPauseOffer(run.id, "reject")}
            className="text-[10px] px-2 py-0.5 rounded bg-rx-overlay text-rx-text-muted font-semibold hover:bg-rx-overlay/80 transition-colors"
          >
            ✗
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Campaign Runs tab ────────────────────────────────────────────────────────

const campaignPreferenceLabel: Record<string, string> = {
  aggressive_7d: "Aggressive 7-day",
  standard_10d: "Standard 10-day",
  gentle_14d: "Gentle 14-day",
};

function CampaignRunsTab({
  templates,
  runs,
  merchant,
  plan,
  onNew,
  onTogglePause,
  onToggleTemplatePause,
  onPauseOffer,
  actionLoading,
  strategyLoading,
}: {
  templates: CampaignTemplate[];
  runs: CampaignRun[];
  merchant: MerchantInfo | null;
  plan: PlanName;
  onNew: () => void;
  onTogglePause: () => void;
  onToggleTemplatePause: (templateId: string, isPaused: boolean) => void;
  onPauseOffer: (runId: string, action: "approve" | "reject") => void;
  actionLoading: string | null;
  strategyLoading: boolean;
}) {
  const campaignsPaused = merchant?.campaignsPaused ?? false;
  const canControl = plan === "growth" || plan === "scale";

  // System default for the merchant's plan (first match)
  const systemDefault = templates.find((t) => t.type === "system_default" && t.planRequired === plan)
    ?? templates.find((t) => t.type === "system_default");

  // Merchant master templates
  const merchantMasters = templates.filter((t) => t.type === "merchant_master");

  // The "effectively active" template is the first non-paused merchant master, or system default
  const activeMerchantMaster = merchantMasters.find((t) => !t.isPaused && t.isActive);
  const effectiveActiveId = activeMerchantMaster?.id ?? systemDefault?.id;

  return (
    <div className="space-y-6">
      {/* ── Strategy section ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className={cn("text-sm font-semibold text-rx-text-secondary", plusJakarta.className)}>
              Active Campaign Strategy
            </h2>
            {merchant?.defaultCampaignPreference && (
              <p className={cn("text-[11px] text-rx-text-muted mt-0.5", dmSans.className)}>
                Onboarding preference:{" "}
                <span className="text-rx-text-secondary font-medium">
                  {campaignPreferenceLabel[merchant.defaultCampaignPreference] ?? merchant.defaultCampaignPreference}
                </span>
                {!canControl && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-rx-overlay text-rx-text-muted">
                    Custom cadences on Growth+
                  </span>
                )}
              </p>
            )}
          </div>
          {canControl && merchantMasters.length === 0 && (
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-rx-blue/10 text-rx-blue hover:bg-rx-blue/20 transition-colors font-medium"
            >
              <Zap size={12} /> Use custom campaign
            </button>
          )}
        </div>

        <div className="space-y-3">
          {/* Merchant master(s) — shown first if they exist */}
          {merchantMasters.map((t) => (
            <ActiveStrategyCard
              key={t.id}
              template={t}
              isEffectivelyActive={t.id === effectiveActiveId}
              campaignsPaused={campaignsPaused}
              plan={plan}
              companyName={merchant?.companyName ?? ""}
              onTogglePause={onTogglePause}
              onToggleTemplatePause={onToggleTemplatePause}
              actionLoading={strategyLoading}
            />
          ))}

          {/* System default — always shown */}
          {systemDefault && (
            <ActiveStrategyCard
              key={systemDefault.id}
              template={systemDefault}
              isEffectivelyActive={systemDefault.id === effectiveActiveId}
              campaignsPaused={campaignsPaused}
              plan={plan}
              companyName={merchant?.companyName ?? ""}
              onTogglePause={onTogglePause}
              onToggleTemplatePause={onToggleTemplatePause}
              actionLoading={strategyLoading}
            />
          )}

          {/* No templates at all */}
          {!systemDefault && merchantMasters.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className={cn("text-sm text-rx-text-muted", dmSans.className)}>
                System default templates are loading. Refresh in a moment.
              </p>
            </div>
          )}
        </div>

        {/* Upgrade prompt for trial/starter */}
        {!canControl && (
          <p className={cn("text-[11px] text-rx-text-muted mt-3", dmSans.className)}>
            Upgrade to Growth or Scale to create custom campaigns or pause recovery sequences.
          </p>
        )}
      </div>

      {/* ── Recent runs section ── */}
      <div>
        <h2 className={cn("text-sm font-semibold text-rx-text-secondary mb-3", plusJakarta.className)}>
          Recent Campaign Runs
          {runs.length > 0 && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-rx-overlay text-rx-text-muted font-normal">
              {runs.length}
            </span>
          )}
        </h2>

        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className={cn("text-sm text-rx-text-muted", dmSans.className)}>
              No campaign runs yet. Runs start automatically when a new payment failure is received.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                onPauseOffer={onPauseOffer}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [runs, setRuns] = useState<CampaignRun[]>([]);
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [paydayAlerts, setPaydayAlerts] = useState<PaydayAlert[]>([]);
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [showPaydayBanner, setShowPaydayBanner] = useState(true);
  const [activeTab, setActiveTab] = useState<"runs" | "templates">("runs");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [runsRes, paydayRes] = await Promise.all([
        fetch("/api/dashboard/campaigns"),
        fetch("/api/dashboard/campaigns/payday-alerts"),
      ]);

      if (runsRes.ok) {
        const data = await runsRes.json();
        setRuns(data.runs || []);
        setTemplates(data.templates || []);
        setMerchant(data.merchant || null);
      }
      if (paydayRes.ok) {
        const data = await paydayRes.json();
        setPaydayAlerts(data.alerts || []);
      }
    } catch {
      setError("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleToggleCampaignsPaused() {
    if (!merchant) return;
    // Capture the intended value BEFORE any async work or state updates.
    // Using !m.campaignsPaused inside the setMerchant callback is unreliable:
    // setStrategyLoading(true) triggers a re-render mid-flight which can cause
    // the callback to see a stale value and toggle to the wrong state.
    const next = !merchant.campaignsPaused;
    setStrategyLoading(true);
    try {
      const res = await fetch("/api/dashboard/campaigns/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignsPaused: next }),
      });
      if (res.ok) {
        setMerchant((m) => m ? { ...m, campaignsPaused: next } : m);
      }
    } finally {
      setStrategyLoading(false);
    }
  }

  async function handleToggleTemplatePause(templateId: string, isPaused: boolean) {
    setStrategyLoading(true);
    try {
      const res = await fetch(`/api/dashboard/campaigns/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaused }),
      });
      if (res.ok) {
        setTemplates((prev) => prev.map((t) =>
          t.id === templateId ? { ...t, isPaused } : t
        ));
      }
    } finally {
      setStrategyLoading(false);
    }
  }

  async function handlePauseOffer(runId: string, action: "approve" | "reject") {
    setActionLoading(runId);
    try {
      const res = await fetch(`/api/dashboard/campaigns/runs/${runId}/pause-offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) await fetchData();
    } finally {
      setActionLoading(null);
    }
  }

  const plan = (merchant?.plan ?? "starter") as PlanName;
  const canCreateTemplate = planLimits[plan]?.canCreate;
  const pendingPauseOffers = runs.filter(
    (r) => r.pauseOfferSent && r.pauseOfferStatus === "pending"
  );

  return (
    <div className={cn("space-y-6 max-w-[1400px]", dmSans.className)}>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn("text-2xl font-bold text-rx-text-primary", plusJakarta.className)}>
            Recovery Campaigns
          </h1>
          {pendingPauseOffers.length > 0 && (
            <p className="text-xs text-rx-amber mt-0.5 flex items-center gap-1">
              <Bell size={11} />
              {pendingPauseOffers.length} pause offer{pendingPauseOffers.length > 1 ? "s" : ""} awaiting your approval
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2 rounded-lg hover:bg-rx-overlay text-rx-text-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
          {canCreateTemplate && (
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rx-blue text-sm font-semibold text-white btn-glow hover:opacity-90 transition-opacity"
            >
              <Zap size={15} /> New campaign
            </button>
          )}
        </div>
      </div>

      {/* Payday alerts banner */}
      {showPaydayBanner && paydayAlerts.length > 0 && (
        <PaydayAlertsBanner alerts={paydayAlerts} onDismiss={() => setShowPaydayBanner(false)} />
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["runs", "templates"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-rx-blue text-rx-blue"
                : "border-transparent text-rx-text-muted hover:text-rx-text-secondary"
            )}
          >
            {tab === "runs" ? "Campaign Runs" : "Templates"}
            {tab === "runs" && runs.length > 0 && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-rx-overlay text-rx-text-muted">
                {runs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-rx-text-muted" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Campaign runs tab */}
      {!loading && !error && activeTab === "runs" && (
        <CampaignRunsTab
          templates={templates}
          runs={runs}
          merchant={merchant}
          plan={plan}
          onNew={() => setShowNewModal(true)}
          onTogglePause={handleToggleCampaignsPaused}
          onToggleTemplatePause={handleToggleTemplatePause}
          onPauseOffer={handlePauseOffer}
          actionLoading={actionLoading}
          strategyLoading={strategyLoading}
        />
      )}

      {/* Templates tab */}
      {!loading && !error && activeTab === "templates" && (
        <TemplatesTab
          templates={templates}
          plan={plan}
          onNew={() => setShowNewModal(true)}
        />
      )}

      {/* New template modal */}
      {showNewModal && (
        <NewTemplateModal
          plan={plan}
          onClose={() => setShowNewModal(false)}
          onCreated={(t) => {
            setTemplates((prev) => [...prev, t as unknown as CampaignTemplate]);
            setShowNewModal(false);
            setActiveTab("templates");
          }}
        />
      )}
    </div>
  );
}

// ─── Templates tab ────────────────────────────────────────────────────────────

function TemplatesTab({
  templates,
  plan,
  onNew,
}: {
  templates: CampaignTemplate[];
  plan: PlanName;
  onNew: () => void;
}) {
  const merchantTemplates = templates.filter((t) => t.type === "merchant_master");
  const systemTemplates = templates.filter((t) => t.type === "system_default");

  return (
    <div className="space-y-6">
      {/* Merchant templates */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className={cn("text-sm font-semibold text-rx-text-primary", plusJakarta.className)}>
            Custom Templates
          </h2>
          {planLimits[plan]?.canCreate && merchantTemplates.length < planLimits[plan].maxTemplates && (
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-rx-blue/10 text-rx-blue hover:bg-rx-blue/20 transition-colors font-medium"
            >
              <Plus size={12} /> New template
            </button>
          )}
        </div>

        {merchantTemplates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className={cn("text-sm text-rx-text-muted mb-3", dmSans.className)}>
              {planLimits[plan]?.canCreate
                ? "No custom templates yet. Create one to override the system defaults."
                : "Upgrade to Growth or Scale to create custom campaign templates."}
            </p>
            {planLimits[plan]?.canCreate && (
              <button
                onClick={onNew}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rx-blue text-sm font-semibold text-white hover:opacity-90 transition-opacity mx-auto"
              >
                <Plus size={14} /> New template
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {merchantTemplates.map((t) => (
              <TemplateCard key={t.id} template={t} plan={plan} />
            ))}
          </div>
        )}
      </div>

      {/* System templates */}
      {systemTemplates.length > 0 && (
        <div>
          <h2 className={cn("text-sm font-semibold text-rx-text-primary mb-3", plusJakarta.className)}>
            System Defaults
          </h2>
          <div className="space-y-3">
            {systemTemplates.map((t) => (
              <TemplateCard key={t.id} template={t} plan={plan} readOnly />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  plan,
  readOnly = false,
}: {
  template: CampaignTemplate;
  plan: PlanName;
  readOnly?: boolean;
}) {
  const timelineSteps: TimelineStep[] = template.steps
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((s) => ({
      day: `Day ${s.dayOffset}`,
      channels: [s.preferredChannel],
    }));

  const channelCounts = template.steps.reduce(
    (acc, s) => { acc[s.preferredChannel] = (acc[s.preferredChannel] || 0) + 1; return acc; },
    {} as Record<ChannelType, number>
  );

  return (
    <div className="bg-rx-surface border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className={cn("font-semibold text-sm text-rx-text-primary", plusJakarta.className)}>
              {template.name}
            </h3>
            {readOnly && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rx-overlay text-rx-text-muted">
                System default
              </span>
            )}
            {!readOnly && plan === "scale" && (
              <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-rx-blue/10 text-rx-blue">
                <Sparkles size={9} /> AI
              </span>
            )}
          </div>
          <p className={cn("text-[11px] text-rx-text-muted mt-0.5", dmSans.className)}>
            {template.steps.length} step{template.steps.length !== 1 ? "s" : ""}
            {channelCounts.email ? ` · ${channelCounts.email} email` : ""}
            {channelCounts.whatsapp ? ` · ${channelCounts.whatsapp} WhatsApp` : ""}
            {channelCounts.sms ? ` · ${channelCounts.sms} SMS` : ""}
          </p>
        </div>
        {!readOnly && (
          <a
            href={`/dashboard/campaigns/${template.id}`}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-rx-overlay text-rx-text-secondary hover:text-rx-text-primary transition-colors font-medium"
          >
            <Settings size={12} /> Edit
          </a>
        )}
      </div>

      {timelineSteps.length > 0 && (
        <div className="px-1">
          <CampaignTimeline steps={timelineSteps} currentStep={-1} />
        </div>
      )}
    </div>
  );
}
