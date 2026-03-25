"use client";

/**
 * components/NavLink.tsx
 *
 * A Next.js Link wrapper that adds `data-active` when the current pathname
 * matches the href. Used by DashboardSidebar to style the active nav item.
 *
 * WHY NOT use Next.js Link directly?
 * Link doesn't expose a prop for active state. We need the active state to
 * apply different CSS classes in the sidebar (background, text color).
 * A thin wrapper keeps the sidebar clean — no usePathname logic scattered there.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

interface NavLinkProps extends ComponentPropsWithoutRef<typeof Link> {
  /** If true, match exactly (default: false — matches /dashboard/payments as child of /dashboard) */
  exact?: boolean;
  activeClassName?: string;
}

export function NavLink({
  href,
  exact = false,
  className,
  activeClassName,
  children,
  ...props
}: NavLinkProps) {
  const pathname = usePathname();
  const hrefStr = href.toString();

  const isActive = exact
    ? pathname === hrefStr
    : pathname === hrefStr || pathname.startsWith(hrefStr + "/");

  return (
    <Link
      href={href}
      className={cn(className, isActive && activeClassName)}
      data-active={isActive ? "true" : undefined}
      aria-current={isActive ? "page" : undefined}
      {...props}
    >
      {children}
    </Link>
  );
}
