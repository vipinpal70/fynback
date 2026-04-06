"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  ExternalLink, Unplug, RefreshCw, ChevronDown, ChevronUp,
  Copy, Check, AlertCircle, Loader2, Zap, TestTube2, Eye, EyeOff,
  Webhook, ShieldCheck, CheckCircle2,
} from "lucide-react";
import type { GatewayStatus } from "@/lib/cache/dashboard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectResult {
  connectionId: string;
  gatewayName: string;
  testMode: boolean;
  webhookUrl: string;
  webhookSecret: string;
  sync: { fetched: number; inserted: number; skipped: number } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GATEWAY_META: Record<string, { color: string; label: string; docsUrl: string; webhookSettingsUrl: string; events: string[] }> = {
  razorpay: {
    color: "hsl(var(--razorpay))",
    label: "Razorpay",
    docsUrl: "https://razorpay.com/docs/webhooks/",
    webhookSettingsUrl: "https://dashboard.razorpay.com/app/webhooks",
    events: [
      "payment.failed",
      "subscription.paused",
      "subscription.halted",
      "subscription.cancelled",
      "payment_link.partially_paid",
      "payment_link.expired",
      "payment_link.cancelled",
    ],
  },
  stripe: {
    color: "hsl(var(--stripe))",
    label: "Stripe",
    docsUrl: "https://stripe.com/docs/webhooks",
    webhookSettingsUrl: "https://dashboard.stripe.com/webhooks",
    events: ["payment_intent.payment_failed", "invoice.payment_failed"],
  },
  cashfree: {
    color: "hsl(var(--cashfree))",
    label: "Cashfree",
    docsUrl: "https://docs.cashfree.com/docs/webhooks",
    webhookSettingsUrl: "https://merchant.cashfree.com/merchants/pg/developers/webhook",
    events: ["PAYMENT_FAILED"],
  },
  payu: {
    color: "hsl(var(--payu))",
    label: "PayU",
    docsUrl: "https://devguide.payu.in/",
    webhookSettingsUrl: "https://onboarding.payu.in/app/account/merchant-settings",
    events: ["PAYMENT_FAILED"],
  },
};

const ALL_GATEWAYS = Object.keys(GATEWAY_META);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffM = Math.floor(diffMs / 60000);
  if (diffM < 1) return "just now";
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function useCopyToClipboard() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);
  return { copied, copy };
}

// ─── Webhook Instructions Panel ───────────────────────────────────────────────

function WebhookInstructions({
  gateway,
  connectionId,
  webhookUrl,
  initialSecret,
  onDone,
}: {
  gateway: string;
  connectionId: string;
  webhookUrl: string;
  initialSecret?: string;  // set only right after connecting
  onDone?: () => void;
}) {
  const meta = GATEWAY_META[gateway];
  const { copied, copy } = useCopyToClipboard();
  const [step, setStep] = useState(1);
  const [secret, setSecret] = useState<string | null>(initialSecret ?? null);
  const [secretLoading, setSecretLoading] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  async function fetchSecret() {
    setSecretLoading(true);
    setSecretError(null);
    try {
      const r = await fetch(`/api/gateways/${connectionId}/webhook-secret`);
      const data = await r.json();
      if (r.ok) setSecret(data.webhookSecret);
      else setSecretError(data.error ?? 'Failed to load secret');
    } catch {
      setSecretError('Network error');
    } finally {
      setSecretLoading(false);
    }
  }

  async function rotateSecret() {
    setRotating(true);
    setSecretError(null);
    try {
      const r = await fetch(`/api/gateways/${connectionId}/webhook-secret`, { method: 'POST' });
      const data = await r.json();
      if (r.ok) setSecret(data.webhookSecret);
      else setSecretError(data.error ?? 'Failed to rotate secret');
    } catch {
      setSecretError('Network error');
    } finally {
      setRotating(false);
    }
  }

  const steps = [
    {
      label: "Open webhook settings",
      content: (
        <div className="space-y-3">
          <p className="text-[13px] font-body text-rx-text-secondary">
            Go to your {meta.label} dashboard and open the webhooks section.
          </p>
          <a
            href={meta.webhookSettingsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-rx-blue text-white text-[13px] font-heading font-semibold hover:opacity-90 transition-opacity"
          >
            <ExternalLink size={13} /> Open {meta.label} Webhooks
          </a>
        </div>
      ),
    },
    {
      label: "Add webhook URL",
      content: (
        <div className="space-y-3">
          <p className="text-[13px] font-body text-rx-text-secondary">
            Create a new webhook and paste this URL:
          </p>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-rx-overlay border border-border">
            <code className="flex-1 font-mono text-[12px] text-rx-text-primary break-all">{webhookUrl}</code>
            <button
              onClick={() => copy(webhookUrl, "url")}
              className="shrink-0 p-1.5 rounded-md hover:bg-rx-elevated transition-colors text-rx-text-muted hover:text-rx-blue"
            >
              {copied === "url" ? <Check size={14} className="text-rx-green" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      ),
    },
    {
      label: "Set webhook secret",
      content: (
        <div className="space-y-3">
          <p className="text-[13px] font-body text-rx-text-secondary">
            Paste this secret into the <strong>Webhook Secret</strong> field in {meta.label}.
          </p>

          {secret ? (
            <>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-rx-overlay border border-border">
                <code className="flex-1 font-mono text-[12px] text-rx-text-primary break-all">{secret}</code>
                <button
                  onClick={() => copy(secret, "secret")}
                  className="shrink-0 p-1.5 rounded-md hover:bg-rx-elevated transition-colors text-rx-text-muted hover:text-rx-blue"
                >
                  {copied === "secret" ? <Check size={14} className="text-rx-green" /> : <Copy size={14} />}
                </button>
              </div>
              <button
                onClick={rotateSecret}
                disabled={rotating}
                className="text-[12px] font-body text-rx-text-muted hover:text-rx-amber transition-colors flex items-center gap-1"
              >
                <RefreshCw size={11} className={rotating ? "animate-spin" : ""} />
                {rotating ? "Generating…" : "Generate new secret"}
              </button>
              {rotating && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rx-amber-dim border border-rx-amber/20">
                  <AlertCircle size={14} className="text-rx-amber shrink-0 mt-0.5" />
                  <p className="text-[12px] font-body text-rx-amber">
                    Update the secret in your {meta.label} webhook settings after rotating.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              {secretError && (
                <p className="text-[12px] font-body text-rx-red">{secretError}</p>
              )}
              <button
                onClick={fetchSecret}
                disabled={secretLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rx-overlay border border-border text-[13px] font-body text-rx-text-secondary hover:border-rx-blue hover:text-rx-blue transition-colors"
              >
                {secretLoading ? (
                  <><Loader2 size={13} className="animate-spin" /> Loading…</>
                ) : (
                  <><Eye size={13} /> Reveal webhook secret</>
                )}
              </button>
            </div>
          )}
        </div>
      ),
    },
    {
      label: "Select events",
      content: (
        <div className="space-y-3">
          <p className="text-[13px] font-body text-rx-text-secondary">
            Enable these webhook events in {meta.label}:
          </p>
          <div className="space-y-1.5">
            {meta.events.map((ev) => (
              <div key={ev} className="flex items-center gap-2 p-2.5 rounded-lg bg-rx-overlay border border-border">
                <CheckCircle2 size={14} className="text-rx-green" />
                <code className="font-mono text-[12px] text-rx-text-primary">{ev}</code>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      label: "Save & done",
      content: (
        <div className="space-y-3">
          <p className="text-[13px] font-body text-rx-text-secondary">
            Save the webhook in {meta.label}. FynBack will now receive live payment failure events and start recovery automatically.
          </p>
          {onDone && (
            <button
              onClick={onDone}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rx-green text-white text-[13px] font-heading font-semibold hover:opacity-90 transition-opacity"
            >
              <ShieldCheck size={14} /> Done — Go to Dashboard
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center gap-2 mb-4">
        <Webhook size={14} className="text-rx-blue" />
        <span className="text-[13px] font-heading font-semibold text-rx-text-primary">
          Connect webhook for live updates
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-md bg-rx-amber-dim text-rx-amber font-body">Required for real-time recovery</span>
      </div>
      <div className="flex gap-4">
        {/* Step indicator */}
        <div className="flex flex-col items-center gap-1">
          {steps.map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              <button
                onClick={() => setStep(i + 1)}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-heading font-bold transition-colors",
                  i + 1 < step ? "bg-rx-green text-white" :
                  i + 1 === step ? "bg-rx-blue text-white" :
                  "bg-rx-overlay text-rx-text-muted"
                )}
              >
                {i + 1 < step ? <Check size={11} /> : i + 1}
              </button>
              {i < steps.length - 1 && (
                <div className={cn("w-0.5 h-5 rounded", step > i + 1 ? "bg-rx-green" : "bg-rx-overlay")} />
              )}
            </div>
          ))}
        </div>
        {/* Step content */}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-body text-rx-text-muted mb-2">
            Step {step} of {steps.length}: <span className="text-rx-text-secondary">{steps[step - 1].label}</span>
          </p>
          <div className="mb-4">{steps[step - 1].content}</div>
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-body text-rx-text-muted hover:bg-rx-overlay transition-colors"
              >
                Back
              </button>
            )}
            {step < steps.length && (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-body bg-rx-overlay text-rx-text-secondary hover:bg-rx-elevated transition-colors"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Connect Form ─────────────────────────────────────────────────────────────

function ConnectForm({
  gwName,
  onConnected,
}: {
  gwName: string;
  onConnected: (result: ConnectResult) => void;
}) {
  const meta = GATEWAY_META[gwName];
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const testMode = apiKey.startsWith("rzp_test_") || apiKey.startsWith("sk_test_");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey || !apiSecret) return;
    setLoading(true);
    setError(null);
    setSyncing(false);

    try {
      const r = await fetch("/api/gateways/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway: gwName, apiKey, apiSecret }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Connection failed");
        return;
      }
      setSyncing(true);
      // Small delay so user sees the "syncing" state
      await new Promise((res) => setTimeout(res, 500));
      onConnected(data as ConnectResult);
    } catch {
      setError("Network error — check your connection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t border-border pt-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[12px] font-body text-rx-text-muted block">API Key</label>
          <div className="relative">
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`rzp_test_…`}
              className="w-full px-3 py-2 rounded-lg bg-rx-overlay border border-border text-[13px] font-mono text-rx-text-primary placeholder:text-rx-text-muted focus:outline-none focus:border-rx-blue transition-colors"
              disabled={loading}
              autoComplete="off"
            />
            {testMode && apiKey && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-rx-amber-dim">
                <TestTube2 size={10} className="text-rx-amber" />
                <span className="text-[10px] font-body text-rx-amber">Test</span>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[12px] font-body text-rx-text-muted block">API Secret</label>
          <div className="relative">
            <input
              type={showSecret ? "text" : "password"}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="••••••••••••••••"
              className="w-full px-3 py-2 pr-9 rounded-lg bg-rx-overlay border border-border text-[13px] font-mono text-rx-text-primary placeholder:text-rx-text-muted focus:outline-none focus:border-rx-blue transition-colors"
              disabled={loading}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-rx-text-muted hover:text-rx-text-secondary transition-colors"
            >
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rx-red/10 border border-rx-red/20">
          <AlertCircle size={14} className="text-rx-red shrink-0" />
          <p className="text-[13px] font-body text-rx-red">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[12px] font-body text-rx-text-muted">
          Keys are encrypted with AES-256 and never exposed.{" "}
          <a
            href={`https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-rx-blue hover:underline"
          >
            Where to find keys?
          </a>
        </p>
        <button
          type="submit"
          disabled={loading || !apiKey || !apiSecret}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-all",
            loading || !apiKey || !apiSecret
              ? "bg-rx-overlay text-rx-text-muted cursor-not-allowed"
              : "bg-rx-blue text-white hover:opacity-90 btn-glow"
          )}
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {syncing ? "Syncing payments…" : "Connecting…"}
            </>
          ) : (
            <>
              <Zap size={14} /> Connect & Sync
            </>
          )}
        </button>
      </div>

      {testMode && apiKey && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rx-amber-dim border border-rx-amber/20">
          <TestTube2 size={14} className="text-rx-amber shrink-0" />
          <p className="text-[12px] font-body text-rx-amber">
            Test mode detected — using sandbox data. Recovery campaigns will <strong>not</strong> send real messages.
          </p>
        </div>
      )}
    </form>
  );
}

// ─── Connected Gateway Card ───────────────────────────────────────────────────

function ConnectedCard({
  gw,
  onDisconnect,
  onResync,
  initialWebhookResult,
}: {
  gw: GatewayStatus;
  onDisconnect: (id: string) => void;
  onResync: (id: string) => Promise<{ fetched: number; inserted: number; skipped: number; firstError?: string } | null>;
  initialWebhookResult?: ConnectResult | null;
}) {
  const meta = GATEWAY_META[gw.gatewayName] ?? { color: "#6b7280", label: gw.gatewayName };
  const [showWebhook, setShowWebhook] = useState(!!initialWebhookResult);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<{ inserted: number; fetched: number; skipped: number; firstError?: string } | null>(
    initialWebhookResult?.sync ? initialWebhookResult.sync : null
  );
  const lastSeen = formatRelativeTime(gw.lastWebhookAt);

  async function handleResync() {
    setSyncing(true);
    try {
      const result = await onResync(gw.id);
      if (result) setSyncResult(result);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    onDisconnect(gw.id);
  }

  return (
    <div
      className="bg-rx-surface border border-border rounded-2xl p-7 card-hover border-l-4"
      style={{ borderLeftColor: meta.color }}
    >
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        {/* Left: info */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-heading font-bold shrink-0"
              style={{ background: meta.color, color: "#fff" }}
            >
              {meta.label[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-bold text-lg text-rx-text-primary">{meta.label}</h3>
                {gw.testMode && (
                  <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-body bg-rx-amber-dim text-rx-amber">
                    <TestTube2 size={10} /> Test Mode
                  </span>
                )}
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-md font-body bg-rx-green-dim text-rx-green">
                Connected
              </span>
            </div>
          </div>

          {/* Webhook health */}
          <div>
            <span className="text-xs font-body text-rx-text-muted">Webhook health (last 20)</span>
            <div className="flex items-center gap-0.5 mt-1">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-2 h-4 rounded-sm",
                    gw.lastWebhookAt ? "bg-rx-green" : "bg-rx-overlay"
                  )}
                />
              ))}
            </div>
            <span className="text-[11px] font-body text-rx-text-muted mt-1 block">
              Last webhook: {lastSeen}
            </span>
          </div>

          {/* Sync stats */}
          {syncResult && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[12px] font-body text-rx-text-muted">
                <CheckCircle2 size={13} className="text-rx-green" />
                Fetched {syncResult.fetched} failed payments from Razorpay
                {syncResult.inserted > 0 && <span className="text-rx-green">· {syncResult.inserted} saved to DB</span>}
                {syncResult.skipped > 0 && <span className="text-rx-text-muted">· {syncResult.skipped} skipped</span>}
              </div>
              {syncResult.firstError && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-rx-red/10 border border-rx-red/20">
                  <AlertCircle size={12} className="text-rx-red shrink-0 mt-0.5" />
                  <p className="text-[11px] font-mono text-rx-red break-all">{syncResult.firstError}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex flex-col gap-2 lg:items-end shrink-0">
          <button
            onClick={() => setShowWebhook((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-body text-rx-blue hover:bg-rx-blue-dim transition-colors"
          >
            <Webhook size={14} />
            {showWebhook ? "Hide webhook setup" : "Webhook setup"}
            {showWebhook ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            onClick={handleResync}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-body text-rx-text-muted hover:text-rx-text-secondary hover:bg-rx-overlay transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Re-sync"}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-body text-rx-red hover:bg-rx-red-dim transition-colors disabled:opacity-50"
          >
            <Unplug size={14} /> Disconnect
          </button>
        </div>
      </div>

      {/* Webhook instructions (expandable) */}
      {showWebhook && (
        <WebhookInstructions
          gateway={gw.gatewayName}
          connectionId={gw.id}
          webhookUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/${gw.gatewayName}`}
          initialSecret={initialWebhookResult?.webhookSecret}
          onDone={() => setShowWebhook(false)}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GatewaysPage() {
  const [gateways, setGateways] = useState<GatewayStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectingGw, setConnectingGw] = useState<string | null>(null);
  const [newConnections, setNewConnections] = useState<Record<string, ConnectResult>>({});

  const loadGateways = useCallback(() => {
    fetch("/api/dashboard/gateways")
      .then((r) => r.json())
      .then((data) => setGateways(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { loadGateways(); }, [loadGateways]);

  const connectedNames = new Set(gateways.map((g) => g.gatewayName));
  const disconnectedGateways = ALL_GATEWAYS.filter((g) => !connectedNames.has(g));

  function handleConnected(result: ConnectResult) {
    setConnectingGw(null);
    setNewConnections((prev) => ({ ...prev, [result.gatewayName]: result }));
    loadGateways(); // Refresh list
  }

  async function handleDisconnect(id: string) {
    await fetch(`/api/gateways/${id}`, { method: "DELETE" });
    loadGateways();
  }

  async function handleResync(id: string) {
    const r = await fetch(`/api/gateways/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    });
    const data = await r.json();
    if (data.fetched !== undefined) {
      return {
        fetched: data.fetched,
        inserted: data.inserted,
        skipped: data.skipped,
        firstError: data.firstError,
      };
    }
    return null;
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-heading font-bold text-rx-text-primary">Payment Gateways</h1>
        <p className="text-sm font-body text-rx-text-muted mt-1">
          Connect your gateways to start recovering failed payments automatically.
        </p>
      </div>

      <div className="space-y-4">
        {/* ── Connected gateways ── */}
        {isLoading
          ? [...Array(2)].map((_, i) => (
              <div key={i} className="bg-rx-surface border border-border rounded-2xl p-7">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-rx-overlay animate-[skeleton-pulse_2s_ease-in-out_infinite] shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-32 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
                    <div className="h-4 w-24 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
                  </div>
                </div>
              </div>
            ))
          : gateways.map((gw) => (
              <ConnectedCard
                key={gw.gatewayName}
                gw={gw}
                onDisconnect={handleDisconnect}
                onResync={handleResync}
                initialWebhookResult={newConnections[gw.gatewayName] ?? null}
              />
            ))}

        {/* ── Disconnected gateways ── */}
        {!isLoading &&
          disconnectedGateways.map((gwName) => {
            const meta = GATEWAY_META[gwName];
            const isExpanded = connectingGw === gwName;
            return (
              <div
                key={gwName}
                className="bg-rx-surface border border-border rounded-2xl p-7 border-l-4"
                style={{ borderLeftColor: meta.color, opacity: isExpanded ? 1 : 0.65 }}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                  <div className="flex-1 flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-heading font-bold shrink-0"
                      style={{ background: meta.color, color: "#fff" }}
                    >
                      {meta.label[0]}
                    </div>
                    <div>
                      <h3 className="font-heading font-bold text-lg text-rx-text-primary">{meta.label}</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-md font-body bg-rx-overlay text-rx-text-muted">
                        Not connected
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setConnectingGw(isExpanded ? null : gwName)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors shrink-0",
                      isExpanded
                        ? "border border-border text-rx-text-muted hover:bg-rx-overlay"
                        : "border border-border text-rx-text-secondary hover:border-rx-blue hover:text-rx-blue"
                    )}
                  >
                    {isExpanded ? (
                      <><ChevronUp size={14} /> Cancel</>
                    ) : (
                      <><Zap size={14} /> Connect {meta.label}</>
                    )}
                  </button>
                </div>

                {isExpanded && (
                  <ConnectForm gwName={gwName} onConnected={handleConnected} />
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
