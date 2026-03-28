"use client";

import React from "react";

// SECTION 6 — WHATSAPP
const WhatsAppSpotlight = () => {
	return (
		<section className="py-[120px] px-6 bg-black text-center box-border">
			<div className="w-full max-w-[800px] mx-auto animate-on-scroll">
				<div className="font-mono text-[15px] text-silver mb-4">
					// channel performance
				</div>
				<h2 className="font-heading font-semibold text-[32px] md:text-[42px] text-white leading-[1.2] mb-6">
					Email open rate in India: 22%.
					<br />
					WhatsApp open rate: <span className="text-green">95%</span>.
				</h2>

				<p className="font-body text-[17px] text-silver max-w-[600px] mx-auto mb-16">
					FynBack sends pre-approved WhatsApp Business messages with direct UPI
					re-authentication links. No login. One tap.
					<br />
					<br />
					Your customer gets a message that looks like this:
				</p>

				{/* iPhone Frame */}
				<div className="w-[280px] h-[560px] bg-[#1a1a1a] rounded-[44px] mx-auto relative p-[8px] shadow-2xl flex flex-col border border-[#333] mb-12">
					{/* Notch */}
					<div className="absolute top-[8px] left-1/2 -translate-x-1/2 w-[80px] h-[24px] bg-[#0a0a0a] rounded-b-[16px] rounded-t-[34px] z-20 flex justify-center items-center">
						<div className="w-[36px] h-[4px] rounded-full bg-[#1a1a1a]"></div>
					</div>

					{/* Screen */}
					<div className="flex-1 bg-[#0b1117] rounded-[36px] overflow-hidden flex flex-col relative w-full h-full border border-black">
						{/* Status Bar */}
						<div className="h-[44px] bg-[#1f2c34] flex justify-between items-end px-6 pb-2 text-[11px] font-medium text-white z-10 font-mono">
							<div>9:42</div>
							<div className="flex gap-1.5 items-center">
								<div className="flex items-end gap-[1px] h-[10px] pb-[1px]">
									<div className="w-[2.5px] h-[4px] bg-white"></div>
									<div className="w-[2.5px] h-[6px] bg-white"></div>
									<div className="w-[2.5px] h-[8px] bg-white"></div>
									<div className="w-[2.5px] h-[10px] bg-white/40"></div>
								</div>
								<div className="w-[18px] h-[10px] rounded-[3px] border border-white/60 p-[1px] flex relative ml-0.5">
									<div className="bg-white w-[12px] h-full rounded-[1px]"></div>
									<div className="absolute right-[-2.5px] top-1/2 -translate-y-1/2 w-[1.5px] h-[4px] bg-white/60 rounded-r-full"></div>
								</div>
							</div>
						</div>

						{/* WA Header */}
						<div className="bg-[#1f2c34] px-4 py-2 flex gap-3 items-center border-b border-[#2a3942] z-10 shrink-0 text-left">
							<div className="w-[36px] h-[36px] rounded-full bg-[#00a884] flex items-center justify-center text-white font-semibold text-[14px]">
								AS
							</div>
							<div className="flex-1">
								<div className="text-[15px] text-white font-medium flex items-center gap-1 leading-tight">
									AcmeSaaS Billing
									<div className="w-3 h-3 rounded-full bg-[#00a884] flex items-center justify-center shrink-0">
										<svg
											width="8"
											height="8"
											viewBox="0 0 24 24"
											fill="none"
											stroke="white"
											strokeWidth="3"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<polyline points="20 6 9 17 4 12"></polyline>
										</svg>
									</div>
								</div>
								<div className="text-[12px] text-[#8696a0] mt-0.5">
									Official Business Account
								</div>
							</div>
						</div>

						{/* Chat Area */}
						<div className="wa-bg-tile flex-1 p-4 relative flex flex-col z-0 overflow-hidden isolate">
							<div className="mt-8">
								<div className="wa-message-bubble bg-[#1f2c34] rounded-[8px] rounded-tl-[0] p-[12px] shadow-sm animate-message-pop origin-top-left text-left max-w-[95%]">
									<div className="font-body text-[13px] text-[#e9edef] leading-[1.4] space-y-2">
										<div className="font-semibold text-white">
											Billing update from AcmeSaaS
										</div>
										<p>
											Hi Priya 👋, there was an issue processing your ₹12,800
											payment for the Growth plan.
										</p>
										<p>
											Your access continues until Mar 28. Please update your
											payment method to avoid interruption.
										</p>
										<button className="w-full bg-[#00a884] text-black font-medium text-[13px] py-1.5 rounded-[6px] mt-2 border-none">
											Update payment →
										</button>
									</div>
								</div>
								<div className="flex items-center gap-2 mt-2 px-1 animate-fade-in-delayed text-left">
									<span className="text-silver text-[11px] font-body">
										Opened in 4 minutes
									</span>
									<span className="text-[#53bdeb] text-[15px] tracking-[-4px]">
										✓✓
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Comparison Bars */}
				<div className="max-w-[560px] mx-auto text-left">
					<div className="mb-6">
						<div className="flex justify-between font-mono text-[14px] mb-2">
							<span className="text-silver">Email</span>
							<span className="text-white">22% open rate</span>
						</div>
						<div className="h-[6px] bg-[#1a1a1a] rounded-full overflow-hidden w-full relative">
							<div className="h-full bg-steel rounded-full bar-email"></div>
						</div>
					</div>
					<div>
						<div className="flex justify-between font-mono text-[14px] mb-2">
							<span className="text-green">WhatsApp</span>
							<span className="text-white">95% open rate</span>
						</div>
						<div className="h-[6px] bg-[#1a1a1a] rounded-full overflow-hidden w-full relative">
							<div className="h-full bg-green rounded-full bar-wa"></div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};

export default WhatsAppSpotlight;
