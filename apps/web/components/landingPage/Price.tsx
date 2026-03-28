"use client";
import React, { useState } from "react";

// SECTION 9 — PRICING
export default function Pricing() {
	const [isAnnual, setIsAnnual] = useState(false);

	return (
		<section id="pricing" className="py-[120px] px-8 bg-ink text-center">
			<div className="w-full max-w-[1100px] mx-auto">
				<div className="animate-on-scroll">
					<div className="font-mono text-[15px] text-silver mb-4">
						// pricing.config
					</div>
					<h2 className="font-heading font-semibold text-[44px] md:text-[54px] text-white leading-[1.1] mb-4">
						Pays for itself on day one.
					</h2>
					<p className="font-body text-[18px] text-silver mb-10">
						Every plan includes a 14-day free trial. No credit card.
					</p>

					<div className="inline-flex items-center bg-surface border border-line rounded-full p-1 mb-16 relative z-[60]">
						<button
							className={`px-6 py-2 rounded-full font-body text-[16px] font-medium transition-colors cursor-pointer ${!isAnnual ? "bg-line text-white" : "text-silver hover:text-white"}`}
							onClick={() => setIsAnnual(false)}
						>
							Monthly
						</button>
						<button
							className={`px-6 py-2 rounded-full font-body text-[16px] font-medium transition-colors flex items-center gap-2 cursor-pointer ${isAnnual ? "bg-line text-white" : "text-silver hover:text-white"}`}
							onClick={() => setIsAnnual(true)}
						>
							Annual{" "}
							<span className="bg-[var(--green-dim)] text-green text-[10px] uppercase px-2 py-0.5 rounded-full font-bold">
								Save 20%
							</span>
						</button>
					</div>
				</div>

				<div className="flex flex-col md:flex-row gap-6 text-left">
					{/* Starter */}
					<div className="flex-1 bg-surface border border-line rounded-[10px] p-8 animate-on-scroll transition-all duration-300">
						<div className="font-mono font-semibold text-[15px] text-silver uppercase tracking-[0.1em] mb-4">
							STARTER
						</div>
						<div className="font-heading font-bold text-[54px] text-white flex items-center mb-[20px] mt-2 h-[76px]">
							{isAnnual && (
								<span className="text-silver line-through decoration-red/60 text-[26px] mr-3 font-medium transition-opacity duration-300 animate-fade-in self-center mt-2">
									₹2,999
								</span>
							)}
							<span className="font-mono text-[24px] text-silver mr-1 self-start mt-4">
								₹
							</span>
							<div className="relative overflow-hidden h-full inline-block">
								<div
									className={`transition-transform duration-500 ease-in-out flex flex-col ${isAnnual ? "-translate-y-1/2" : "translate-y-0"}`}
								>
									<div className="h-[76px] flex items-center justify-center leading-none">
										2,999
									</div>
									<div className="h-[76px] flex items-center justify-center leading-none text-green">
										2,399
									</div>
								</div>
							</div>
							<span className="font-body text-[18px] font-normal text-silver ml-1 self-end mb-3">
								/mo
							</span>
						</div>
						<div className="font-mono text-[14px] text-silver mb-8">
							Up to ₹2L MRR
						</div>

						<div className="font-body text-[16px] text-silver leading-[2] space-y-1 mb-8">
							<div className="flex gap-3">
								<span className="text-green">→</span> Razorpay + Stripe
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> 3-email dunning sequence
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> Smart retry scheduling
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> Basic analytics
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> Email support
							</div>
						</div>

						<button className="w-full bg-transparent border border-[var(--line-hi)] text-silver font-body font-medium rounded-[6px] py-3 mt-[32px] hover:text-white hover:border-silver transition-colors">
							Start free trial
						</button>
					</div>

					{/* Growth */}
					<div
						className="flex-1 rounded-[10px] p-8 relative border border-[var(--green-line)] bg-gradient-to-b from-[rgba(0,232,120,0.04)] to-[var(--surface)] hover:border-[#4d9fff] hover:shadow-[0_0_30px_rgba(77,159,255,0.15)] transition-all duration-300 animate-on-scroll"
						style={{ transitionDelay: "100ms" }}
					>
						<div className="absolute -top-[14px] left-1/2 -translate-x-1/2 font-mono font-medium text-[12px] text-green border border-[var(--green-line)] bg-black rounded-[20px] px-3 py-1">
							Most popular
						</div>
						<div className="font-mono font-semibold text-[15px] text-silver uppercase tracking-[0.1em] mb-4">
							GROWTH
						</div>
						<div className="font-heading font-bold text-[54px] text-white flex items-center mb-[20px] mt-2 h-[76px]">
							{isAnnual && (
								<span className="text-silver line-through decoration-red/60 text-[26px] mr-3 font-medium transition-opacity duration-300 animate-fade-in self-center mt-2">
									₹6,999
								</span>
							)}
							<span className="font-mono text-[24px] text-silver mr-1 self-start mt-4">
								₹
							</span>
							<div className="relative overflow-hidden h-full inline-block">
								<div
									className={`transition-transform duration-500 ease-in-out flex flex-col ${isAnnual ? "-translate-y-1/2" : "translate-y-0"}`}
								>
									<div className="h-[76px] flex items-center justify-center leading-none">
										6,999
									</div>
									<div className="h-[76px] flex items-center justify-center leading-none text-green">
										5,599
									</div>
								</div>
							</div>
							<span className="font-body text-[18px] font-normal text-silver ml-1 self-end mb-3">
								/mo
							</span>
						</div>
						<div className="font-mono text-[14px] text-silver mb-8">
							Up to ₹10L MRR
						</div>

						<div className="font-body text-[16px] text-silver leading-[2] space-y-1 mb-8">
							<div className="flex gap-3">
								<span className="text-green">→</span> Everything in Starter
							</div>
							<div className="flex gap-3">
								<span className="text-green font-bold">→</span>{" "}
								<span className="text-white font-medium">
									WhatsApp Business recovery
								</span>
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> SMS via MSG91
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> Cashfree + PayU
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> Campaign editor + A/B test
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> Subscription pause flow
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> Priority support
							</div>
						</div>

						<button className="w-full bg-green text-black font-body font-bold rounded-[6px] py-3 mt-auto hover:bg-[#00ff88] transition-colors">
							Start free trial
						</button>
					</div>

					{/* Scale */}
					<div
						className="flex-1 bg-surface border border-line rounded-[10px] p-8 animate-on-scroll transition-all duration-300"
						style={{ transitionDelay: "200ms" }}
					>
						<div className="font-mono font-semibold text-[15px] text-silver uppercase tracking-[0.1em] mb-4">
							SCALE
						</div>
						<div className="font-heading font-bold text-[54px] text-white flex items-center mb-[20px] mt-2 h-[76px]">
							{isAnnual && (
								<span className="text-silver line-through decoration-red/60 text-[26px] mr-3 font-medium transition-opacity duration-300 animate-fade-in self-center mt-2">
									₹14,999
								</span>
							)}
							<span className="font-mono text-[24px] text-silver mr-1 self-start mt-4">
								₹
							</span>
							<div className="relative overflow-hidden h-full inline-block">
								<div
									className={`transition-transform duration-500 ease-in-out flex flex-col ${isAnnual ? "-translate-y-1/2" : "translate-y-0"}`}
								>
									<div className="h-[76px] flex items-center justify-center leading-none">
										14,999
									</div>
									<div className="h-[76px] flex items-center justify-center leading-none text-green">
										11,999
									</div>
								</div>
							</div>
							<span className="font-body text-[18px] font-normal text-silver ml-1 self-end mb-3">
								/mo
							</span>
						</div>
						<div className="font-mono text-[14px] text-silver mb-8">
							Unlimited MRR
						</div>

						<div className="font-body text-[16px] text-silver leading-[2] space-y-1 mb-8">
							<div className="flex gap-3">
								<span className="text-green">→</span> Everything in Growth
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> AI email copy variants
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> Customer segmentation
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> Dedicated Slack channel
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> White-label emails
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> SLA guarantee
							</div>
							<div className="flex gap-3">
								<span className="text-green">→</span> Quarterly strategy call
							</div>
						</div>

						<button className="w-full bg-transparent border border-[var(--line-hi)] text-silver font-body font-medium rounded-[6px] py-3 mt-[32px] hover:text-white hover:border-silver transition-colors">
							Talk to us
						</button>
					</div>
				</div>

				<div className="mt-16 font-body text-[16px] italic text-silver">
					All plans recover what they cost — or we give you a month free.
				</div>
			</div>
		</section>
	);
}
