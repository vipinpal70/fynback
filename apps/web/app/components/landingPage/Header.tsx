"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export default function HeaderComponent() {
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
	}, [isOpen]);

	return (
		<>
			{/* NAVBAR */}
			<nav className="sticky top-0 z-50 h-[60px] bg-[#08090c]/85 backdrop-blur-[8px] border-b border-line px-6 md:px-10 flex items-center justify-between">
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

				{/* MOBILE BUTTON */}
				<button
					className="md:hidden p-6 -mr-6 text-silver hover:text-white relative z-[999] touch-manipulation"
					onClick={(e) => {
						e.preventDefault();
						console.log("Menu button clicked");
						setIsOpen(true);
					}}
					onTouchStart={(e) => {
						e.preventDefault();
						console.log("Menu button touched");
						setIsOpen(true);
					}}
					aria-label="Open menu"
					style={{
						minHeight: "48px",
						minWidth: "48px",
						position: "relative",
						zIndex: 9999,
					}}
				>
					<Menu size={28} />
				</button>
			</nav>

			{/* MOBILE MENU */}
			{isOpen && (
				<div className="fixed inset-0 z-[1000] bg-black flex flex-col">
					{/* CLOSE BUTTON */}
					<div className="flex justify-end p-6">
						<button
							onClick={(e) => {
								e.preventDefault();
								console.log("Close button clicked");
								setIsOpen(false);
							}}
							onTouchStart={(e) => {
								e.preventDefault();
								console.log("Close button touched");
								setIsOpen(false);
							}}
							className="p-6 -mr-6 text-silver hover:text-white relative z-[1001] touch-manipulation"
							aria-label="Close menu"
							style={{
								minHeight: "48px",
								minWidth: "48px",
								position: "relative",
								zIndex: 10002,
							}}
						>
							<X size={32} />
						</button>
					</div>

					{/* MENU ITEMS */}
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
