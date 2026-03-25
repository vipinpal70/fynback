"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  TrendingUp,
  CreditCard,
  Zap,
  Link2,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const navItems = [
  { icon: LayoutDashboard, label: "Overview",        path: "/dashboard" },
  { icon: TrendingUp,      label: "Recovery",        path: "/dashboard/recovery" },
  { icon: CreditCard,      label: "Failed Payments", path: "/dashboard/payments" },
  { icon: Zap,             label: "Campaigns",       path: "/dashboard/campaigns" },
  { icon: Link2,           label: "Gateways",        path: "/dashboard/gateways" },
  { icon: BarChart3,       label: "Analytics",       path: "/dashboard/analytics" },
  { icon: Settings,        label: "Settings",        path: "/dashboard/settings" },
];

interface UserInfo {
  fullName: string;
  email: string;
  initials: string;
  role: string;
  plan: string;
  trialDaysLeft: number | null;
}

interface DashboardSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function DashboardSidebar({ collapsed, onToggle }: DashboardSidebarProps) {
  const pathname = usePathname() || "";
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.fullName) setUser(data as UserInfo);
      })
      .catch(() => {});
  }, []);

  const trialBadge =
    user?.plan === "trial" && user.trialDaysLeft !== null
      ? `Trial: ${user.trialDaysLeft}d left`
      : null;

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen flex-shrink-0 border-r border-border transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hidden md:flex flex-col",
        collapsed ? "w-16" : "w-60"
      )}
      style={{
        background: "rgba(13,17,23,0.8)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
      }}
    >
      {/* Logo */}
      <div className={cn("flex items-center h-14 px-4 border-b border-border", collapsed ? "justify-center" : "justify-between")}>
        <div className="flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
            <path d="M4 18C4 18 8 6 12 6C16 6 20 18 20 18" stroke="hsl(var(--accent-green))" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M16 10L20 6L16 8" stroke="hsl(var(--accent-green))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!collapsed && (
            <span className="font-heading font-bold text-rx-text-primary text-base tracking-tight">
              FynBack
            </span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1 rounded-md hover:bg-rx-overlay text-rx-text-muted hover:text-rx-text-secondary transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <TooltipProvider delay={0}>
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.path ||
              (item.path !== "/dashboard" && pathname.startsWith(item.path));
            const Icon = item.icon;

            const link = (
              <NavLink
                key={item.path}
                href={item.path}
                exact={item.path === "/dashboard"}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-body font-medium transition-all duration-150",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-rx-blue-dim text-rx-blue border-l-2 border-rx-blue rounded-l-none"
                    : "text-rx-text-secondary hover:bg-rx-overlay hover:text-rx-text-primary"
                )}
              >
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger render={<span />}>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }
            return link;
          })}
        </nav>
      </TooltipProvider>

      {/* Collapse button when collapsed */}
      {collapsed && (
        <div className="px-2 py-2 border-t border-border">
          <button
            onClick={onToggle}
            className="w-full flex justify-center p-2 rounded-md hover:bg-rx-overlay text-rx-text-muted hover:text-rx-text-secondary transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* User section */}
      <div className={cn("border-t border-border p-3", collapsed && "flex flex-col items-center")}>
        {/* Trial badge */}
        {!collapsed && trialBadge && (
          <div className="mb-2 px-2 py-1 rounded-md bg-rx-amber-dim text-rx-amber text-xs font-body font-medium text-center">
            {trialBadge}
          </div>
        )}

        <div className={cn("flex items-center gap-3", collapsed && "flex-col")}>
          {/* Avatar */}
          {user ? (
            <div className="w-8 h-8 rounded-lg bg-rx-blue-dim text-rx-blue flex items-center justify-center font-heading font-bold text-xs flex-shrink-0">
              {user.initials || "?"}
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-rx-overlay animate-[skeleton-pulse_2s_ease-in-out_infinite] flex-shrink-0" />
          )}

          {/* Name + role */}
          {!collapsed && (
            <div className="min-w-0">
              {user ? (
                <>
                  <p className="text-sm font-heading font-semibold text-rx-text-primary truncate">
                    {user.fullName}
                  </p>
                  <p className="text-xs font-body text-rx-text-muted capitalize">{user.role}</p>
                </>
              ) : (
                <>
                  <div className="h-3.5 w-24 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite] mb-1" />
                  <div className="h-3 w-14 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
