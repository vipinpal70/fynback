"use client";

import { Bell, Search, Download } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/recovery": "Recovery",
  "/dashboard/payments": "Failed Payments",
  "/dashboard/campaigns": "Campaigns",
  "/dashboard/gateways": "Gateways",
  "/dashboard/analytics": "Analytics",
  "/dashboard/settings": "Settings",
};

export function DashboardHeader() {
  const pathname = usePathname() || "";
  const pageTitle = breadcrumbMap[pathname] || "Overview";

  return (
    <header className="sticky top-0 z-30 h-14 flex items-center justify-between px-6 border-b border-border bg-rx-surface/80 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-sm font-body">
        <span className="text-rx-text-muted">Dashboard</span>
        <span className="text-rx-text-muted">/</span>
        <span className="text-rx-text-primary font-medium">{pageTitle}</span>
      </div>

      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rx-surface border border-border text-rx-text-muted text-sm font-body hover:border-rx-text-muted/20 transition-colors">
          <Search size={14} />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden sm:inline ml-2 px-1.5 py-0.5 rounded bg-rx-overlay text-[10px] font-mono">⌘K</kbd>
        </button>

        <button className="relative p-2 rounded-lg hover:bg-rx-overlay text-rx-text-secondary transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rx-red" />
        </button>

        <Button
          variant="outline"
          size="sm"
          className="border-rx-amber text-rx-amber hover:bg-rx-amber-dim text-xs font-heading font-semibold hidden sm:flex"
        >
          Upgrade to Growth
        </Button>

        <div className="w-8 h-8 rounded-lg bg-rx-blue-dim text-rx-blue flex items-center justify-center font-heading font-bold text-xs">
          RM
        </div>
      </div>
    </header>
  );
}
