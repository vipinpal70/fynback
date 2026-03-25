"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export default function HeaderComponent() {
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		document.body.style.overflow = isOpen ? "hidden" : "";
	}, [isOpen]);

	return (
		<>
			{/* NAVBAR */}
			<nav className="sticky top-0 z-[1001] h-[60px] bg-[#08090c]/85 backdrop-blur-[8px] border-b border-line px-6 md:px-10 flex items-center justify-between">
				<Link href="/" className="flex items-center gap-1.5" aria-label="FynBack Home">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="var(--green)"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="18 15 12 9 6 15"></polyline>
						<line x1="12" y1="9" x2="12" y2="21"></line>
					</svg>
					<span className="font-heading font-semibold text-[20px] text-white tracking-[-0.5px]">
						FynBack
					</span>
				</Link>

				{/* DESKTOP MENU */}
				<div className="hidden md:flex items-center gap-8 text-[16px] text-silver">
					<a href="#how-it-works" className="hover:text-white">
						How it works
					</a>
					<a href="#integrations" className="hover:text-white">
						Integrations
					</a>
					<a href="#pricing" className="hover:text-white">
						Pricing
					</a>
					<a href="#blog" className="hover:text-white">
						Blog
					</a>
				</div>

				<div className="hidden md:flex items-center gap-4">
					<Link href="/dashboard" className="text-silver hover:text-green">
						Sign in
					</Link>
					<span className="text-silver">|</span>
					<Link
						href="/dashboard"
						className="text-green bg-[var(--green-dim)] border border-[var(--green-line)] px-4 py-1.5 rounded-[6px]"
					>
						Get started free
					</Link>
				</div>

				{/* MOBILE TOGGLE — single button in navbar, swaps between Menu and X */}
				<button
					className="md:hidden text-silver hover:text-white"
					onClick={() => setIsOpen((o) => !o)}
					aria-label={isOpen ? "Close menu" : "Open menu"}
				>
					{isOpen ? <X size={28} /> : <Menu size={28} />}
				</button>
			</nav>

			{/* MOBILE MENU OVERLAY — sits below the sticky navbar (pt-[60px]) */}
			{isOpen && (
				<div className="fixed inset-0 z-[1000] bg-black pt-[60px] flex flex-col">
					<div className="flex flex-col items-center justify-center flex-1 gap-10 text-[28px] font-semibold text-white">
						<a href="#how-it-works" onClick={() => setIsOpen(false)}>
							How it works
						</a>
						<a href="#integrations" onClick={() => setIsOpen(false)}>
							Integrations
						</a>
						<a href="#pricing" onClick={() => setIsOpen(false)}>
							Pricing
						</a>
						<a href="#blog" onClick={() => setIsOpen(false)}>
							Blog
						</a>
						<Link
							href="/dashboard"
							onClick={() => setIsOpen(false)}
							className="mt-6 text-green font-bold"
						>
							Sign in
						</Link>
					</div>
				</div>
			)}
		</>
	);
}
