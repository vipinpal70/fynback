"use client";

import { Check } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";

export interface TimelineStep {
  day: string;
  channels: ChannelType[];
  stat?: string; // e.g. "42% converted"
}

type ChannelType = "email" | "whatsapp" | "sms" | "retry";

const channelIcons: Record<ChannelType, React.JSX.Element> = {
  email: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  ),
  whatsapp: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fillRule="evenodd" clipRule="evenodd" />
    </svg>
  ),
  sms: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  retry: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  ),
};

interface CampaignTimelineProps {
  steps: TimelineStep[];
  currentStep: number; // 0-indexed: steps < currentStep are completed, === is active, > are future
}

export default function CampaignTimeline({ steps, currentStep }: CampaignTimelineProps) {
  return (
    <div className="flex items-start w-full overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;

        return (
          <div key={i} className="flex items-start flex-1 min-w-0 last:flex-none">
            {/* Node column */}
            <div className="flex flex-col items-center gap-1.5 min-w-[52px]">
              {/* Day label */}
              <span className="text-[10px] font-mono text-rx-text-muted leading-none">{step.day}</span>

              {/* Circle node */}
              <div className="relative">
                {isActive && (
                  <div className="absolute inset-[-4px] rounded-full border-2 border-rx-blue animate-timeline-pulse" />
                )}
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                    isCompleted && "bg-rx-green",
                    isActive && "bg-rx-blue",
                    !isCompleted && !isActive && "border border-rx-text-muted/30 bg-transparent"
                  )}
                >
                  {isCompleted && <Check size={13} className="text-white" strokeWidth={2.5} />}
                  {isActive && <div className="w-2 h-2 rounded-full bg-white" />}
                  {!isCompleted && !isActive && <div className="w-1.5 h-1.5 rounded-full bg-rx-text-muted/40" />}
                </div>
              </div>

              {/* Channel icons row */}
              <div className="flex items-center gap-1 mt-0.5">
                {step.channels.map((ch, ci) => (
                  <span
                    key={ci}
                    className={cn(
                      "opacity-70",
                      isCompleted ? "text-rx-green" : isActive ? "text-rx-blue" : "text-rx-text-muted"
                    )}
                  >
                    {channelIcons[ch]}
                  </span>
                ))}
              </div>

              {/* Stat below */}
              {step.stat && isCompleted && (
                <span className="text-[11px] font-mono text-rx-green-text leading-none mt-0.5">{step.stat}</span>
              )}
              {isActive && (
                <span className="text-[11px] font-mono text-rx-blue leading-none mt-0.5">In progress</span>
              )}
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className="flex-1 min-w-[16px] mt-[22px] px-0.5">
                <div
                  className={cn(
                    "h-px w-full",
                    i < currentStep ? "bg-rx-green" : "bg-border"
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
