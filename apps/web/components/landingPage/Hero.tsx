"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";

const ROW_POOL = [
	{
		status: "RCVD",
		amount: "₹14,500",
		gate: "PayU",
		reason: "insufficient",
		email: "arjun@gmail.com",
		time: "just now",
	},
	{
		status: "RCVD",
		amount: "₹9,900",
		gate: "Razorpay",
		reason: "card_expired",
		email: "divya@gmail.com",
		time: "just now",
	},
	{
		status: "RTRY",
		amount: "₹1,200",
		gate: "Stripe",
		reason: "bank_decline",
		email: "suresh@gmail.com",
		time: "retry 3h",
	},
	{
		status: "RCVD",
		amount: "₹3,400",
		gate: "Razorpay",
		reason: "insufficient",
		email: "karan@gmail.com",
		time: "just now",
	},
	{
		status: "RCVD",
		amount: "₹5,500",
		gate: "Stripe",
		reason: "card_expired",
		email: "sneha@gmail.com",
		time: "just now",
	},
	{
		status: "RTRY",
		amount: "₹2,100",
		gate: "Cashfree",
		reason: "upi_failure",
		email: "rohit@app..",
		time: "retry 2h",
	},
	{
		status: "RCVD",
		amount: "₹18,000",
		gate: "PayU",
		reason: "insufficient",
		email: "pooja@st...",
		time: "just now",
	},
	{
		status: "RTRY",
		amount: "₹7,500",
		gate: "Razorpay",
		reason: "bank_decline",
		email: "manish@te...",
		time: "retry 1h",
	},
	{
		status: "RCVD",
		amount: "₹11,200",
		gate: "Stripe",
		reason: "do_not_honor",
		email: "simran@co...",
		time: "just now",
	},
	{
		status: "RCVD",
		amount: "₹4,800",
		gate: "Cashfree",
		reason: "card_expired",
		email: "varun@ap...",
		time: "just now",
	},
	{
		status: "RTRY",
		amount: "₹6,300",
		gate: "PayU",
		reason: "upi_failure",
		email: "neha@st...",
		time: "retry 5h",
	},
	{
		status: "RCVD",
		amount: "₹25,000",
		gate: "Razorpay",
		reason: "insufficient",
		email: "amit@te...",
		time: "just now",
	},
	{
		status: "RCVD",
		amount: "₹8,900",
		gate: "Stripe",
		reason: "bank_decline",
		email: "shikha@co...",
		time: "just now",
	},
	{
		status: "RTRY",
		amount: "₹3,800",
		gate: "Cashfree",
		reason: "do_not_honor",
		email: "rahul@ap...",
		time: "retry 4h",
	},
	{
		status: "RCVD",
		amount: "₹15,600",
		gate: "PayU",
		reason: "card_expired",
		email: "arti@st...",
		time: "just now",
	},
	{
		status: "RCVD",
		amount: "₹1,900",
		gate: "Razorpay",
		reason: "upi_failure",
		email: "vikas@te...",
		time: "just now",
	},
	{
		status: "RTRY",
		amount: "₹9,200",
		gate: "Stripe",
		reason: "insufficient",
		email: "kajal@co...",
		time: "retry 6h",
	},
	{
		status: "RCVD",
		amount: "₹6,700",
		gate: "Cashfree",
		reason: "bank_decline",
		email: "pranav@ap...",
		time: "just now",
	},
	{
		status: "RCVD",
		amount: "₹21,000",
		gate: "PayU",
		reason: "do_not_honor",
		email: "swati@st...",
		time: "just now",
	},
	{
		status: "RTRY",
		amount: "₹4,500",
		gate: "Razorpay",
		reason: "card_expired",
		email: "aditya@te...",
		time: "retry 3h",
	},
	{
		status: "RCVD",
		amount: "₹13,400",
		gate: "Stripe",
		reason: "upi_failure",
		email: "jyoti@co...",
		time: "just now",
	},
];

const LiveFeed = () => {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const [inView, setInView] = useState(true);

	const [rows, setRows] = useState<any[]>([
		{
			id: 1,
			status: "RCVD",
			amount: "₹8,500",
			gate: "Razorpay",
			reason: "card_expired",
			email: "meera@gmail.com",
			time: "2m ago",
		},
		{
			id: 2,
			status: "RCVD",
			amount: "₹12,800",
			gate: "Stripe",
			reason: "insufficient",
			email: "priya@gmail.com",
			time: "4m ago",
		},
		{
			id: 3,
			status: "RTRY",
			amount: "₹3,299",
			gate: "Cashfree",
			reason: "upi_failure",
			email: "raj547@gmail.com",
			time: "retry 4h",
		},
		{
			id: 4,
			status: "RCVD",
			amount: "₹22,000",
			gate: "Stripe",
			reason: "do_not_honor",
			email: "karthik@gmail.com",
			time: "11m ago",
		},
		{
			id: 5,
			status: "RCVD",
			amount: "₹4,999",
			gate: "Razorpay",
			reason: "card_expired",
			email: "rohan@gmail.com",
			time: "14m ago",
		},
		{
			id: 6,
			status: "RTRY",
			amount: "₹6,499",
			gate: "Razorpay",
			reason: "insufficient",
			email: "nisha@gmail.com",
			time: "retry 2h",
		},
		{
			id: 7,
			status: "RCVD",
			amount: "₹49,999",
			gate: "Razorpay",
			reason: "do_not_honor",
			email: "vikram@gmail.com",
			time: "28m ago",
		},
		{
			id: 8,
			status: "RCVD",
			amount: "₹2,999",
			gate: "Cashfree",
			reason: "upi_failure",
			email: "ankita@gmail.com",
			time: "31m ago",
		},
	]);

	const [totalRecovered, setTotalRecovered] = useState(240000);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				setInView(entry.isIntersecting);
			},
			{ threshold: 0.1 },
		);

		if (containerRef.current) {
			observer.observe(containerRef.current);
		}

		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const interval = setInterval(() => {
			if (!inView || document.visibilityState !== "visible") return;

			setRows((prev) => {
				const next = [...prev];
				const randItem = ROW_POOL[Math.floor(Math.random() * ROW_POOL.length)];

				if (next.length >= 8) {
					next[7] = { ...next[7], isExiting: true };
				}

				next.unshift({ ...randItem, id: Date.now(), isNew: true });
				return next;
			});

			setTimeout(() => {
				setRows((current) => {
					return current
						.filter((r) => !r.isExiting)
						.map((r) => ({ ...r, isNew: false }))
						.slice(0, 8);
				});
			}, 300);
		}, 6000);

		const amountInterval = setInterval(() => {
			if (!inView || document.visibilityState !== "visible") return;

			setTotalRecovered(
				(prev) => prev + (Math.floor(Math.random() * 401) + 100) / 100,
			);
		}, 3000);

		return () => {
			clearInterval(interval);
			clearInterval(amountInterval);
		};
	}, [inView]);

	return (
		<div ref={containerRef} className="bg-[var(--ink)] border border-[var(--line-hi)] rounded-[12px] overflow-hidden flex flex-col h-[480px]">
			<div className="h-[40px] bg-surface border-b border-line flex items-center justify-between px-4 sticky top-0 z-20 shrink-0">
				<div className="flex gap-[6px]">
					<div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
					<div className="w-3 h-3 rounded-full bg-[#febc2e]" />
					<div className="w-3 h-3 rounded-full bg-[#28c840]" />
				</div>
				<div className="font-mono text-[14px] text-silver">
					FynBack.com/dashboard · live
				</div>
				<div className="flex items-center">
					<div className="loader" />
				</div>
			</div>

			<div
				className="flex-1 overflow-y-auto overflow-x-auto flex flex-col relative no-scrollbar"
				style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
			>
				<div className="min-w-[600px] flex-1 flex flex-col">
					<div className="px-5 py-3 font-mono text-[12px] text-silver flex justify-between border-b border-line bg-[var(--ink)] sticky top-0 z-10 shrink-0">
						<span>RECOVERY FEED · LIVE </span>
						<span className="text-green">● 3 active retries</span>
					</div>

					<div className="flex-1 relative overflow-hidden">
						<div className="absolute inset-x-0 px-5 flex flex-col pt-2">
							{rows.map((row, i) => (
								<div
									key={row.id || i}
									className={`flex items-center h-[44px] hover:bg-[var(--ghost)] transition-colors shrink-0
										${row.isNew ? "animate-row-enter" : ""} 
										${row.isExiting ? "animate-row-exit" : ""} 
										${row.status === "RCVD" ? "border-l-2 border-[var(--green-dim)] pl-2 -ml-2" : ""} 
										${row.status === "RTRY" ? "amber-pulse-border pl-2 -ml-2" : ""}`}
								>
									<div
										className={`w-[60px] font-mono text-[12px] ${row.status === "RCVD" ? "text-green font-medium" : row.status === "RTRY" ? "text-amber" : "text-red"}`}
									>
										{row.status}
									</div>
									<div
										className={`w-[110px] font-mono text-[17px] font-medium ${row.status === "RCVD" ? "text-green" : row.status === "RTRY" ? "text-amber" : "text-red"}`}
									>
										{row.amount}
									</div>
									<div className="flex-1 font-body text-[14px] text-silver truncate pr-4">
										<span
											className={`text-[10px] ${row.gate.toLowerCase() === "stripe" ? "text-[#635bff]" : row.gate.toLowerCase() === "razorpay" ? "text-[#3395ff]" : row.gate.toLowerCase() === "cashfree" ? "text-[#00c274]" : "text-[#ff6b35]"}`}
										>
											{row.gate}
										</span>
										<span className="text-silver"> · </span>
										{row.reason}
										<span className="text-silver"> · </span>
										{row.email}
									</div>
									<div className="w-[60px] text-right font-mono text-[12px] text-silver shrink-0">
										{row.time}
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			<div className="h-auto md:h-[36px] bg-surface border-t border-line flex flex-col md:flex-row items-center justify-between px-5 py-3 md:py-0 shrink-0 gap-3 md:gap-0">
				<div className="flex items-center gap-2 font-mono text-[11px] md:text-[12px] text-silver">
					<div className="w-2 h-2 rounded-full bg-green animate-[pulse_2s_infinite]" />
					live sync · razorpay · stripe · cashfree
				</div>
				<div className="font-mono text-[13px] md:text-[14px] text-green font-medium">
					₹
					{totalRecovered.toLocaleString("en-IN", {
						minimumFractionDigits: 2,
						maximumFractionDigits: 2,
					})}{" "}
					recovered today
				</div>
			</div>
		</div>
	);
};

function Hero() {
	return (
		<div>
			<section className="min-h-[100svh] flex items-center px-6 lg:px-20 py-10 md:py-4">
				<div className="w-full max-w-[1440px] mx-auto flex flex-col md:flex-row items-center gap-12 lg:gap-16 xl:gap-24">
					<div className="w-full md:w-[62%] lg:w-[58%] xl:w-[55%]">
						<div className="font-mono text-[15px] text-green tracking-[0.05em] mb-6">
							India's first intelligent payment recovery platform
						</div>
						<h1 className="font-heading font-black text-[32px] sm:text-[40px] md:text-[48px] lg:text-[54px] xl:text-[68px] 2xl:text-[82px] text-white leading-[1.08] sm:leading-[1.05] md:leading-[1.02] tracking-[-0.03em] opacity-85">
							Your Payment
							<br />
							failures are
							<br />
							<span className="text-green relative inline-block">
								recoverable.
								<div
									className="absolute bottom-[4px] left-0 right-0 h-[2px] bg-green"
									style={{ marginBottom: "-6px" }}
								></div>
							</span>
						</h1>
						<p className="font-body text-[16px] text-silver max-w-[480px] leading-[1.7] mt-5">
							78% of failed payments can be recovered with the right retry
							timing and the right message. FynBack does both — automatically,
							for Razorpay, Stripe, Cashfree, and PayU.
						</p>

						<div className="mt-8 flex flex-wrap items-center gap-[12px]">
							<Link
								href="/dashboard"
								className="bg-green text-black font-body font-bold text-[16px] px-[28px] py-[12px] rounded-[6px] hover:bg-[#00ff88] hover:-translate-y-[1px] transition-all"
							>
								Start recovering for free
							</Link>
							<button className="text-silver font-body text-[16px] px-4 py-2 hover:text-white transition-colors group flex items-center gap-2">
								See a live demo{" "}
								<span className="group-hover:translate-x-1 transition-transform">
									→
								</span>
							</button>
						</div>

						<div className="mt-[18px] font-body text-[15px] text-silver opacity-85">
							No credit card · 14-day trial · Setup in 8 minutes · SOC2
							compliant
						</div>

						<div className="mt-8 flex flex-row flex-wrap items-center gap-8 md:gap-10 lg:gap-14">
							<div className="flex flex-col">
								<div className="font-mono font-black text-[24px] md:text-[32px] xl:text-[38px] text-green">
									₹12.4Cr
								</div>
								<div className="font-body text-[12px] md:text-[14px] text-silver leading-tight mt-1">
									recovered
									<br />
									this month
								</div>
							</div>
							<div className="hidden sm:block w-[1px] h-[40px] bg-line"></div>
							<div className="flex flex-col">
								<div className="font-mono font-black text-[24px] md:text-[32px] xl:text-[38px] text-green">
									78%
								</div>
								<div className="font-body text-[12px] md:text-[14px] text-silver leading-tight mt-1">
									avg rate
								</div>
							</div>
							<div className="hidden sm:block w-[1px] h-[40px] bg-line"></div>
							<div className="flex flex-col">
								<div className="font-mono font-black text-[24px] md:text-[32px] xl:text-[38px] text-green">
									&lt; 8 min
								</div>
								<div className="font-body text-[12px] md:text-[14px] text-silver leading-tight mt-1">
									setup time
								</div>
							</div>
						</div>
					</div>

					<div
						className="w-full md:w-[38%] lg:w-[42%] xl:w-[45%] h-full flex justify-center"
					>
						<div className="w-full max-w-[640px]">
							<LiveFeed />
						</div>
					</div>
				</div>
			</section>

			{/* Ticker Tape */}
			<div className="h-[48px] bg-ink border-y border-line overflow-hidden flex items-center">
				<div className="ticker-content font-mono text-[12px] text-silver whitespace-nowrap">
					{Array(8)
						.fill(
							"Razorpay · subscription.halted · recovered · Stripe · invoice.payment_failed · recovered · Cashfree · PAYMENT_FAILED · recovered · PayU · transfer_failed · recovered · ",
						)
						.map((text, i) => (
							<span key={i} className="pr-4">
								{text}
							</span>
						))}
				</div>
			</div>
		</div>
	);
}

export default Hero;
