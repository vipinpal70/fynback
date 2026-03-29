'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, X, ExternalLink, AlertTriangle, TrendingUp, Zap } from 'lucide-react';

interface Props {
  merchantId: string;
  merchantEmail: string;
}

const STORAGE_KEY_PREFIX = 'fynback_interakt_warned_';
const SUPPRESS_HOURS = 24; // re-show after 24h if dismissed without adding key

function isSuppressed(merchantId: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = STORAGE_KEY_PREFIX + merchantId;
  const stored = localStorage.getItem(key);
  if (!stored) return false;
  const suppressedUntil = parseInt(stored, 10);
  return Date.now() < suppressedUntil;
}

function suppress(merchantId: string) {
  const key = STORAGE_KEY_PREFIX + merchantId;
  const until = Date.now() + SUPPRESS_HOURS * 60 * 60 * 1000;
  localStorage.setItem(key, String(until));
}

function suppressPermanently(merchantId: string) {
  // Use far-future timestamp as "dismissed permanently" (until key is added)
  const key = STORAGE_KEY_PREFIX + merchantId;
  const until = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  localStorage.setItem(key, String(until));
}

export function InteraktWarningModal({ merchantId, merchantEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false); // for fade-in animation

  useEffect(() => {
    if (!isSuppressed(merchantId)) {
      // Small delay so page loads first
      const t = setTimeout(() => {
        setOpen(true);
        setTimeout(() => setVisible(true), 16);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [merchantId]);

  const handleRemindLater = () => {
    suppress(merchantId);
    setVisible(false);
    setTimeout(() => setOpen(false), 300);
  };

  const handleGoToSettings = () => {
    suppressPermanently(merchantId);
    setVisible(false);
    setTimeout(() => setOpen(false), 300);
    window.location.href = '/dashboard/settings?section=whatsapp';
  };

  const handleClose = () => {
    suppress(merchantId);
    setVisible(false);
    setTimeout(() => setOpen(false), 300);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="pointer-events-auto w-full max-w-md bg-rx-surface border border-border rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
          }}
        >
          {/* Amber gradient header bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500" />

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-rx-text-muted hover:text-rx-text-primary hover:bg-rx-overlay transition-colors"
          >
            <X size={16} />
          </button>

          <div className="p-6">
            {/* Icon + headline */}
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <MessageSquare size={22} className="text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <span className="text-[11px] font-body font-semibold text-amber-400 uppercase tracking-wider">
                    WhatsApp Channel Inactive
                  </span>
                </div>
                <h2 className="text-[17px] font-heading font-bold text-rx-text-primary leading-snug">
                  You're leaving recovery money on the table
                </h2>
              </div>
            </div>

            {/* Body */}
            <p className="text-[14px] font-body text-rx-text-secondary leading-relaxed mb-4">
              You enabled WhatsApp recovery during onboarding, but your{' '}
              <strong className="text-rx-text-primary">Interakt API key is missing</strong>.
              FynBack cannot send WhatsApp messages until this is configured.
            </p>

            {/* Stats banner */}
            <div className="flex gap-3 mb-5">
              <div className="flex-1 bg-rx-elevated border border-border rounded-xl p-3 text-center">
                <p className="text-[22px] font-mono font-bold text-amber-400">42%</p>
                <p className="text-[11px] font-body text-rx-text-muted mt-0.5">of recoveries via WhatsApp</p>
              </div>
              <div className="flex-1 bg-rx-elevated border border-border rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <TrendingUp size={14} className="text-rx-green" />
                  <p className="text-[22px] font-mono font-bold text-rx-green-text">#1</p>
                </div>
                <p className="text-[11px] font-body text-rx-text-muted mt-0.5">channel in India</p>
              </div>
              <div className="flex-1 bg-rx-elevated border border-border rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Zap size={12} className="text-rx-blue" />
                  <p className="text-[22px] font-mono font-bold text-rx-blue">+12%</p>
                </div>
                <p className="text-[11px] font-body text-rx-text-muted mt-0.5">extra recovery rate</p>
              </div>
            </div>

            {/* Steps hint */}
            <div className="bg-rx-elevated border border-border rounded-xl p-3.5 mb-5 space-y-2">
              <p className="text-[12px] font-body font-semibold text-rx-text-primary mb-2">
                How to fix this in 2 minutes:
              </p>
              {[
                { n: '1', text: 'Go to interakt.ai and sign up or log in' },
                { n: '2', text: 'Copy your secret key from Settings → Developer Setting' },
                { n: '3', text: 'Paste it in FynBack → Settings → WhatsApp' },
              ].map(step => (
                <div key={step.n} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {step.n}
                  </span>
                  <span className="text-[12px] font-body text-rx-text-secondary">{step.text}</span>
                </div>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleGoToSettings}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[14px] font-heading font-bold transition-colors shadow-lg shadow-amber-500/20"
              >
                <ExternalLink size={15} />
                Add Interakt key now → Settings
              </button>
              <button
                onClick={handleRemindLater}
                className="w-full py-2.5 px-4 rounded-xl border border-border text-[13px] font-body text-rx-text-muted hover:text-rx-text-secondary hover:border-rx-text-muted/40 transition-colors"
              >
                Remind me tomorrow
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
