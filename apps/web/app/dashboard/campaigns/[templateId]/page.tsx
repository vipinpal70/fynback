"use client";

/**
 * app/dashboard/campaigns/[templateId]/page.tsx — Campaign template editor
 *
 * Merchant masters: edit steps, edit message content per channel, AI-generate (Scale).
 * System defaults: read-only preview.
 *
 * DATA:
 *   GET  /api/dashboard/campaigns/[templateId]  — full template with steps + messages
 *   POST /api/dashboard/campaigns/[templateId]/steps  — add step
 *   PUT  /api/dashboard/campaigns/[templateId]/steps/[stepId]/messages  — save message
 *   POST /api/dashboard/campaigns/[templateId]/steps/[stepId]/messages/generate  — AI generate
 */

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Sparkles, Save, Loader2, AlertTriangle,
  Mail, MessageSquare, Phone, Trash2, X, Check, Eye, Edit3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from "next/font/google";
import CampaignTimeline, { type TimelineStep } from "@/components/dashboard/CampaignTimeline";

const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700"] });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500"] });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"] });

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = "email" | "whatsapp" | "sms";
type PlanName = "trial" | "starter" | "growth" | "scale";

interface MessageTemplate {
  id: string;
  channel: Channel;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  variables: string[];
  isAiGenerated: boolean;
}

interface CampaignStep {
  id: string;
  stepNumber: number;
  dayOffset: number;
  preferredChannel: Channel;
  isPauseOffer: boolean;
  messages: MessageTemplate[];
}

interface CampaignTemplate {
  id: string;
  name: string;
  type: "system_default" | "merchant_master";
  planRequired: string;
  maxSteps: number;
  isActive: boolean;
  steps: CampaignStep[];
}

interface MerchantPlan {
  plan: PlanName;
  companyName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const channelIcon: Record<Channel, React.ReactNode> = {
  email: <Mail size={14} />,
  whatsapp: <MessageSquare size={14} />,
  sms: <Phone size={14} />,
};

const channelColor: Record<Channel, string> = {
  email: "text-rx-blue bg-rx-blue/10",
  whatsapp: "text-rx-green bg-rx-green/10",
  sms: "text-rx-amber bg-rx-amber/10",
};

// Sample variables for preview substitution
const PREVIEW_VARS: Record<string, string> = {
  customer_name: "Priya",
  amount: "₹2,400",
  merchant_name: "Acme SaaS",
  payment_link: "https://pay.example.com/retry",
  product_name: "Pro Plan",
};

function substituteVars(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => PREVIEW_VARS[k] ?? `{{${k}}}`);
}

// ─── Message editor ───────────────────────────────────────────────────────────

function MessageEditor({
  step,
  channel,
  message,
  templateId,
  plan,
  onSaved,
}: {
  step: CampaignStep;
  channel: Channel;
  message: MessageTemplate | null;
  templateId: string;
  plan: PlanName;
  onSaved: (msg: MessageTemplate) => void;
}) {
  const [subject, setSubject] = useState(message?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(message?.bodyHtml ?? "");
  const [bodyText, setBodyText] = useState(message?.bodyText ?? "");
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const isScale = plan === "scale";
  const charCount = bodyText.length;
  const smsLimit = 160;

  async function handleAiGenerate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(
        `/api/dashboard/campaigns/${templateId}/steps/${step.id}/messages/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            stepNumber: step.stepNumber,
            dayOffset: step.dayOffset,
            isPauseOffer: step.isPauseOffer,
            isFinalStep: false,
            merchantProductDescription: "SaaS subscription service",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.error || "AI generation failed"); return; }
      const g = data.generated;
      if (g.subject) setSubject(g.subject);
      if (g.bodyHtml) setBodyHtml(g.bodyHtml);
      if (g.bodyText) setBodyText(g.bodyText);
    } catch {
      setError("Network error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!bodyText.trim()) { setError("Message body is required"); return; }
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(
        `/api/dashboard/campaigns/${templateId}/steps/${step.id}/messages`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            subject: subject || null,
            bodyHtml: bodyHtml || null,
            bodyText,
            variables: ["customer_name", "amount", "merchant_name", "payment_link"],
            isAiGenerated: false,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Save failed"); return; }
      setSuccessMsg("Saved");
      setTimeout(() => setSuccessMsg(""), 2000);
      onSaved(data.message);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Channel header */}
      <div className="flex items-center justify-between">
        <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md", channelColor[channel])}>
          {channelIcon[channel]}
          {channel.charAt(0).toUpperCase() + channel.slice(1)}
        </div>
        <div className="flex items-center gap-2">
          {isScale && (
            <button
              onClick={handleAiGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-rx-blue/10 text-rx-blue hover:bg-rx-blue/20 transition-colors font-medium disabled:opacity-50"
            >
              {generating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              AI Generate
            </button>
          )}
          {channel === "email" && (
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-rx-overlay text-rx-text-muted hover:text-rx-text-secondary transition-colors"
            >
              <Eye size={11} />
              {previewMode ? "Edit" : "Preview"}
            </button>
          )}
        </div>
      </div>

      {/* Subject (email only) */}
      {channel === "email" && !previewMode && (
        <div>
          <label className={cn("block text-[11px] text-rx-text-muted mb-1", dmSans.className)}>
            Subject line
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Action needed: your payment failed"
            className="w-full px-3 py-2 rounded-lg bg-rx-overlay border border-border text-sm text-rx-text-primary placeholder:text-rx-text-muted focus:outline-none focus:ring-1 focus:ring-rx-blue/40"
          />
        </div>
      )}

      {/* Body */}
      {channel === "email" && previewMode ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-rx-overlay px-3 py-1.5 text-[10px] text-rx-text-muted border-b border-border">
            Preview · <span className={jetbrains.className}>Subject: {substituteVars(subject) || "(no subject)"}</span>
          </div>
          {bodyHtml ? (
            <div
              className="p-4 bg-white text-black text-sm"
              dangerouslySetInnerHTML={{ __html: substituteVars(bodyHtml) }}
            />
          ) : (
            <div className="p-4 text-rx-text-muted text-sm">
              {substituteVars(bodyText) || "No content yet"}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {channel === "email" && (
            <div>
              <label className={cn("block text-[11px] text-rx-text-muted mb-1", dmSans.className)}>
                HTML body (optional)
              </label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={6}
                placeholder="<p>Hi {{customer_name}},</p>"
                className="w-full px-3 py-2 rounded-lg bg-rx-overlay border border-border text-xs text-rx-text-primary placeholder:text-rx-text-muted focus:outline-none focus:ring-1 focus:ring-rx-blue/40 resize-y font-mono"
              />
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={cn("text-[11px] text-rx-text-muted", dmSans.className)}>
                {channel === "email" ? "Plain text fallback" : "Message body"}
              </label>
              {channel === "sms" && (
                <span className={cn("text-[10px]", charCount > smsLimit ? "text-red-400" : "text-rx-text-muted", jetbrains.className)}>
                  {charCount}/{smsLimit}
                </span>
              )}
              {channel === "whatsapp" && (
                <span className={cn("text-[10px] text-rx-text-muted", jetbrains.className)}>
                  {charCount}/1024
                </span>
              )}
            </div>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={channel === "email" ? 4 : 6}
              placeholder={
                channel === "sms"
                  ? "Acme SaaS: Hi {{customer_name}}, your payment of {{amount}} failed..."
                  : channel === "whatsapp"
                  ? "Hi {{customer_name}}, your payment of {{amount}} for {{product_name}} failed..."
                  : "Hi {{customer_name}},\n\nYour payment of {{amount}} failed..."
              }
              className="w-full px-3 py-2 rounded-lg bg-rx-overlay border border-border text-sm text-rx-text-primary placeholder:text-rx-text-muted focus:outline-none focus:ring-1 focus:ring-rx-blue/40 resize-y"
            />
          </div>
        </div>
      )}

      {/* Variable hints */}
      <div className="flex flex-wrap gap-1">
        {["{{customer_name}}", "{{amount}}", "{{payment_link}}", "{{merchant_name}}", "{{product_name}}"].map((v) => (
          <button
            key={v}
            onClick={() => setBodyText((prev) => prev + v)}
            className={cn("text-[10px] px-1.5 py-0.5 rounded bg-rx-overlay text-rx-text-muted hover:text-rx-text-secondary transition-colors", jetbrains.className)}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Error / actions */}
      <div className="flex items-center justify-between">
        <div>
          {error && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertTriangle size={11} /> {error}
            </p>
          )}
          {successMsg && (
            <p className="text-[11px] text-rx-green flex items-center gap-1">
              <Check size={11} /> {successMsg}
            </p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || previewMode}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-rx-blue text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({
  step,
  templateId,
  plan,
  readOnly,
  onMessageSaved,
}: {
  step: CampaignStep;
  templateId: string;
  plan: PlanName;
  readOnly: boolean;
  onMessageSaved: (stepId: string, msg: MessageTemplate) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeChannel, setActiveChannel] = useState<Channel>(step.preferredChannel);

  const msgForChannel = step.messages.find((m) => m.channel === activeChannel) ?? null;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Step header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-rx-overlay/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-rx-blue/10 text-rx-blue text-xs font-bold flex items-center justify-center shrink-0">
            {step.stepNumber}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-semibold text-rx-text-primary", plusJakarta.className)}>
                Day {step.dayOffset}
              </span>
              <div className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium", channelColor[step.preferredChannel])}>
                {channelIcon[step.preferredChannel]}
                {step.preferredChannel}
              </div>
              {step.isPauseOffer && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rx-amber-dim text-rx-amber">
                  Pause offer
                </span>
              )}
            </div>
            <p className={cn("text-[11px] text-rx-text-muted mt-0.5", dmSans.className)}>
              {step.messages.length} message{step.messages.length !== 1 ? "s" : ""} configured
            </p>
          </div>
        </div>
        <div className={cn("text-rx-text-muted transition-transform", expanded ? "rotate-180" : "")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded: channel tabs + message editor */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Channel tabs */}
          <div className="flex items-center gap-1 border-b border-border">
            {(["email", "whatsapp", "sms"] as Channel[]).map((ch) => {
              const hasMsg = step.messages.some((m) => m.channel === ch);
              return (
                <button
                  key={ch}
                  onClick={() => setActiveChannel(ch)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                    activeChannel === ch
                      ? "border-rx-blue text-rx-blue"
                      : "border-transparent text-rx-text-muted hover:text-rx-text-secondary"
                  )}
                >
                  {channelIcon[ch]}
                  {ch.charAt(0).toUpperCase() + ch.slice(1)}
                  {hasMsg && <span className="w-1.5 h-1.5 rounded-full bg-rx-green ml-0.5" />}
                </button>
              );
            })}
          </div>

          {readOnly ? (
            <div className="space-y-3">
              {msgForChannel ? (
                <>
                  {activeChannel === "email" && msgForChannel.subject && (
                    <div>
                      <p className={cn("text-[10px] text-rx-text-muted mb-1", dmSans.className)}>Subject</p>
                      <p className="text-sm text-rx-text-primary">{substituteVars(msgForChannel.subject)}</p>
                    </div>
                  )}
                  <div>
                    <p className={cn("text-[10px] text-rx-text-muted mb-1", dmSans.className)}>Body</p>
                    {activeChannel === "email" && msgForChannel.bodyHtml ? (
                      <div
                        className="rounded-lg border border-border p-3 bg-white text-black text-sm"
                        dangerouslySetInnerHTML={{ __html: substituteVars(msgForChannel.bodyHtml) }}
                      />
                    ) : (
                      <p className={cn("text-sm text-rx-text-secondary whitespace-pre-wrap", dmSans.className)}>
                        {substituteVars(msgForChannel.bodyText ?? "")}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className={cn("text-sm text-rx-text-muted", dmSans.className)}>
                  No {activeChannel} template configured for this step.
                </p>
              )}
            </div>
          ) : (
            <MessageEditor
              step={step}
              channel={activeChannel}
              message={msgForChannel}
              templateId={templateId}
              plan={plan}
              onSaved={(msg) => onMessageSaved(step.id, msg)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add step modal ───────────────────────────────────────────────────────────

function AddStepModal({
  templateId,
  existingSteps,
  onClose,
  onAdded,
}: {
  templateId: string;
  existingSteps: CampaignStep[];
  onClose: () => void;
  onAdded: (step: CampaignStep) => void;
}) {
  const nextStepNum = existingSteps.length + 1;
  const lastDayOffset = existingSteps[existingSteps.length - 1]?.dayOffset ?? 0;

  const [dayOffset, setDayOffset] = useState(lastDayOffset + 2);
  const [channel, setChannel] = useState<Channel>("email");
  const [isPauseOffer, setIsPauseOffer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/campaigns/${templateId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepNumber: nextStepNum,
          dayOffset,
          preferredChannel: channel,
          isPauseOffer,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to add step"); return; }
      onAdded({ ...data.step, messages: [] });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-rx-surface border border-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className={cn("font-bold text-rx-text-primary", plusJakarta.className)}>
            Add step {nextStepNum}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-rx-overlay text-rx-text-muted">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={cn("block text-xs text-rx-text-muted mb-1.5", dmSans.className)}>
              Send on day
            </label>
            <input
              type="number"
              min={0}
              max={30}
              value={dayOffset}
              onChange={(e) => setDayOffset(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-rx-overlay border border-border text-sm text-rx-text-primary focus:outline-none focus:ring-1 focus:ring-rx-blue/40"
            />
          </div>
          <div>
            <label className={cn("block text-xs text-rx-text-muted mb-1.5", dmSans.className)}>
              Preferred channel
            </label>
            <div className="flex gap-2">
              {(["email", "whatsapp", "sms"] as Channel[]).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors",
                    channel === ch
                      ? "bg-rx-blue/10 border-rx-blue text-rx-blue"
                      : "border-border text-rx-text-muted hover:border-rx-text-muted/50"
                  )}
                >
                  {channelIcon[ch]}
                  {ch}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPauseOffer}
              onChange={(e) => setIsPauseOffer(e.target.checked)}
              className="rounded"
            />
            <span className={cn("text-xs text-rx-text-secondary", dmSans.className)}>
              Include pause offer in this step
            </span>
          </label>
          {error && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertTriangle size={11} /> {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className={cn("px-4 py-2 rounded-lg text-sm text-rx-text-muted hover:bg-rx-overlay", dmSans.className)}>
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rx-blue text-sm text-white font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add step
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TemplateEditorPage() {
  const params = useParams<{ templateId: string }>();
  const router = useRouter();
  const templateId = params.templateId;

  const [template, setTemplate] = useState<CampaignTemplate | null>(null);
  const [merchantPlan, setMerchantPlan] = useState<PlanName>("starter");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddStep, setShowAddStep] = useState(false);

  const fetchTemplate = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/campaigns/${templateId}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load template"); return; }
      setTemplate(data.template);
      if (data.merchant?.plan) setMerchantPlan(data.merchant.plan);
    } catch {
      setError("Failed to load template");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { fetchTemplate(); }, [fetchTemplate]);

  function handleMessageSaved(stepId: string, msg: MessageTemplate) {
    setTemplate((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map((s) =>
          s.id === stepId
            ? {
                ...s,
                messages: s.messages.some((m) => m.channel === msg.channel)
                  ? s.messages.map((m) => (m.channel === msg.channel ? msg : m))
                  : [...s.messages, msg],
              }
            : s
        ),
      };
    });
  }

  const isReadOnly = template?.type === "system_default";

  const timelineSteps: TimelineStep[] = (template?.steps ?? []).map((s) => ({
    day: `Day ${s.dayOffset}`,
    channels: [s.preferredChannel],
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-rx-text-muted" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
        <AlertTriangle size={16} /> {error || "Template not found"}
      </div>
    );
  }

  return (
    <div className={cn("space-y-6 max-w-[900px]", dmSans.className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/campaigns")}
            className="p-2 rounded-lg hover:bg-rx-overlay text-rx-text-muted transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={cn("text-xl font-bold text-rx-text-primary", plusJakarta.className)}>
                {template.name}
              </h1>
              {isReadOnly && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rx-overlay text-rx-text-muted">
                  Read-only
                </span>
              )}
              {!isReadOnly && merchantPlan === "scale" && (
                <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-rx-blue/10 text-rx-blue">
                  <Sparkles size={9} /> AI
                </span>
              )}
            </div>
            <p className={cn("text-xs text-rx-text-muted mt-0.5", dmSans.className)}>
              {template.steps.length} step{template.steps.length !== 1 ? "s" : ""}
              {!isReadOnly ? ` · max ${template.maxSteps}` : ""}
            </p>
          </div>
        </div>

        {!isReadOnly && template.steps.length < template.maxSteps && (
          <button
            onClick={() => setShowAddStep(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rx-blue/10 text-rx-blue text-sm font-medium hover:bg-rx-blue/20 transition-colors"
          >
            <Plus size={14} /> Add step
          </button>
        )}
      </div>

      {/* Timeline preview */}
      {timelineSteps.length > 0 && (
        <div className="bg-rx-surface border border-border rounded-xl p-5">
          <p className={cn("text-xs font-medium text-rx-text-muted mb-4", dmSans.className)}>
            Sequence preview
          </p>
          <CampaignTimeline steps={timelineSteps} currentStep={-1} />
        </div>
      )}

      {/* Steps */}
      <div className="space-y-3">
        {template.steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-xl">
            <p className={cn("text-sm text-rx-text-muted mb-3", dmSans.className)}>
              No steps yet. Add your first campaign step.
            </p>
            {!isReadOnly && (
              <button
                onClick={() => setShowAddStep(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rx-blue text-white text-sm font-medium hover:opacity-90"
              >
                <Plus size={13} /> Add step
              </button>
            )}
          </div>
        ) : (
          template.steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              templateId={templateId}
              plan={merchantPlan}
              readOnly={isReadOnly}
              onMessageSaved={handleMessageSaved}
            />
          ))
        )}
      </div>

      {/* Add step modal */}
      {showAddStep && (
        <AddStepModal
          templateId={templateId}
          existingSteps={template.steps}
          onClose={() => setShowAddStep(false)}
          onAdded={(step) => {
            setTemplate((prev) => prev ? { ...prev, steps: [...prev.steps, step] } : prev);
            setShowAddStep(false);
          }}
        />
      )}
    </div>
  );
}
