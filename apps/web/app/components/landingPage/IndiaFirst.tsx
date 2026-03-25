"use client";

import React from "react";

// SECTION 5 — INDIA-FIRST
const IndiaFirst = () => {
	return (
		<section className="py-[120px] px-6 md:px-20 bg-ink">
			<div className="w-full max-w-[1440px] mx-auto flex flex-col md:flex-row gap-16 md:gap-20 items-center">
				<div className="w-full md:w-[50%] animate-on-scroll">
					<div className="font-mono text-[12px] text-green tracking-[0.1em] mb-4">
						// made for India
					</div>
					<h2 className="font-heading font-bold text-[40px] md:text-[58px] text-white leading-[1.05] mb-8">
						Built around
						<br />
						how India
						<br />
						actually pays.
					</h2>

					<p className="font-body text-[18px] text-silver mb-8 leading-[1.7]">
						Western dunning tools retry payments on Monday at 9am PST.
						<br />
						Your customers get paid on the 1st and the 25th — not on Mondays.
					</p>

					<div className="space-y-4 mb-8">
						<div className="font-body text-[18px] text-white">
							FynBack's retry engine knows:
						</div>
						<div className="font-mono text-[16px] text-silver flex gap-3">
							<span className="text-green">→</span>Government employees: paid on
							the 1st
						</div>
						<div className="font-mono text-[16px] text-silver flex gap-3">
							<span className="text-green">→</span>Private sector: paid on the
							25th–28th
						</div>
						<div className="font-mono text-[16px] text-silver flex gap-3">
							<span className="text-green">→</span>
							<span>
								UPI AutoPay: NPCI mandates max 4 attempts,
								<br />
								non-peak timing windows only
							</span>
						</div>
						<div className="font-mono text-[16px] text-silver flex gap-3">
							<span className="text-green">→</span>
							<span>
								Card failures: retry 3 days after decline,
								<br />
								not 24 hours after
							</span>
						</div>
					</div>

					<div className="font-body font-medium text-[17px] text-white mb-8">
						This is not a setting you configure. It's built in.
					</div>

					<div className="flex flex-wrap gap-2">
						<div className="border border-[rgba(51,149,255,0.3)] bg-[rgba(51,149,255,0.08)] text-[#3395ff] rounded-[4px] font-mono font-medium text-[14px] px-[10px] py-[4px] flex items-center gap-2">
							<span className="text-[10px]">●</span> Razorpay
						</div>
						<div className="border border-[rgba(99,91,255,0.3)] bg-[rgba(99,91,255,0.08)] text-[#635bff] rounded-[4px] font-mono font-medium text-[14px] px-[10px] py-[4px] flex items-center gap-2">
							<span className="text-[10px]">●</span> Stripe
						</div>
						<div className="border border-[rgba(0,194,116,0.3)] bg-[rgba(0,194,116,0.08)] text-[#00c274] rounded-[4px] font-mono font-medium text-[14px] px-[10px] py-[4px] flex items-center gap-2">
							<span className="text-[10px]">●</span> Cashfree
						</div>
						<div className="border border-[rgba(255,107,53,0.3)] bg-[rgba(255,107,53,0.08)] text-[#ff6b35] rounded-[4px] font-mono font-medium text-[14px] px-[10px] py-[4px] flex items-center gap-2">
							<span className="text-[10px]">●</span> PayU
						</div>
					</div>
				</div>

				<div
					className="w-full md:w-[50%] animate-on-scroll"
					style={{ transitionDelay: "200ms" }}
				>
					<div className="bg-surface border border-line rounded-[10px] p-6 max-w-[480px] ml-auto">
						<div className="font-mono text-[14px] text-silver mb-4 uppercase tracking-[0.1em]">
							Calendar
						</div>
						<div className="grid grid-cols-7 gap-2 mb-6">
							{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
								<div
									key={i}
									className="text-center font-mono text-[12px] text-silver"
								>
									{d}
								</div>
							))}
							{Array.from({ length: 31 }).map((_, i) => {
								const day = i + 1;
								const isPayday = [1, 2, 3, 25, 26, 27, 28].includes(day);
								return (
									<div
										key={i}
										className={`h-[36px] w-full rounded-[6px] flex items-center justify-center font-mono text-[12px] relative ${isPayday ? "bg-[var(--green-dim)] border border-[var(--green-line)] text-green cursor-help group" : "text-silver"}`}
									>
										{day}
										{isPayday && (
											<span className="absolute top-[2px] right-[2px] text-[8px]">
												↑
											</span>
										)}
										{isPayday && (
											<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[200px] bg-ink border border-line text-silver p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-[12px] text-center">
												{day <= 3
													? "Govt salary credited · Best retry window"
													: "Private sector salary · Best retry window"}
											</div>
										)}
									</div>
								);
							})}
						</div>

						<div className="font-mono text-[14px] text-silver space-y-2">
							<p>
								FynBack scheduled 47 retries
								<br />
								around payday windows this month.
							</p>
							<p className="text-green text-[15px] mt-4">
								₹38,200 in additional recovery
								<br />
								vs random retry scheduling.
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};

export default IndiaFirst;
