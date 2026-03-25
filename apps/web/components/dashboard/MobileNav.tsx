"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, CreditCard, Zap, Link2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { icon: LayoutDashboard, label: "Overview", path: "/dashboard" },
  { icon: CreditCard, label: "Payments", path: "/dashboard/payments" },
  { icon: Zap, label: "Campaigns", path: "/dashboard/campaigns" },
  { icon: Link2, label: "Gateways", path: "/dashboard/gateways" },
  { icon: Settings, label: "Settings", path: "/dashboard/settings" },
];

export function MobileNav() {
  const pathname = usePathname() || "";
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden h-16 bg-rx-surface/80 backdrop-blur-[20px] border-t border-border">
      <div className="flex items-center justify-around h-full">
        {items.map((item) => {
          const active = pathname === item.path || (item.path === "/dashboard" && pathname === "/dashboard");
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              href={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-16 h-full transition-transform duration-150 active:scale-90",
                active ? "text-rx-blue" : "text-rx-text-muted"
              )}
            >
              <Icon size={active ? 20 : 22} />
              {active && <span className="text-[11px] font-body leading-none">{item.label}</span>}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
