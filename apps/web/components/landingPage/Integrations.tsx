import React from "react";

export default function Integrations() {
	return (
		<section id="integrations" className="py-[120px] px-6 md:px-20 bg-black">
			<div className="w-full max-w-[1440px] mx-auto animate-on-scroll">
				<h2 className="font-heading font-semibold text-[44px] md:text-[54px] text-white leading-[1.1] mb-12">
					Connect in 5 minutes.
					<br />
					No engineering needed.
				</h2>

				<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
					{[
						{
							name: "Razorpay",
							style: "text-[#3395ff]",
							desc: "OAuth connect",
						},
						{ name: "Stripe", style: "text-[#635bff]", desc: "Stripe Connect" },
						{ name: "Cashfree", style: "text-[#00c274]", desc: "API keys" },
						{ name: "PayU", style: "text-[#ff6b35]", desc: "API keys" },
					].map((item, i) => (
						<div
							key={i}
							className="bg-ink border border-line rounded-[10px] p-6 h-[100px] flex flex-col justify-between hover:border-[var(--line-hi)] hover:-translate-y-[2px] transition-all cursor-default"
						>
							<div className="flex items-start justify-between">
								<div
									className={`font-mono font-semibold text-[18px] ${item.style}`}
								>
									{item.name}
								</div>
							</div>
							<div className="flex items-center justify-between">
								<div className="font-body text-[14px] text-silver">
									{item.desc}
								</div>
								<div className="flex items-center gap-1.5">
									<div className="w-1.5 h-1.5 rounded-full bg-green"></div>
									<span className="font-mono text-[12px] text-green">
										Supported
									</span>
								</div>
							</div>
						</div>
					))}
				</div>

				<div className="text-center font-body text-[15px] text-silver">
					Also sends via: WhatsApp Business · Email (Resend/SES) · SMS (MSG91)
				</div>
			</div>
		</section>
	);
}
