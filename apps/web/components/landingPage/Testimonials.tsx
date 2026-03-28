"use client";

import React from "react";

// SECTION 7 — SOCIAL PROOF
const Testimonials = () => {
	return (
		<section className="py-[120px] px-6 md:px-20 bg-ink">
			<div className="w-full max-w-[1440px] mx-auto">
				<div className="font-mono text-[15px] text-silver mb-4">
					// founders.log
				</div>
				<h2 className="font-heading font-semibold text-[32px] md:text-[42px] text-white leading-[1.2] mb-12">
					What recovery looks like in practice.
				</h2>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{/* Card 1 */}
					<div className="bg-surface border border-line rounded-[8px] p-6 lg:p-7 font-mono animate-on-scroll">
						<div className="text-silver text-[14px] lg:text-[15px] mb-6">
							// rahul-mehta · edtech-saas.in · growth-plan
						</div>
						<div className="text-[14px] lg:text-[15px] space-y-1 mb-8">
							<div>
								<span className="text-silver inline-block w-[70px]">
									before:
								</span>
								<span className="text-red">₹18,400/mo recovered</span>{" "}
								<span className="text-silver">(razorpay default only)</span>
							</div>
							<div>
								<span className="text-silver inline-block w-[70px]">
									after:
								</span>
								<span className="text-green">₹62,700/mo recovered</span>{" "}
								<span className="text-silver">(with FynBack, month 1)</span>
							</div>
							<div>
								<span className="text-silver inline-block w-[70px]">
									delta:
								</span>
								<span className="text-green font-medium">+₹44,300/mo</span>
							</div>
						</div>
						<p className="font-body text-[16px] lg:text-[17px] text-silver italic leading-[1.6] mb-6">
							"We were losing money to failed payments for 14 months without
							knowing how much. FynBack showed us the real number in the first 5
							minutes."
						</p>
						<div className="text-[14px] lg:text-[15px]">
							<div className="text-silver">— Rahul M., Co-founder</div>
							<div className="text-green pl-4 mt-1">
								recovered: ₹5.3L in 4 months
							</div>
						</div>
					</div>

					{/* Card 2 */}
					<div
						className="bg-surface border border-line rounded-[8px] p-6 lg:p-7 font-mono animate-on-scroll"
						style={{ transitionDelay: "100ms" }}
					>
						<div className="text-silver text-[14px] lg:text-[15px] mb-6">
							// anjali-s · hrms-platform.in · scale-plan
						</div>
						<div className="text-[14px] lg:text-[15px] space-y-1 mb-8">
							<div>
								<span className="text-silver inline-block w-[70px]">
									before:
								</span>
								<span className="text-red">₹42,000/mo recovered</span>{" "}
								<span className="text-silver">(stripe default + manual)</span>
							</div>
							<div>
								<span className="text-silver inline-block w-[70px]">
									after:
								</span>
								<span className="text-green">₹1,85,000/mo recovered</span>{" "}
								<span className="text-silver">(with FynBack, month 3)</span>
							</div>
							<div>
								<span className="text-silver inline-block w-[70px]">
									delta:
								</span>
								<span className="text-green font-medium">+₹1,43,000/mo</span>
							</div>
						</div>
						<p className="font-body text-[16px] lg:text-[17px] text-silver italic leading-[1.6] mb-6">
							"The WhatsApp integration changed everything. We stopped sending
							emails entirely. Pre-approved UPI links via WhatsApp convert at
							80% for us now."
						</p>
						<div className="text-[14px] lg:text-[15px]">
							<div className="text-silver">— Anjali S., VP Finance</div>
							<div className="text-green pl-4 mt-1">
								recovered: ₹18L in 10 months
							</div>
						</div>
					</div>

					{/* Card 3 */}
					<div
						className="bg-surface border border-line rounded-[8px] p-6 lg:p-7 font-mono animate-on-scroll"
						style={{ transitionDelay: "200ms" }}
					>
						<div className="text-silver text-[14px] lg:text-[15px] mb-6">
							// deepak-v · developer-api.co · growth-plan
						</div>
						<div className="text-[14px] lg:text-[15px] space-y-1 mb-8">
							<div>
								<span className="text-silver inline-block w-[70px]">
									before:
								</span>
								<span className="text-red">₹8,200/mo recovered</span>{" "}
								<span className="text-silver">(cashfree default)</span>
							</div>
							<div>
								<span className="text-silver inline-block w-[70px]">
									after:
								</span>
								<span className="text-green">₹38,000/mo recovered</span>{" "}
								<span className="text-silver">(with FynBack, month 2)</span>
							</div>
							<div>
								<span className="text-silver inline-block w-[70px]">
									delta:
								</span>
								<span className="text-green font-medium">+₹29,800/mo</span>
							</div>
						</div>
						<p className="font-body text-[16px] lg:text-[17px] text-silver italic leading-[1.6] mb-6">
							"Setup took exactly 8 minutes. Connected the Razorpay integration
							and it instantly found ₹2.2L at risk. Paid for itself on day 1."
						</p>
						<div className="text-[14px] lg:text-[15px]">
							<div className="text-silver">— Deepak V., Founder</div>
							<div className="text-green pl-4 mt-1">
								recovered: ₹1.4L in 2 months
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};

export default Testimonials;
