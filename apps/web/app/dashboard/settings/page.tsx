'use client';

import { useState, useRef, useEffect } from 'react';
import {
  User, Building2, Palette, Link2, MessageCircle, Bell,
  CreditCard, Users, Key, Shield, AlertTriangle,
  Copy, Check, Eye, EyeOff, Zap, FileText, Unplug,
  Camera, ExternalLink, Plus, UserPlus, UploadCloud,
  ChevronDown, ChevronRight, AlertCircle, Download,
  X, MoreHorizontal, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── TypeScript Types ─────────────────────────────────────────────────────────
type Plan = 'trial' | 'starter' | 'growth' | 'scale' | 'suspended';
type MerchantStatus = 'onboarding' | 'active' | 'trial_expired' | 'suspended' | 'cancelled';
type GatewayStatus = 'connected' | 'disconnected' | 'token_expired' | 'webhook_failing';
type TeamRole = 'owner' | 'admin' | 'viewer';
type DigestFrequency = 'realtime' | 'daily' | 'weekly' | 'never';

interface GatewayConnection {
  id: string;
  gateway: 'razorpay' | 'stripe' | 'cashfree' | 'payu';
  status: GatewayStatus;
  gatewayMerchantId: string | null;
  gatewayAccountName: string | null;
  lastWebhookReceivedAt: string | null;
  consecutiveWebhookFailures: number;
  canReadSubscriptions?: boolean;
  canRetryPayments?: boolean;
  connectedAt: string | null;
}

interface TeamMember {
  id: string;
  email: string;
  fullName: string | null;
  role: TeamRole;
  clerkUserId: string | null;
  inviteAcceptedAt: string | null;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

// ─── Default Merchant Data (overwritten by real API data on load) ────────────
const DEFAULT_MERCHANT_DATA = {
  id: 'mrc_8Kj2mnQRabcd',
  clerkUserId: 'user_2abc123def',
  fullName: 'Rahul Mehta',
  email: 'rahul@acmesaas.in',
  companyName: 'AcmeSaaS',
  businessLegalName: 'Acme Technologies Pvt. Ltd.',
  websiteUrl: 'https://acmesaas.in',
  businessType: 'saas',
  mrrRange: '5l_to_25l',
  country: 'IN',
  gstNumber: '07AABCA1234A1Z5',
  gstVerified: true,
  panNumber: 'AABCA1234A',
  plan: 'growth' as Plan,
  billingCycle: 'monthly',
  trialStartedAt: null as string | null,
  trialEndsAt: null as string | null,
  currentPeriodStart: '2025-03-01',
  currentPeriodEnd: '2025-03-31',
  stripeCustomerId: 'cus_Pk9mNqRxT3abc',
  stripeSubId: 'sub_1Pq8NxRyT2abc',
  status: 'active' as MerchantStatus,
  onboardingStep: 5,
  onboardingCompletedAt: '2024-10-15',
  totalFailedAmountInr: 30800000,
  totalRecoveredAmountInr: 24000000,
  recoveryRatePct: 78,
  activeFailedPaymentsCount: 143,
  createdAt: '2024-10-15',
  brand: {
    fromName: 'Billing at AcmeSaaS',
    fromEmail: 'billing@acmesaas.in',
    replyToEmail: 'support@acmesaas.in',
    emailDomainVerified: true,
    resendDomainId: 'dom_8Kj2mnQR',
    logoUrl: null as string | null,
    brandColorHex: '#3b82f6',
    companyTagline: 'The subscription SaaS for modern teams',
    whatsappEnabled: true,
    interaktApiKey: 'ik_live_*********************xyz',
    whatsappSenderName: 'AcmeSaaS',
    whatsappTemplatesApproved: true,
    smsEnabled: false,
    msg91ApiKey: null as string | null,
    msg91SenderId: null as string | null,
    dltRegistered: false,
    slackWebhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
    notifyOnRecovery: true,
    digestFrequency: 'daily' as DigestFrequency,
    digestEmail: 'rahul@acmesaas.in',
  },
  gateways: [
    { id: 'gwc_001', gateway: 'razorpay', status: 'connected', gatewayMerchantId: 'acc_Pq8NxRyT2abc', gatewayAccountName: 'Acme Technologies', lastWebhookReceivedAt: '2025-03-21T14:02:11Z', consecutiveWebhookFailures: 0, canReadSubscriptions: true, canRetryPayments: true, tokenExpiresAt: null, connectedAt: '2024-10-15' },
    { id: 'gwc_002', gateway: 'stripe', status: 'connected', gatewayMerchantId: 'acct_1Pq8NxRyT2abcd', gatewayAccountName: 'Acme Technologies Pvt Ltd', lastWebhookReceivedAt: '2025-03-21T13:58:44Z', consecutiveWebhookFailures: 0, tokenExpiresAt: null, connectedAt: '2024-10-22' },
    { id: 'gwc_003', gateway: 'cashfree', status: 'connected', gatewayMerchantId: 'cf_mrc_8Kj2mn', gatewayAccountName: 'Acme Technologies', lastWebhookReceivedAt: '2025-03-21T13:45:22Z', consecutiveWebhookFailures: 0, tokenExpiresAt: null, connectedAt: '2024-11-08' },
    { id: 'gwc_004', gateway: 'payu', status: 'disconnected', gatewayMerchantId: null, gatewayAccountName: null, lastWebhookReceivedAt: null, consecutiveWebhookFailures: 0, tokenExpiresAt: null, connectedAt: null },
  ] as (GatewayConnection & { tokenExpiresAt: string | null })[],
  team: [
    { id: 'tm_001', email: 'rahul@acmesaas.in', fullName: 'Rahul Mehta', role: 'owner', clerkUserId: 'user_2abc123def', inviteAcceptedAt: '2024-10-15' },
    { id: 'tm_002', email: 'priya@acmesaas.in', fullName: 'Priya Sharma', role: 'admin', clerkUserId: 'user_3def456ghi', inviteAcceptedAt: '2024-10-20' },
    { id: 'tm_003', email: 'dev@acmesaas.in', fullName: null, role: 'viewer', clerkUserId: null, inviteAcceptedAt: null },
  ] as TeamMember[],
  apiKeys: [
    { id: 'key_001', name: 'Production', keyPrefix: 'rcvx_pr_', lastUsedAt: '2025-03-21T14:01:00Z', expiresAt: null, isActive: true, createdAt: '2024-10-15' },
    { id: 'key_002', name: 'Staging', keyPrefix: 'rcvx_st_', lastUsedAt: '2025-03-19T09:22:00Z', expiresAt: '2025-06-01', isActive: true, createdAt: '2024-11-02' },
  ] as ApiKey[],
};

type MerchantData = typeof DEFAULT_MERCHANT_DATA;

// Module-level mutable reference — updated after API load.
// Sections use `defaultValue` (not `value`) so they only read this on mount.
// SettingsPage increments `sectionKey` after updating this, forcing sections to re-mount.
let merchantData: MerchantData = DEFAULT_MERCHANT_DATA;

// ─── Format Helpers ───────────────────────────────────────────────────────────
const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const formatRelativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;
  return `${Math.floor(hrs / 24)} days ago`;
};

const maskApiKey = (prefix: string): string => `${prefix}${'•'.repeat(24)}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className={cn('p-1 rounded transition-colors text-rx-text-muted hover:text-rx-text-secondary', className)}>
      {copied ? <Check size={14} className="text-rx-green" /> : <Copy size={14} />}
    </button>
  );
}

function Badge({ children, variant = 'default', className }: { children: React.ReactNode; variant?: 'green' | 'amber' | 'red' | 'blue' | 'default'; className?: string }) {
  const variants = {
    green: 'bg-rx-green-dim text-rx-green-text',
    amber: 'bg-rx-amber-dim text-rx-amber',
    red: 'bg-rx-red-dim text-rx-red',
    blue: 'bg-rx-blue-dim text-rx-blue',
    default: 'bg-rx-overlay text-rx-text-secondary',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-body font-medium', variants[variant], className)}>
      {children}
    </span>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn('relative w-10 h-[22px] rounded-full transition-colors shrink-0', on ? 'bg-rx-blue' : 'bg-rx-overlay border border-border')}
    >
      <span className={cn('absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all', on ? 'left-[22px]' : 'left-[3px]')} />
    </button>
  );
}

function FormField({ label, helper, required, children }: { label: string; helper?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-body font-medium text-rx-text-secondary">
        {label}{required && <span className="text-rx-red ml-0.5">*</span>}
      </label>
      {children}
      {helper && <p className="text-[12px] font-body text-rx-text-muted">{helper}</p>}
    </div>
  );
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-3.5 py-2.5 rounded-lg bg-rx-elevated border border-border text-[14px] font-body text-rx-text-primary placeholder:text-rx-text-muted outline-none transition-all',
        'focus:border-rx-blue focus:ring-2 focus:ring-rx-blue/20',
        props.disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    />
  );
}

function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full px-3.5 py-2.5 rounded-lg bg-rx-elevated border border-border text-[14px] font-body text-rx-text-primary outline-none transition-all appearance-none cursor-pointer',
        'focus:border-rx-blue focus:ring-2 focus:ring-rx-blue/20',
        className,
      )}
    >
      {children}
    </select>
  );
}

function Card({ children, className, accentColor }: { children: React.ReactNode; className?: string; accentColor?: string }) {
  return (
    <div
      className={cn('bg-rx-surface border border-border rounded-xl p-6', className)}
      style={accentColor ? { borderColor: accentColor } : undefined}
    >
      {children}
    </div>
  );
}

function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h3 className="text-[15px] font-heading font-semibold text-rx-text-primary">{children}</h3>
      {action}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-[20px] font-heading font-semibold text-rx-text-primary">{title}</h2>
        <p className="text-[14px] font-body text-rx-text-muted mt-1">{subtitle}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function UnsavedBanner({ show, onSave, onDiscard, isSaving }: { show: boolean; onSave: () => void; onDiscard: () => void; isSaving: boolean }) {
  if (!show) return null;
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-rx-elevated border border-rx-amber rounded-lg px-4 py-2.5 mb-4">
      <div className="flex items-center gap-2 text-[13px] font-body text-rx-text-secondary">
        <AlertCircle size={15} className="text-rx-amber shrink-0" />
        You have unsaved changes
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onDiscard} className="px-3 py-1.5 rounded-lg text-[13px] font-body text-rx-text-muted hover:text-rx-text-secondary border border-border transition-colors">Discard</button>
        <button onClick={onSave} disabled={isSaving} className="px-3 py-1.5 rounded-lg bg-rx-blue text-[13px] font-body font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50">
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Settings Nav ─────────────────────────────────────────────────────────────
const navGroups = [
  {
    label: 'Account',
    items: [
      { id: 'profile', label: 'Profile', icon: User },
      { id: 'business', label: 'Business & Compliance', icon: Building2 },
    ],
  },
  {
    label: 'Recovery',
    items: [
      { id: 'brand', label: 'Brand & Email', icon: Palette },
      { id: 'gateways', label: 'Gateways', icon: Link2 },
      { id: 'whatsapp', label: 'WhatsApp & SMS', icon: MessageCircle },
      { id: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'billing', label: 'Billing & Plan', icon: CreditCard },
      { id: 'team', label: 'Team', icon: Users },
      { id: 'apikeys', label: 'API Keys', icon: Key },
      { id: 'security', label: 'Security', icon: Shield },
      { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
    ],
  },
];

function SettingsNav({ activeSection, onNavigate }: { activeSection: string; onNavigate: (s: string) => void }) {
  const connectedGateways = merchantData.gateways.filter(g => g.status === 'connected').length;

  const getBadge = (id: string) => {
    if (id === 'gateways') return <span className="ml-auto text-[11px] font-body text-rx-text-muted">{connectedGateways}/4</span>;
    if (id === 'whatsapp' && merchantData.brand.whatsappEnabled) return <span className="ml-auto w-2 h-2 rounded-full bg-rx-green shrink-0" />;
    if (id === 'billing') return <Badge variant="green" className="ml-auto text-[10px] py-0">Growth</Badge>;
    if (id === 'team') return <span className="ml-auto text-[11px] font-body bg-rx-overlay px-1.5 py-0.5 rounded-md text-rx-text-muted">{merchantData.team.length}</span>;
    if (id === 'apikeys') return <span className="ml-auto text-[11px] font-body bg-rx-overlay px-1.5 py-0.5 rounded-md text-rx-text-muted">{merchantData.apiKeys.length}</span>;
    return null;
  };

  return (
    <nav className="w-[220px] shrink-0 bg-rx-surface border-r border-border self-stretch hidden lg:block">
      <div className="sticky top-0 pt-2 pb-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-1">
            <p className="px-4 pt-4 pb-1.5 text-[10px] font-body font-medium text-rx-text-muted uppercase tracking-[0.08em]">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              const isDanger = item.id === 'danger';
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-4 py-2 text-[14px] font-body transition-all text-left',
                    isActive
                      ? 'bg-rx-blue-dim text-rx-blue border-l-2 border-rx-blue rounded-r-lg font-medium'
                      : isDanger
                      ? 'text-rx-red hover:bg-rx-overlay hover:rounded-lg'
                      : 'text-rx-text-secondary hover:bg-rx-overlay hover:text-rx-text-primary hover:rounded-lg',
                  )}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {getBadge(item.id)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function ProfileSection({ hasChanges, setHasChanges }: { hasChanges: boolean; setHasChanges: (v: boolean) => void }) {
  const initials = merchantData.fullName.split(' ').map(n => n[0]).join('');
  const [showPan, setShowPan] = useState(false);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Profile"
        subtitle="Your personal and account information"
        action={<span className="text-[12px] font-body text-rx-text-muted">Last updated March 15, 2025</span>}
      />

      <Card>
        <CardTitle>Personal information</CardTitle>

        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
          <div className="w-16 h-16 rounded-full bg-rx-blue-dim flex items-center justify-center text-rx-blue text-[22px] font-heading font-semibold shrink-0">
            {initials}
          </div>
          <div className="flex-1">
            <p className="text-[18px] font-heading font-semibold text-rx-text-primary">{merchantData.fullName}</p>
            <p className="text-[14px] font-body text-rx-text-muted">{merchantData.email}</p>
            <p className="text-[13px] font-body text-rx-text-muted mt-0.5">Owner · Member since {formatDate(merchantData.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[13px] font-body text-rx-text-muted hover:text-rx-text-secondary transition-colors">
              <Camera size={14} /> Change avatar
            </button>
            <button className="px-3 py-1.5 rounded-lg border border-border text-[13px] font-body text-rx-text-muted hover:text-rx-text-secondary transition-colors">
              Remove
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField label="Full name">
            <Input defaultValue={merchantData.fullName} onChange={() => setHasChanges(true)} />
          </FormField>
          <FormField label="Email address">
            <div className="relative">
              <Input defaultValue={merchantData.email} onChange={() => setHasChanges(true)} className="pr-24" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2"><Badge variant="green">Verified ✓</Badge></span>
            </div>
          </FormField>
          <FormField label="Phone number">
            <div className="flex gap-2">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rx-elevated border border-border text-[14px] font-body text-rx-text-primary shrink-0">
                🇮🇳 +91
              </div>
              <Input defaultValue="98765 43210" onChange={() => setHasChanges(true)} />
            </div>
          </FormField>
          <FormField label="Timezone">
            <Select defaultValue="Asia/Kolkata" onChange={() => setHasChanges(true)}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30)</option>
              <option value="UTC">UTC</option>
            </Select>
          </FormField>
          <FormField label="Language">
            <Select defaultValue="en-IN" onChange={() => setHasChanges(true)}>
              <option value="en-IN">English (India)</option>
              <option value="en-US">English (US)</option>
            </Select>
          </FormField>
          <FormField label="Date format">
            <Select defaultValue="DD/MM/YYYY" onChange={() => setHasChanges(true)}>
              <option>DD/MM/YYYY</option>
              <option>MM/DD/YYYY</option>
              <option>YYYY-MM-DD</option>
            </Select>
          </FormField>
        </div>

        <div className="border-t border-border mt-6 pt-5">
          <p className="text-[14px] font-body font-medium text-rx-text-primary mb-1">Password</p>
          <p className="text-[13px] font-body text-rx-text-muted mb-3">
            Password is managed through your Google account. Last sign-in: March 21, 2025 at 2:14 PM
          </p>
          <button className="text-[13px] font-body text-rx-blue hover:underline">Manage sign-in methods →</button>
        </div>
      </Card>

      <Card>
        <CardTitle>Account overview</CardTitle>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Member since', value: 'Oct 15, 2024', sub: '95 days active' },
            { label: 'Account status', value: <span className="flex items-center gap-1.5 text-rx-green-text"><span className="w-2 h-2 rounded-full bg-rx-green" />Active</span>, sub: 'Fully onboarded' },
            {
              label: 'Merchant ID',
              value: (
                <span className="flex items-center gap-1.5 font-mono text-[13px] text-rx-text-primary">
                  mrc_8Kj2mn…
                  <CopyButton value={merchantData.id} />
                </span>
              ),
              sub: null,
            },
            {
              label: 'Lifetime recovery',
              value: <span className="font-mono text-[18px] font-semibold text-rx-green-text">₹2,40,000</span>,
              sub: '78% rate · 1,847 payments',
            },
          ].map((stat, i) => (
            <div key={i} className="bg-rx-elevated border border-border rounded-lg p-4">
              <p className="text-[12px] font-body text-rx-text-muted mb-1">{stat.label}</p>
              <div className="text-[15px] font-heading font-semibold text-rx-text-primary">{stat.value}</div>
              {stat.sub && <p className="text-[12px] font-body text-rx-text-muted mt-0.5">{stat.sub}</p>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BusinessSection({ setHasChanges }: { setHasChanges: (v: boolean) => void }) {
  return (
    <div className="space-y-5">
      <SectionHeader title="Business & Compliance" subtitle="Legal entity information for invoicing and compliance" />

      <Card>
        <CardTitle>Business details</CardTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField label="Company name (trading name)">
            <Input defaultValue={merchantData.companyName} onChange={() => setHasChanges(true)} />
          </FormField>
          <FormField label="Business legal name" helper="Used on GST invoices. Must match your GST registration.">
            <Input defaultValue={merchantData.businessLegalName} onChange={() => setHasChanges(true)} />
          </FormField>
          <FormField label="Business type">
            <Select defaultValue="saas" onChange={() => setHasChanges(true)}>
              <option value="saas">SaaS / Software</option>
              <option value="d2c">D2C Subscription</option>
              <option value="edtech">EdTech</option>
              <option value="ott">OTT / Media</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
          <FormField label="Website">
            <div className="relative">
              <Input defaultValue={merchantData.websiteUrl} onChange={() => setHasChanges(true)} className="pr-10" />
              <a href={merchantData.websiteUrl} target="_blank" rel="noopener noreferrer" className="absolute right-3 top-1/2 -translate-y-1/2 text-rx-text-muted hover:text-rx-blue transition-colors">
                <ExternalLink size={14} />
              </a>
            </div>
          </FormField>
          <FormField label="Country">
            <Select defaultValue="IN" onChange={() => setHasChanges(true)}>
              <option value="IN">India 🇮🇳</option>
              <option value="US">United States 🇺🇸</option>
            </Select>
          </FormField>
          <FormField label="MRR range" helper="Helps us tailor recovery recommendations">
            <Select defaultValue="5l_to_25l" onChange={() => setHasChanges(true)}>
              <option value="lt_5l">Under ₹5L</option>
              <option value="5l_to_25l">₹5L – ₹25L</option>
              <option value="25l_to_1cr">₹25L – ₹1Cr</option>
              <option value="gt_1cr">₹1Cr+</option>
            </Select>
          </FormField>
        </div>
      </Card>

      <Card accentColor="rgba(59,130,246,0.4)">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[15px] font-heading font-semibold text-rx-text-primary">GST &amp; tax information</h3>
          <Badge variant="amber">India 🇮🇳 Required</Badge>
        </div>

        <div className="space-y-5">
          <FormField label="GSTIN (GST Identification Number)" helper="Your GSTIN is verified. It appears on all invoices. Format: 2-digit state + 10-digit PAN + 1+1+1 chars.">
            <div className="relative">
              <Input defaultValue={merchantData.gstNumber} className="font-mono pr-28" onChange={() => setHasChanges(true)} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2"><Badge variant="green">✓ Verified</Badge></span>
            </div>
          </FormField>

          <FormField label="PAN (Permanent Account Number)">
            <div className="relative">
              <Input defaultValue="AABCA****" className="font-mono pr-10" readOnly />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-rx-text-muted hover:text-rx-text-secondary transition-colors">
                <Eye size={15} />
              </button>
            </div>
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <FormField label="GST rate applied">
              <Input value="18% (standard SaaS rate)" readOnly className="cursor-default" />
            </FormField>
            <FormField label="Invoice currency">
              <Select defaultValue="INR">
                <option>INR ₹</option>
              </Select>
            </FormField>
            <FormField label="Financial year start">
              <Select defaultValue="April 1">
                <option>April 1</option>
                <option>January 1</option>
              </Select>
            </FormField>
          </div>

          <div className="flex gap-3 pt-2">
            {[
              { label: 'GST Registered', done: true },
              { label: 'DLT Registered', done: merchantData.brand.dltRegistered },
              { label: 'TDS Setup', done: false },
            ].map((item) => (
              <Badge key={item.label} variant={item.done ? 'green' : 'red'}>
                {item.done ? '✓' : '✗'} {item.label}
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Email Preview ────────────────────────────────────────────────────────────
function EmailPreview({ fromName, fromEmail, brandColor, tagline, template }: {
  fromName: string; fromEmail: string; brandColor: string; tagline: string; template: 1 | 2 | 3;
}) {
  const previews = {
    1: { subject: 'Action required: Payment failed', body: 'We were unable to process your ₹4,299 payment for the Growth plan. This sometimes happens when a card expires or funds are temporarily unavailable.' },
    2: { subject: 'Reminder: Your access may be paused', body: 'Your Growth plan access may be paused soon. Please update your payment details to continue enjoying uninterrupted service.' },
    3: { subject: 'Final notice: Payment still pending', body: 'This is your final reminder about the payment for your Growth plan. Please update your details within 24 hours to avoid service interruption.' },
  };
  const p = previews[template];
  return (
    <div className="border border-border rounded-lg overflow-hidden text-[13px]" style={{ fontFamily: 'sans-serif' }}>
      <div className="px-5 py-3 flex items-center gap-3" style={{ background: brandColor }}>
        <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center text-white font-bold text-[14px]">A</div>
        <span className="text-white font-semibold">AcmeSaaS</span>
      </div>
      <div className="bg-white px-6 py-5 text-[#1a1a1a]">
        <p className="font-semibold mb-3">{p.subject}</p>
        <p className="text-[#444] mb-1">Hi [Customer Name],</p>
        <p className="text-[#444] mb-4">{p.body}</p>
        <div className="mb-4">
          <span className="inline-block px-5 py-2 rounded-lg text-white text-[13px] font-semibold" style={{ background: brandColor }}>
            Update payment method →
          </span>
        </div>
        <p className="text-[#888] text-[12px]">If you believe this is an error, simply reply to this email.</p>
      </div>
      <div className="bg-[#f4f4f4] px-6 py-3 text-[11px] text-[#888] border-t border-[#e0e0e0]">
        <p>{fromName} · {fromEmail}</p>
        <p className="mt-0.5">{tagline}</p>
        <p className="mt-0.5">Unsubscribe</p>
      </div>
    </div>
  );
}

function BrandSection({ setHasChanges }: { setHasChanges: (v: boolean) => void }) {
  const [fromName, setFromName] = useState(merchantData.brand.fromName);
  const [brandColor, setBrandColor] = useState(merchantData.brand.brandColorHex);
  const [tagline, setTagline] = useState(merchantData.brand.companyTagline);
  const [activeTemplate, setActiveTemplate] = useState<1 | 2 | 3>(1);
  const colorRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Brand & Email"
        subtitle="How fynback appears to your customers in recovery emails"
        action={
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rx-blue text-[13px] font-body text-rx-blue hover:bg-rx-blue-dim transition-colors">
            <Eye size={14} /> Preview email →
          </button>
        }
      />

      <Card>
        <CardTitle>Sender identity</CardTitle>
        <div className="space-y-5">
          <FormField label="Display name (From)" helper={`How your name appears in the inbox: '${fromName}'`}>
            <div className="relative">
              <Input value={fromName} onChange={e => { setFromName(e.target.value); setHasChanges(true); }} className="pr-20" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-body text-rx-text-muted">{fromName.length}/50</span>
            </div>
          </FormField>
          <FormField label="Sending email address">
            <div className="relative">
              <Input defaultValue={merchantData.brand.fromEmail} onChange={() => setHasChanges(true)} className="pr-36" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2"><Badge variant="green">Domain verified ✓</Badge></span>
            </div>
            <div className="mt-3 space-y-1.5 p-3 bg-rx-elevated rounded-lg border border-border">
              {[
                { k: 'Domain', v: 'acmesaas.in' },
                { k: 'SPF record', v: '✓ Configured', ok: true },
                { k: 'DKIM record', v: '✓ Configured', ok: true },
                { k: 'DMARC policy', v: '✓ Configured', ok: true },
                { k: 'Deliverability score', v: '98/100', mono: true },
              ].map(row => (
                <div key={row.k} className="flex justify-between text-[12px]">
                  <span className="font-body text-rx-text-muted">{row.k}</span>
                  <span className={cn('font-body', row.ok ? 'text-rx-green-text' : row.mono ? 'font-mono text-rx-green-text' : 'text-rx-text-secondary')}>{row.v}</span>
                </div>
              ))}
            </div>
          </FormField>
          <FormField label="Reply-to address (for customer replies)">
            <Input defaultValue={merchantData.brand.replyToEmail} onChange={() => setHasChanges(true)} />
          </FormField>
        </div>
      </Card>

      <Card>
        <CardTitle>Visual identity</CardTitle>
        <div className="space-y-5">
          <FormField label="Company logo" helper="Shown in email header. PNG or SVG, max 2MB. Recommended: 320×80px">
            <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors hover:border-rx-blue hover:bg-rx-blue-dim/30">
              <UploadCloud size={28} className="text-rx-text-muted mb-2" />
              <p className="text-[13px] font-body text-rx-text-muted">Drop your logo here or click to browse</p>
              <p className="text-[11px] font-body text-rx-text-muted mt-1">PNG, SVG, WebP · Max 2MB</p>
            </div>
          </FormField>
          <FormField label="Primary brand color" helper="Used for CTA buttons in your recovery emails">
            <div className="flex items-center gap-3">
              <button
                onClick={() => colorRef.current?.click()}
                className="w-10 h-10 rounded-lg border border-border shrink-0 transition-transform hover:scale-105"
                style={{ background: brandColor }}
              />
              <input ref={colorRef} type="color" value={brandColor} onChange={e => { setBrandColor(e.target.value); setHasChanges(true); }} className="sr-only" />
              <Input value={brandColor} onChange={e => { setBrandColor(e.target.value); setHasChanges(true); }} className="w-32 font-mono" />
            </div>
          </FormField>
          <FormField label="Email footer tagline (optional)" helper="Shown in small text at the bottom of all recovery emails">
            <Input value={tagline} onChange={e => { setTagline(e.target.value); setHasChanges(true); }} />
          </FormField>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-heading font-semibold text-rx-text-primary">Email preview</h3>
          <div className="flex gap-1">
            {([1, 2, 3] as (1 | 2 | 3)[]).map(t => (
              <button key={t} onClick={() => setActiveTemplate(t)}
                className={cn('px-3 py-1 rounded-md text-[12px] font-body transition-colors', activeTemplate === t ? 'text-rx-blue border-b-2 border-rx-blue bg-rx-blue-dim' : 'text-rx-text-muted hover:text-rx-text-secondary')}>
                Email #{t}
              </button>
            ))}
          </div>
        </div>
        <EmailPreview fromName={fromName} fromEmail={merchantData.brand.fromEmail} brandColor={brandColor} tagline={tagline} template={activeTemplate} />
        <p className="text-[12px] font-body text-rx-text-muted mt-3">
          This is Email #{activeTemplate} — sent {activeTemplate === 1 ? 'immediately after failure' : activeTemplate === 2 ? 'on Day 5 if unpaid' : 'on Day 10 as final notice'}.{' '}
          <a href="#" className="text-rx-blue hover:underline">Edit templates →</a>
        </p>
      </Card>
    </div>
  );
}

// ─── Webhook Health Dots ──────────────────────────────────────────────────────
function WebhookHealthDots({ gateway, lastReceived }: { gateway: string; lastReceived: string | null }) {
  const dotData: Record<string, ('green' | 'amber' | 'red')[]> = {
    razorpay: Array(20).fill('green'),
    stripe: [...Array(19).fill('green'), 'amber'],
    cashfree: [...Array(18).fill('green'), 'red', 'red'],
    payu: [],
  };
  const dots = dotData[gateway] ?? [];
  const colorMap = { green: 'bg-rx-green', amber: 'bg-rx-amber', red: 'bg-rx-red' };
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {dots.map((c, i) => <span key={i} className={cn('w-2 h-2 rounded-full', colorMap[c])} />)}
      </div>
      {lastReceived && <span className="text-[11px] font-mono text-rx-text-muted">{formatRelativeTime(lastReceived)}</span>}
    </div>
  );
}

function GatewayCard({ gw }: { gw: typeof merchantData.gateways[0] }) {
  const isConnected = gw.status === 'connected';
  const colors: Record<string, string> = {
    razorpay: '#2563eb', stripe: '#6366f1', cashfree: '#059669', payu: '#d97706',
  };
  const labels: Record<string, string> = {
    razorpay: 'Razorpay', stripe: 'Stripe', cashfree: 'Cashfree', payu: 'PayU',
  };
  const color = colors[gw.gateway];
  const label = labels[gw.gateway];

  return (
    <div className={cn('bg-rx-surface border border-border rounded-xl p-6 transition-opacity')} style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-heading font-bold shrink-0" style={{ background: color }}>
            {label[0]}
          </div>
          <span className="text-[16px] font-heading font-semibold text-rx-text-primary">{label}</span>
        </div>
        <Badge variant={isConnected ? 'green' : 'amber'}>
          {isConnected ? '● Connected' : '⚠ Disconnected'}
        </Badge>
      </div>

      {isConnected ? (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-rx-elevated rounded-lg border border-border">
            <div>
              <p className="text-[11px] font-body text-rx-text-muted mb-0.5">Account</p>
              <p className="text-[13px] font-body text-rx-text-primary">{gw.gatewayAccountName}</p>
            </div>
            <div>
              <p className="text-[11px] font-body text-rx-text-muted mb-0.5">Merchant ID</p>
              <div className="flex items-center gap-1">
                <span className="text-[12px] font-mono text-rx-text-primary truncate">{(gw.gatewayMerchantId ?? '').slice(0, 12)}…</span>
                <CopyButton value={gw.gatewayMerchantId ?? ''} />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-body text-rx-text-muted mb-0.5">Connected</p>
              <p className="text-[13px] font-body text-rx-text-primary">{gw.connectedAt ? formatDate(gw.connectedAt) : '—'}</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-[12px] font-body font-medium text-rx-text-secondary mb-2">Webhook health (last 20)</p>
            <WebhookHealthDots gateway={gw.gateway} lastReceived={gw.lastWebhookReceivedAt} />
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {(gw as any).canReadSubscriptions && <Badge variant="green">✓ Read subscriptions</Badge>}
            {(gw as any).canRetryPayments && <Badge variant="green">✓ Retry payments</Badge>}
            <Badge variant="green">✓ Read customers</Badge>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[13px] font-body text-rx-text-muted hover:text-rx-text-secondary transition-colors"><Zap size={13} /> Test webhook</button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[13px] font-body text-rx-text-muted hover:text-rx-text-secondary transition-colors"><FileText size={13} /> Webhook logs</button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rx-red/30 text-[13px] font-body text-rx-red hover:bg-rx-red-dim transition-colors"><Unplug size={13} /> Disconnect</button>
          </div>
        </>
      ) : (
        <div>
          <div className="flex flex-col items-center py-6 text-center">
            <Unplug size={28} className="text-rx-amber mb-3" />
            <p className="text-[14px] font-body font-medium text-rx-text-primary mb-1">{label} is not connected</p>
            <p className="text-[13px] font-body text-rx-text-muted mb-4">Connect your {label} account to recover payments from {label} customers.</p>
          </div>
          <div className="p-3 rounded-lg bg-rx-amber-dim border-l-4 border-rx-amber mb-4 text-[13px] font-body text-rx-text-secondary">
            You may be missing recovery for {label} customers. Reconnecting typically adds 10–15% to total recovered revenue.
            <span className="block mt-1 font-mono text-rx-amber">Estimated impact: ₹24,000–₹36,000/mo</span>
          </div>
          <div className="flex justify-center">
            <button className="px-6 py-2.5 rounded-lg bg-rx-amber text-white text-[14px] font-body font-semibold hover:opacity-90 transition-opacity">
              Connect {label} account →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GatewaysSection() {
  const connected = merchantData.gateways.filter(g => g.status === 'connected').length;
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Payment Gateways"
        subtitle="Manage your connected payment providers and webhook health"
        action={<Badge variant="green">Connection health: {connected}/4 active</Badge>}
      />
      {merchantData.gateways.map(gw => <GatewayCard key={gw.id} gw={gw} />)}
      <div className="border-2 border-dashed border-border rounded-xl p-5 text-center">
        <p className="text-[14px] font-body font-medium text-rx-text-muted">+ Add another gateway</p>
        <p className="text-[12px] font-body text-rx-text-muted mt-1">Coming soon: Paddle · Chargebee · Recurly · Zoho Subscriptions</p>
      </div>
    </div>
  );
}

function WhatsAppSection({ setHasChanges }: { setHasChanges: (v: boolean) => void }) {
  const [waEnabled, setWaEnabled] = useState(merchantData.brand.whatsappEnabled);
  const [waDay0, setWaDay0] = useState(true);
  const [waDay5, setWaDay5] = useState(true);
  const [waPortal, setWaPortal] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);

  const templates = [
    { name: 'payment_initial_reminder', category: 'UTILITY', used: 143, preview: 'Hi {{1}}, there was an issue processing ₹{{2}} for {{3}}…' },
    { name: 'payment_urgency_reminder', category: 'UTILITY', used: 87, preview: 'Hi {{1}}, your {{3}} access may be paused soon…' },
    { name: 'final_payment_warning', category: 'UTILITY', used: 34, preview: 'Hi {{1}}, this is your final reminder about ₹{{2}}…' },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader title="WhatsApp & SMS" subtitle="Configure outreach channels for recovery messages" />

      <Card>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[15px] font-heading font-semibold text-rx-text-primary">WhatsApp Business</h3>
          <Badge variant="green">Active ✓</Badge>
        </div>

        <div className="p-3 rounded-lg bg-rx-elevated border border-border mb-5 space-y-2">
          {[
            { k: 'Interakt account', v: 'Connected · AcmeSaaS' },
            { k: 'Business number', v: '+91 80000 00001', mono: true },
            { k: 'Templates', v: '3 approved by Meta' },
          ].map(row => (
            <div key={row.k} className="flex justify-between text-[13px]">
              <span className="font-body text-rx-text-muted">{row.k}</span>
              <span className={cn('font-body text-rx-text-primary', (row as any).mono && 'font-mono')}>{row.v}</span>
            </div>
          ))}
        </div>

        <FormField label="Interakt API key">
          <div className="relative">
            <Input value={showApiKey ? merchantData.brand.interaktApiKey : maskApiKey('ik_live_')} readOnly className="font-mono pr-20" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              <button onClick={() => setShowApiKey(v => !v)} className="p-1.5 rounded hover:bg-rx-overlay text-rx-text-muted transition-colors">
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button className="p-1.5 rounded hover:bg-rx-overlay text-rx-text-muted transition-colors" title="Rotate key"><RefreshCw size={14} /></button>
            </div>
          </div>
        </FormField>

        <div className="mt-5">
          <p className="text-[13px] font-body font-medium text-rx-text-primary mb-3">Meta-approved message templates</p>
          <div className="space-y-3">
            {templates.map(t => (
              <div key={t.name} className="p-3 rounded-lg bg-rx-elevated border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-mono text-rx-text-primary">{t.name}</span>
                  <Badge variant="green">✓ Approved</Badge>
                </div>
                <p className="text-[11px] font-body text-rx-text-muted mb-1">Category: {t.category} · Language: English</p>
                <p className="text-[12px] font-body italic text-rx-text-secondary">&ldquo;{t.preview}&rdquo;</p>
                <p className="text-[11px] font-mono text-rx-text-muted mt-1">Used: {t.used} times this month</p>
              </div>
            ))}
          </div>
          <button className="mt-3 flex items-center gap-1.5 text-[13px] font-body text-rx-blue hover:underline"><Plus size={13} /> Request new template</button>
        </div>

        <div className="mt-5 space-y-3 border-t border-border pt-5">
          {[
            { label: 'Enable WhatsApp recovery', desc: 'Send WhatsApp messages in recovery campaigns', val: waEnabled, set: setWaEnabled },
            { label: 'Send WhatsApp on Day 0', desc: 'Immediately after failed payment is detected', val: waDay0, set: setWaDay0 },
            { label: 'Send WhatsApp on Day 5', desc: 'Follow-up if payment is still unpaid', val: waDay5, set: setWaDay5 },
            { label: 'Include portal link in WhatsApp', desc: 'Add self-service payment update link', val: waPortal, set: setWaPortal },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-body text-rx-text-primary">{row.label}</p>
                <p className="text-[12px] font-body text-rx-text-muted">{row.desc}</p>
              </div>
              <Toggle on={row.val} onToggle={() => { row.set((v: boolean) => !v); setHasChanges(true); }} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[15px] font-heading font-semibold text-rx-text-primary">SMS via MSG91</h3>
          <Badge variant="amber">Not configured ⚠</Badge>
        </div>

        <div className="mb-5">
          <p className="text-[13px] font-body font-medium text-rx-text-primary mb-3">SMS Setup Checklist</p>
          <div className="space-y-2">
            {['Create MSG91 account', 'Complete DLT registration (TRAI)', 'Register sender ID (6 chars, e.g. RECVRX)', 'Approve message templates', 'Enter API key below'].map((step, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full border border-border shrink-0" />
                <span className="text-[13px] font-body text-rx-text-muted">Step {i + 1}: {step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-rx-amber-dim border-l-4 border-rx-amber mb-5 text-[13px] font-body text-rx-text-secondary">
          ⚠ DLT registration is mandatory in India. All commercial SMS must be registered with TRAI before sending. Processing takes 3–5 business days.{' '}
          <a href="#" className="text-rx-amber hover:underline">Start DLT registration →</a>
        </div>

        <div className="space-y-4">
          <FormField label="MSG91 API key">
            <Input placeholder="Paste your MSG91 API key…" disabled />
          </FormField>
          <FormField label="DLT registered sender ID">
            <Input placeholder="6-character ID e.g. RECVRX" disabled />
          </FormField>
        </div>

        <button className="mt-5 w-full py-2.5 rounded-lg bg-rx-blue text-white text-[14px] font-body font-medium hover:opacity-90 transition-opacity">Enable SMS recovery</button>
        <p className="text-center text-[12px] font-body text-rx-text-muted mt-2">SMS adds 12% on average to recovery rates for Indian customers.</p>
      </Card>
    </div>
  );
}

function NotificationsSection({ setHasChanges }: { setHasChanges: (v: boolean) => void }) {
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [dailyDigest, setDailyDigest] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(false);
  const [monthlyInvoice, setMonthlyInvoice] = useState(true);

  const alertEvents = [
    { label: 'Payment recovered', desc: 'When a payment is successfully recovered', slack: true, email: true },
    { label: 'Failed payment detected', desc: 'New failed payment enters the system', slack: true, email: false },
    { label: 'Hard decline (fraud flag)', desc: 'Unrecoverable decline from bank', slack: true, email: true },
    { label: 'Campaign completed', desc: 'Recovery campaign finishes', slack: false, email: true },
    { label: 'Retry exhausted', desc: 'All retries failed — no recovery', slack: true, email: false },
    { label: 'Webhook health warning', desc: 'Gateway webhook delays detected', slack: true, email: true },
    { label: 'Gateway disconnected', desc: 'A payment gateway goes offline', slack: true, email: true },
  ];

  const testSlack = () => {
    setTestState('sending');
    setTimeout(() => { setTestState('sent'); setTimeout(() => setTestState('idle'), 2000); }, 1500);
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Notifications" subtitle="How and when fynback alerts you about recovery activity" />

      <Card>
        <CardTitle>Real-time alerts</CardTitle>
        <FormField label="Slack webhook URL" helper="Sends '₹X,XXX recovered' messages to your Slack channel.">
          <div className="flex gap-2">
            <Input defaultValue={merchantData.brand.slackWebhookUrl} onChange={() => setHasChanges(true)} className="font-mono text-[12px]" />
            <button onClick={testSlack} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[13px] font-body text-rx-text-muted hover:text-rx-text-secondary transition-colors whitespace-nowrap shrink-0">
              {testState === 'sending' ? <RefreshCw size={13} className="animate-spin" /> : testState === 'sent' ? <Check size={13} className="text-rx-green" /> : <Zap size={13} />}
              {testState === 'sent' ? '✓ Sent!' : 'Test'}
            </button>
          </div>
        </FormField>

        <div className="mt-5">
          <div className="grid grid-cols-[1fr_60px_60px] gap-2 pb-2 border-b border-border">
            <span className="text-[12px] font-body font-medium text-rx-text-muted">Event</span>
            <span className="text-[12px] font-body font-medium text-rx-text-muted text-center">Slack</span>
            <span className="text-[12px] font-body font-medium text-rx-text-muted text-center">Email</span>
          </div>
          {alertEvents.map((ev, i) => {
            const [slack, setSlack] = useState(ev.slack);
            const [email, setEmail] = useState(ev.email);
            return (
              <div key={i} className="grid grid-cols-[1fr_60px_60px] gap-2 items-center py-2.5 border-b border-border last:border-0">
                <div>
                  <p className="text-[13px] font-body text-rx-text-primary">{ev.label}</p>
                  <p className="text-[11px] font-body text-rx-text-muted">{ev.desc}</p>
                </div>
                <div className="flex justify-center"><Toggle on={slack} onToggle={() => { setSlack(v => !v); setHasChanges(true); }} /></div>
                <div className="flex justify-center"><Toggle on={email} onToggle={() => { setEmail(v => !v); setHasChanges(true); }} /></div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle>Scheduled digests</CardTitle>
        <div className="space-y-4">
          {[
            { label: 'Daily recovery digest', desc: "Receive a summary of yesterday's recovery activity", val: dailyDigest, set: setDailyDigest, extra: 'Delivered at 9:00 AM' },
            { label: 'Weekly performance report', desc: 'Full analytics summary every Monday morning', val: weeklyReport, set: setWeeklyReport, extra: 'Monday 8:00 AM' },
            { label: 'Monthly recovery invoice', desc: 'Auto-generated PDF with full recovery report + your fynback invoice', val: monthlyInvoice, set: setMonthlyInvoice, extra: '1st of month' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
              <div className="flex-1">
                <p className="text-[14px] font-body text-rx-text-primary">{row.label}</p>
                <p className="text-[12px] font-body text-rx-text-muted">{row.desc}</p>
                {row.val && <p className="text-[11px] font-body text-rx-text-muted mt-0.5">Delivered: {row.extra}</p>}
              </div>
              <Toggle on={row.val} onToggle={() => { row.set((v: boolean) => !v); setHasChanges(true); }} />
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <FormField label="Additional recipients" helper="Also send digests to:">
            <div className="flex flex-wrap gap-2 p-2.5 rounded-lg bg-rx-elevated border border-border">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rx-overlay text-[12px] font-body text-rx-text-secondary">
                {merchantData.brand.digestEmail}
                <X size={11} className="cursor-pointer hover:text-rx-red" />
              </span>
              <input type="email" placeholder="Add recipient…" className="flex-1 min-w-[140px] bg-transparent text-[13px] font-body text-rx-text-primary placeholder:text-rx-text-muted outline-none" />
            </div>
          </FormField>
        </div>
      </Card>
    </div>
  );
}

// ─── Billing Section ──────────────────────────────────────────────────────────
function BillingSection() {
  const [planOpen, setPlanOpen] = useState(false);

  const features = [
    { text: 'Razorpay + Stripe integration', included: true },
    { text: 'WhatsApp Business recovery', included: true },
    { text: 'SMS reminders (MSG91)', included: true },
    { text: 'Cashfree + PayU integration', included: true },
    { text: 'Campaign editor + A/B testing', included: true },
    { text: 'Subscription pause flow', included: true },
    { text: 'Priority support', included: true },
    { text: 'AI email copy variants (Scale plan)', included: false },
    { text: 'Customer segmentation (Scale plan)', included: false },
  ];

  const billing = [
    { date: 'Mar 1, 2025', amount: '₹6,999', status: 'Paid', period: 'Feb 1–28' },
    { date: 'Feb 1, 2025', amount: '₹6,999', status: 'Paid', period: 'Jan 1–31' },
    { date: 'Jan 1, 2025', amount: '₹6,999', status: 'Paid', period: 'Dec 1–31' },
    { date: 'Dec 1, 2024', amount: '₹6,999', status: 'Paid', period: 'Nov 1–30' },
    { date: 'Nov 1, 2024', amount: '₹6,999', status: 'Paid', period: 'Oct 1–31' },
    { date: 'Oct 15, 2024', amount: '₹0.00', status: 'Trial', period: 'Trial' },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader title="Billing & Plan" subtitle="Manage your fynback subscription" />

      <Card>
        <CardTitle>Current plan</CardTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="inline-flex items-center px-4 py-2 rounded-lg bg-rx-green-dim border border-rx-green mb-4">
              <span className="text-[18px] font-heading font-bold text-rx-green-text">Growth</span>
            </div>
            <p className="text-[28px] font-mono font-semibold text-rx-text-primary mb-1">₹6,999 <span className="text-[16px] font-normal text-rx-text-muted">/ month</span></p>
            <p className="text-[13px] font-body text-rx-text-muted mb-5">Monthly · Renews March 31, 2025</p>
            <div className="space-y-2">
              {features.map(f => (
                <div key={f.text} className="flex items-center gap-2 text-[13px] font-body">
                  <span className={f.included ? 'text-rx-green-text' : 'text-rx-text-muted'}>
                    {f.included ? '✓' : '✗'}
                  </span>
                  <span className={f.included ? 'text-rx-text-secondary' : 'text-rx-text-muted'}>
                    {f.text}
                    {!f.included && <a href="#" className="ml-1 text-rx-blue hover:underline text-[11px]">Upgrade</a>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-rx-green-dim border border-rx-green p-5 flex flex-col gap-3">
            <p className="text-[14px] font-heading font-semibold text-rx-green-text">Your fynback ROI</p>
            <div className="space-y-1 font-mono">
              <p className="text-[22px] font-bold text-rx-green-text">₹2,40,000 <span className="text-[13px] font-normal text-rx-text-muted">recovered this month</span></p>
              <p className="text-[15px] text-rx-text-muted">÷ ₹6,999 <span className="text-[12px]">plan cost</span></p>
              <p className="text-[26px] font-bold text-rx-green-text">= 34.3× <span className="text-[13px] font-normal text-rx-text-muted">return on investment</span></p>
            </div>
            <p className="text-[12px] font-body text-rx-text-secondary">This plan has paid for itself 34.3 times this month.</p>
            <div className="p-3 rounded-lg bg-rx-blue-dim border border-rx-blue/30 text-[12px] font-body text-rx-text-secondary mt-1">
              The Scale plan adds AI email variants + segmentation. Estimated additional recovery: +₹28,000/mo.
              <a href="#" className="block mt-1 text-rx-blue hover:underline">Upgrade to Scale →</a>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle action={<button className="text-[13px] font-body text-rx-blue hover:underline">Update card</button>}>Payment method</CardTitle>
        <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-rx-elevated border border-border">
          <CreditCard size={22} className="text-rx-blue shrink-0" />
          <div>
            <p className="text-[14px] font-body text-rx-text-primary">Visa ending in 4242</p>
            <p className="text-[12px] font-body text-rx-text-muted">Expires 09/2027 · Billing email: {merchantData.email}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] font-body text-rx-text-muted">
                {['Date', 'Amount', 'Status', 'Period', 'Action'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {billing.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-rx-overlay/40 transition-colors">
                  <td className="px-3 py-2.5 font-body text-rx-text-secondary">{row.date}</td>
                  <td className="px-3 py-2.5 font-mono text-rx-text-primary">{row.amount}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={row.status === 'Paid' ? 'green' : 'default'}>{row.status === 'Paid' ? '✓ Paid' : row.status}</Badge>
                  </td>
                  <td className="px-3 py-2.5 font-body text-rx-text-muted">{row.period}</td>
                  <td className="px-3 py-2.5">
                    {row.status === 'Paid' && (
                      <button className="flex items-center gap-1 text-[12px] font-body text-rx-blue hover:underline">
                        <Download size={12} /> PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <a href="#" className="block mt-3 text-[13px] font-body text-rx-blue hover:underline">View all invoices →</a>
      </Card>

      <Card>
        <button onClick={() => setPlanOpen(v => !v)} className="flex items-center justify-between w-full text-left">
          <span className="text-[14px] font-heading font-semibold text-rx-text-primary">Upgrade or downgrade</span>
          {planOpen ? <ChevronDown size={16} className="text-rx-text-muted" /> : <ChevronRight size={16} className="text-rx-text-muted" />}
        </button>
        {planOpen && (
          <div className="mt-5 grid grid-cols-3 gap-4">
            {[
              { name: 'Starter', price: '₹2,999', current: false },
              { name: 'Growth', price: '₹6,999', current: true },
              { name: 'Scale', price: '₹14,999', current: false },
            ].map(plan => (
              <div key={plan.name} className={cn('rounded-xl border p-4 text-center', plan.current ? 'border-rx-green bg-rx-green-dim' : 'border-border bg-rx-elevated')}>
                <p className="text-[15px] font-heading font-semibold text-rx-text-primary mb-1">{plan.name}</p>
                <p className="text-[20px] font-mono font-bold text-rx-text-primary mb-3">{plan.price}<span className="text-[12px] font-normal text-rx-text-muted">/mo</span></p>
                {plan.current
                  ? <Badge variant="green">Current plan</Badge>
                  : plan.name === 'Scale'
                  ? <button className="px-4 py-1.5 rounded-lg bg-rx-blue text-white text-[13px] font-body hover:opacity-90 transition-opacity">Upgrade</button>
                  : <button className="text-[13px] font-body text-rx-red hover:underline">Downgrade</button>
                }
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Team Section ─────────────────────────────────────────────────────────────
function TeamSection() {
  const [permOpen, setPermOpen] = useState(false);
  const avatarColors = ['bg-rx-blue-dim text-rx-blue', 'bg-purple-500/20 text-purple-400', 'bg-rx-overlay text-rx-text-muted'];

  const permissions = [
    { perm: 'View dashboard', owner: true, admin: true, viewer: true },
    { perm: 'View analytics', owner: true, admin: true, viewer: true },
    { perm: 'Manually trigger retries', owner: true, admin: true, viewer: false },
    { perm: 'Edit campaigns', owner: true, admin: true, viewer: false },
    { perm: 'Manage gateways', owner: true, admin: false, viewer: false },
    { perm: 'Billing & plan', owner: true, admin: false, viewer: false },
    { perm: 'Invite team members', owner: true, admin: true, viewer: false },
    { perm: 'Access API keys', owner: true, admin: true, viewer: false },
    { perm: 'Delete account', owner: true, admin: false, viewer: false },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Team"
        subtitle="Manage who has access to your fynback account"
        action={
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rx-blue text-white text-[13px] font-body font-medium hover:opacity-90 transition-opacity">
            <UserPlus size={14} /> Invite team member
          </button>
        }
      />

      <Card>
        <CardTitle>Members ({merchantData.team.length})</CardTitle>
        <div className="space-y-1">
          {merchantData.team.map((member, i) => {
            const initials = member.fullName ? member.fullName.split(' ').map(n => n[0]).join('') : '?';
            const isPending = !member.inviteAcceptedAt;
            return (
              <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-rx-overlay transition-colors group">
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-heading font-semibold shrink-0', avatarColors[i])}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-body font-medium text-rx-text-primary truncate">
                      {member.fullName ?? <span className="italic text-rx-text-muted">(Invite pending)</span>}
                    </p>
                    <Badge variant={member.role === 'owner' ? 'default' : member.role === 'admin' ? 'blue' : 'default'}>
                      {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                    </Badge>
                  </div>
                  <p className="text-[12px] font-body text-rx-text-muted">{member.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {isPending ? (
                    <span className="flex items-center gap-1.5 text-[12px] font-body text-rx-amber">
                      <span className="w-1.5 h-1.5 rounded-full bg-rx-amber" />
                      Invite sent · <button className="hover:underline">Resend</button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[12px] font-body text-rx-green-text">
                      <span className="w-1.5 h-1.5 rounded-full bg-rx-green" /> Active
                    </span>
                  )}
                  {member.inviteAcceptedAt && (
                    <span className="text-[11px] font-mono text-rx-text-muted hidden sm:block">{formatDate(member.inviteAcceptedAt)}</span>
                  )}
                  <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-rx-overlay text-rx-text-muted transition-all">
                    <MoreHorizontal size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <button onClick={() => setPermOpen(v => !v)} className="flex items-center gap-2 text-[13px] font-body text-rx-blue hover:underline">
            {permOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            View role permissions
          </button>
          {permOpen && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 font-body font-medium text-rx-text-muted">Permission</th>
                    {['Owner', 'Admin', 'Viewer'].map(r => <th key={r} className="px-4 py-2 font-body font-semibold text-rx-text-primary text-center">{r}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {permissions.map(p => (
                    <tr key={p.perm} className="border-b border-border last:border-0 hover:bg-rx-overlay/40 transition-colors">
                      <td className="px-3 py-2.5 font-body text-rx-text-secondary">{p.perm}</td>
                      <td className="px-4 py-2.5 text-center text-rx-green-text">✓</td>
                      <td className="px-4 py-2.5 text-center">{p.admin ? <span className="text-rx-green-text">✓</span> : <span className="text-rx-text-muted">✗</span>}</td>
                      <td className="px-4 py-2.5 text-center">{p.viewer ? <span className="text-rx-green-text">✓</span> : <span className="text-rx-text-muted">✗</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── API Keys Section ─────────────────────────────────────────────────────────
function ApiKeysSection() {
  const [showGenerate, setShowGenerate] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');

  const generate = () => {
    const key = `rcvx_pr_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    setGeneratedKey(key);
    setShowGenerate(false);
  };

  const codeSample = `// Install
npm install @fynback/node

// Initialize
import fynback from '@fynback/node';
const rcvx = new fynback('rcvx_pr_••••••••••');

// Get all active failures
const failures = await rcvx.payments.list({ status: 'active' });

// Manually trigger retry
await rcvx.payments.retry('fp_001');

// Get analytics
const stats = await rcvx.analytics.summary({ period: '30d' });`;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="API Keys"
        subtitle="Use these keys to access fynback programmatically"
        action={
          <button onClick={() => setShowGenerate(v => !v)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rx-blue text-white text-[13px] font-body font-medium hover:opacity-90 transition-opacity">
            <Plus size={14} /> Generate new key
          </button>
        }
      />

      <Card>
        <CardTitle>Active keys</CardTitle>

        {showGenerate && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-rx-elevated border border-rx-blue/30">
            <Input placeholder="Key name (e.g. Production)" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} className="flex-1" />
            <Select className="w-32">
              <option>Never</option>
              <option>30 days</option>
              <option>90 days</option>
              <option>1 year</option>
            </Select>
            <button onClick={generate} className="px-3 py-2.5 rounded-lg bg-rx-blue text-white text-[13px] font-body whitespace-nowrap hover:opacity-90 transition-opacity">Generate</button>
            <button onClick={() => setShowGenerate(false)} className="p-2.5 rounded-lg border border-border text-rx-text-muted hover:text-rx-text-secondary transition-colors"><X size={14} /></button>
          </div>
        )}

        {generatedKey && (
          <div className="mb-4 p-4 rounded-lg bg-rx-elevated border border-rx-green/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-body text-rx-amber font-medium">⚠ This key will only be shown once. Copy it now.</p>
              <X size={14} className="text-rx-text-muted cursor-pointer" onClick={() => setGeneratedKey(null)} />
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-[13px] text-rx-green-text break-all">{generatedKey}</code>
              <CopyButton value={generatedKey} />
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] font-body text-rx-text-muted">
                {['Name', 'Key prefix', 'Last used', 'Expires', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {merchantData.apiKeys.map(key => {
                const expiringSoon = key.expiresAt && new Date(key.expiresAt) < new Date(Date.now() + 90 * 864e5);
                return (
                  <tr key={key.id} className="border-b border-border last:border-0 hover:bg-rx-overlay/40 transition-colors">
                    <td className="px-3 py-3 font-body font-medium text-rx-text-primary">{key.name}</td>
                    <td className="px-3 py-3 font-mono text-rx-text-muted">{maskApiKey(key.keyPrefix)}</td>
                    <td className="px-3 py-3 font-mono text-rx-text-muted text-[12px]">{key.lastUsedAt ? formatRelativeTime(key.lastUsedAt) : '—'}</td>
                    <td className="px-3 py-3 font-mono text-[12px]">
                      <span className={expiringSoon ? 'text-rx-amber' : 'text-rx-text-muted'}>{key.expiresAt ? formatDate(key.expiresAt) : 'Never'}</span>
                    </td>
                    <td className="px-3 py-3"><Badge variant="green">Active</Badge></td>
                    <td className="px-3 py-3">
                      <button className="p-1.5 rounded hover:bg-rx-overlay text-rx-text-muted transition-colors"><MoreHorizontal size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle>Quick start</CardTitle>
        <div className="rounded-xl bg-rx-elevated border border-border overflow-hidden">
          <pre className="p-4 overflow-x-auto text-[12px] font-mono leading-relaxed">
            {codeSample.split('\n').map((line, i) => {
              if (line.startsWith('//')) return <div key={i} className="text-rx-text-muted italic">{line}</div>;
              if (/^(import|const|await|npm)/.test(line)) return (
                <div key={i}>
                  <span className="text-rx-blue">{line.split(' ')[0]}</span>
                  <span className="text-rx-text-primary"> {line.slice(line.indexOf(' ') + 1)}</span>
                </div>
              );
              return <div key={i} className="text-rx-text-primary">{line}</div>;
            })}
          </pre>
        </div>
        <a href="#" className="mt-3 block text-[13px] font-body text-rx-blue hover:underline">View full API docs →</a>
      </Card>
    </div>
  );
}

// ─── Security Section ─────────────────────────────────────────────────────────
function SecuritySection({ setHasChanges }: { setHasChanges: (v: boolean) => void }) {
  return (
    <div className="space-y-5">
      <SectionHeader title="Security" subtitle="Account security and access controls" />

      <Card>
        <CardTitle>Security status</CardTitle>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-rx-elevated border border-border">
            <p className="text-[12px] font-body text-rx-text-muted mb-1">Sign-in method</p>
            <p className="text-[14px] font-body font-medium text-rx-text-primary">Google OAuth ✓</p>
            <p className="text-[12px] font-body text-rx-text-muted mt-1">Last sign-in: today at 2:14 PM</p>
          </div>
          <div className="p-4 rounded-lg bg-rx-elevated border border-rx-amber/30">
            <p className="text-[12px] font-body text-rx-text-muted mb-1">Two-factor auth</p>
            <p className="text-[14px] font-body font-medium text-rx-amber">Not configured ⚠</p>
            <button className="mt-2 px-3 py-1 rounded-lg border border-rx-amber text-rx-amber text-[12px] font-body hover:bg-rx-amber-dim transition-colors">Enable 2FA →</button>
          </div>
          <div className="p-4 rounded-lg bg-rx-elevated border border-border">
            <p className="text-[12px] font-body text-rx-text-muted mb-1">Active sessions</p>
            <p className="text-[14px] font-body font-medium text-rx-text-primary">1 active (this device)</p>
            <button className="mt-1 text-[12px] font-body text-rx-blue hover:underline">View all sessions</button>
          </div>
          <div className="p-4 rounded-lg bg-rx-elevated border border-border">
            <p className="text-[12px] font-body text-rx-text-muted mb-1">Login history</p>
            <p className="text-[14px] font-body font-medium text-rx-text-primary">No suspicious activity</p>
            <button className="mt-1 text-[12px] font-body text-rx-blue hover:underline">View recent logins →</button>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Data &amp; Privacy</CardTitle>
        <div className="space-y-4">
          {[
            { label: 'Recovery data retention', value: '2 years' },
            { label: 'Analytics data', value: '1 year' },
            { label: 'Webhook logs', value: '90 days' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <p className="text-[14px] font-body text-rx-text-primary">{row.label}</p>
              <Select className="w-36 text-[13px]" onChange={() => setHasChanges(true)}>
                <option>{row.value}</option>
              </Select>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-border">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-[13px] font-body text-rx-text-muted hover:text-rx-text-secondary transition-colors">
            <Download size={14} /> Export all my data
          </button>
          <button className="text-[13px] font-body text-rx-red hover:underline">Request data deletion</button>
        </div>
      </Card>
    </div>
  );
}

// ─── Danger Zone Section ──────────────────────────────────────────────────────
function DangerSection() {
  const [deleteInput, setDeleteInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="space-y-5">
      <SectionHeader title="Danger Zone" subtitle="Irreversible actions — proceed with caution" />

      <div className="bg-rx-red-dim border border-rx-red rounded-xl p-6 space-y-0 divide-y divide-rx-red/20">
        <div className="flex items-start justify-between gap-6 pb-5">
          <div>
            <p className="text-[14px] font-heading font-semibold text-rx-text-primary mb-1">Pause all recovery campaigns</p>
            <p className="text-[13px] font-body text-rx-text-secondary">Immediately halts all retries, emails, and WhatsApp messages. Your gateways remain connected. You can resume anytime.</p>
          </div>
          <button className="shrink-0 px-4 py-2 rounded-lg border border-rx-amber text-rx-amber text-[13px] font-body hover:bg-rx-amber-dim transition-colors whitespace-nowrap">
            Pause recovery
          </button>
        </div>

        <div className="flex items-start justify-between gap-6 py-5">
          <div>
            <p className="text-[14px] font-heading font-semibold text-rx-text-primary mb-1">Disconnect all gateways</p>
            <p className="text-[13px] font-body text-rx-text-secondary">Removes all gateway connections. fynback will stop receiving webhooks. You will need to reconnect each gateway individually.</p>
          </div>
          <button className="shrink-0 px-4 py-2 rounded-lg border border-rx-red text-rx-red text-[13px] font-body hover:bg-rx-red-dim transition-colors whitespace-nowrap">
            Disconnect all
          </button>
        </div>

        <div className="pt-5">
          <div className="flex items-start justify-between gap-6 mb-4">
            <div>
              <p className="text-[14px] font-heading font-semibold text-rx-text-primary mb-1">Delete fynback account</p>
              <p className="text-[13px] font-body text-rx-text-secondary">Permanently delete your account and all recovery data. This cannot be undone. Your payment gateways are not affected.</p>
            </div>
            {!showDeleteConfirm && (
              <button onClick={() => setShowDeleteConfirm(true)} className="shrink-0 px-4 py-2 rounded-lg bg-rx-red text-white text-[13px] font-body hover:opacity-90 transition-opacity whitespace-nowrap">
                Delete account
              </button>
            )}
          </div>
          {showDeleteConfirm && (
            <div className="p-4 rounded-lg bg-rx-elevated border border-rx-red/50">
              <p className="text-[13px] font-body text-rx-text-secondary mb-3">Type <span className="font-mono text-rx-red font-semibold">DELETE MY ACCOUNT</span> to confirm:</p>
              <Input
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder='Type "DELETE MY ACCOUNT"'
                className="font-mono border-rx-red/30 focus:border-rx-red mb-3"
              />
              <div className="flex gap-2">
                <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }} className="px-4 py-2 rounded-lg border border-border text-[13px] font-body text-rx-text-muted hover:text-rx-text-secondary transition-colors">Cancel</button>
                <button disabled={deleteInput !== 'DELETE MY ACCOUNT'} className="px-4 py-2 rounded-lg bg-rx-red text-white text-[13px] font-body hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                  Confirm deletion
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ show, onClose }: { show: boolean; onClose: () => void }) {
  useEffect(() => {
    if (show) { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }
  }, [show, onClose]);
  if (!show) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-rx-elevated border-l-4 border-rx-green rounded-lg px-4 py-3 shadow-2xl">
      <Check size={16} className="text-rx-green" />
      <p className="text-[14px] font-body font-medium text-rx-text-primary">Settings saved</p>
      <button onClick={onClose} className="ml-2 text-rx-text-muted hover:text-rx-text-secondary transition-colors"><X size={14} /></button>
    </div>
  );
}

// ─── Mobile Nav ───────────────────────────────────────────────────────────────
function MobileSettingsNav({ activeSection, onNavigate }: { activeSection: string; onNavigate: (s: string) => void }) {
  const allItems = navGroups.flatMap(g => g.items);
  return (
    <div className="lg:hidden overflow-x-auto flex gap-1 pb-2 border-b border-border mb-4">
      {allItems.map(item => {
        const Icon = item.icon;
        return (
          <button key={item.id} onClick={() => onNavigate(item.id)}
            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-body whitespace-nowrap transition-colors shrink-0',
              activeSection === item.id ? 'bg-rx-blue-dim text-rx-blue' : item.id === 'danger' ? 'text-rx-red hover:bg-rx-overlay' : 'text-rx-text-muted hover:bg-rx-overlay hover:text-rx-text-secondary'
            )}>
            <Icon size={13} />{item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
function SettingsSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 bg-rx-overlay rounded-lg" />
      <div className="bg-rx-surface border border-border rounded-xl p-6">
        <div className="h-5 w-36 bg-rx-overlay rounded mb-5" />
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
          <div className="w-16 h-16 rounded-full bg-rx-overlay shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-40 bg-rx-overlay rounded" />
            <div className="h-4 w-56 bg-rx-overlay rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-rx-overlay rounded" />
              <div className="h-10 w-full bg-rx-overlay rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Incrementing this key forces all section components to re-mount after data loads,
  // so their `defaultValue` inputs pick up the real merchant data.
  const [sectionKey, setSectionKey] = useState(0);

  useEffect(() => {
    fetch('/api/settings/merchant')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        const { merchant, brand, team, gateways, currentUserFullName, currentUserEmail } = data;
        if (!merchant) return;

        // Map API response onto the merchantData shape so all sections get real values
        merchantData = {
          ...DEFAULT_MERCHANT_DATA,
          id: merchant.id,
          fullName: currentUserFullName || DEFAULT_MERCHANT_DATA.fullName,
          email: currentUserEmail || DEFAULT_MERCHANT_DATA.email,
          companyName: merchant.companyName || DEFAULT_MERCHANT_DATA.companyName,
          businessLegalName: merchant.businessLegalName || DEFAULT_MERCHANT_DATA.businessLegalName,
          websiteUrl: merchant.websiteUrl || DEFAULT_MERCHANT_DATA.websiteUrl,
          businessType: merchant.businessType || DEFAULT_MERCHANT_DATA.businessType,
          mrrRange: merchant.mrrRange || DEFAULT_MERCHANT_DATA.mrrRange,
          country: merchant.country || 'IN',
          gstNumber: merchant.gstNumber || '',
          gstVerified: merchant.gstVerified ?? false,
          panNumber: merchant.panNumber || '',
          plan: (merchant.plan || 'trial') as Plan,
          billingCycle: merchant.billingCycle || 'monthly',
          trialStartedAt: merchant.trialStartedAt ? new Date(merchant.trialStartedAt).toISOString() : null,
          trialEndsAt: merchant.trialEndsAt ? new Date(merchant.trialEndsAt).toISOString() : null,
          currentPeriodStart: merchant.currentPeriodStart
            ? new Date(merchant.currentPeriodStart).toISOString().slice(0, 10)
            : DEFAULT_MERCHANT_DATA.currentPeriodStart,
          currentPeriodEnd: merchant.currentPeriodEnd
            ? new Date(merchant.currentPeriodEnd).toISOString().slice(0, 10)
            : DEFAULT_MERCHANT_DATA.currentPeriodEnd,
          status: (merchant.status || 'active') as MerchantStatus,
          onboardingStep: merchant.onboardingStep ?? 5,
          onboardingCompletedAt: merchant.onboardingCompletedAt
            ? new Date(merchant.onboardingCompletedAt).toISOString().slice(0, 10)
            : DEFAULT_MERCHANT_DATA.onboardingCompletedAt,
          createdAt: merchant.createdAt
            ? new Date(merchant.createdAt).toISOString().slice(0, 10)
            : DEFAULT_MERCHANT_DATA.createdAt,
          totalFailedAmountInr: merchant.totalFailedAmountPaise ?? 0,
          totalRecoveredAmountInr: merchant.totalRecoveredAmountPaise ?? 0,
          recoveryRatePct: merchant.recoveryRatePct ?? 0,
          activeFailedPaymentsCount: merchant.activeFailedPaymentsCount ?? 0,
          brand: brand ? {
            ...DEFAULT_MERCHANT_DATA.brand,
            fromName: brand.fromName || DEFAULT_MERCHANT_DATA.brand.fromName,
            fromEmail: brand.fromEmail || DEFAULT_MERCHANT_DATA.brand.fromEmail,
            replyToEmail: brand.replyToEmail || DEFAULT_MERCHANT_DATA.brand.replyToEmail,
            emailDomainVerified: brand.emailDomainVerified ?? false,
            logoUrl: brand.logoUrl ?? null,
            brandColorHex: brand.brandColorHex || DEFAULT_MERCHANT_DATA.brand.brandColorHex,
            companyTagline: brand.companyTagline || DEFAULT_MERCHANT_DATA.brand.companyTagline,
            whatsappEnabled: brand.whatsappEnabled ?? false,
            whatsappSenderName: brand.whatsappSenderName || DEFAULT_MERCHANT_DATA.brand.whatsappSenderName,
            slackWebhookUrl: brand.slackWebhookUrl || '',
            digestEmail: brand.digestEmail || currentUserEmail || DEFAULT_MERCHANT_DATA.brand.digestEmail,
            digestFrequency: (brand.digestFrequency || 'daily') as DigestFrequency,
            dltRegistered: brand.smsEnabled ?? false,
            smsEnabled: brand.smsEnabled ?? false,
          } : DEFAULT_MERCHANT_DATA.brand,
          gateways: gateways?.length
            ? gateways.map((gw: any) => ({
                id: gw.id,
                gateway: gw.gatewayName,
                status: gw.isActive ? 'connected' : 'disconnected',
                gatewayMerchantId: null,
                gatewayAccountName: gw.gatewayName,
                lastWebhookReceivedAt: gw.lastWebhookReceivedAt ?? null,
                consecutiveWebhookFailures: 0,
                canReadSubscriptions: false,
                canRetryPayments: false,
                tokenExpiresAt: null,
                connectedAt: gw.connectedAt ?? null,
              }))
            : DEFAULT_MERCHANT_DATA.gateways,
          team: team?.length
            ? team.map((m: any) => ({
                id: m.id,
                email: m.email,
                fullName: m.fullName ?? null,
                role: m.role as TeamRole,
                clerkUserId: m.clerkUserId ?? null,
                inviteAcceptedAt: m.joinedAt ? new Date(m.joinedAt).toISOString().slice(0, 10) : null,
              }))
            : DEFAULT_MERCHANT_DATA.team,
        };
        // Re-mount sections so defaultValue inputs pick up new data
        setSectionKey((k) => k + 1);
      })
      .catch(() => {}) // silently fall back to defaults
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => { setIsSaving(false); setHasChanges(false); setShowToast(true); }, 1000);
  };

  const handleDiscard = () => setHasChanges(false);

  const renderSection = () => {
    if (isLoading) return <SettingsSkeleton />;
    const props = { hasChanges, setHasChanges };
    // key={sectionKey} forces section to re-mount after merchant data loads,
    // so defaultValue inputs initialize with the real values (not defaults).
    switch (activeSection) {
      case 'profile':       return <ProfileSection key={sectionKey} {...props} />;
      case 'business':      return <BusinessSection key={sectionKey} setHasChanges={setHasChanges} />;
      case 'brand':         return <BrandSection key={sectionKey} setHasChanges={setHasChanges} />;
      case 'gateways':      return <GatewaysSection key={sectionKey} />;
      case 'whatsapp':      return <WhatsAppSection key={sectionKey} setHasChanges={setHasChanges} />;
      case 'notifications': return <NotificationsSection key={sectionKey} setHasChanges={setHasChanges} />;
      case 'billing':       return <BillingSection key={sectionKey} />;
      case 'team':          return <TeamSection key={sectionKey} />;
      case 'apikeys':       return <ApiKeysSection key={sectionKey} />;
      case 'security':      return <SecuritySection key={sectionKey} setHasChanges={setHasChanges} />;
      case 'danger':        return <DangerSection key={sectionKey} />;
      default:              return null;
    }
  };

  return (
    <div className="flex h-full max-w-[1400px]">
      <SettingsNav activeSection={activeSection} onNavigate={(s) => { setActiveSection(s); setHasChanges(false); }} />

      <div className="flex-1 min-w-0 px-4 lg:px-8 py-6 overflow-y-auto">
        <div className="max-w-3xl">
          <MobileSettingsNav activeSection={activeSection} onNavigate={(s) => { setActiveSection(s); setHasChanges(false); }} />
          <UnsavedBanner show={hasChanges} onSave={handleSave} onDiscard={handleDiscard} isSaving={isSaving} />
          {renderSection()}
        </div>
      </div>

      <Toast show={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}
