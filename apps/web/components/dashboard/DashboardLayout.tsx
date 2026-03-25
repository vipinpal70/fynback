"use client";

import { useState, ReactNode } from "react";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardHeader } from "./DashboardHeader";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/utils";

export function DashboardLayout({ children }: { children?: ReactNode }) {
	const [collapsed, setCollapsed] = useState(false);

	return (
		<div className="min-h-screen bg-background dot-grid">
			<DashboardSidebar
				collapsed={collapsed}
				onToggle={() => setCollapsed(!collapsed)}
			/>
			<MobileNav />
			<div
				className={cn(
					"transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
					collapsed ? "md:ml-16" : "md:ml-60",
				)}
			>
				<DashboardHeader />
				<main className="p-4 md:p-6 pb-20 md:pb-6">{children}</main>
			</div>
		</div>
	);
}
