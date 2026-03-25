export default function ProblemStatement() {
	return (
		<section className="py-16 md:py-[120px] px-6 md:px-20 bg-black">
			<div className="w-full max-w-[1440px] mx-auto flex flex-col md:flex-row gap-12 md:gap-20">
				<div className="w-full md:w-[60%] animate-on-scroll">
					<div className="font-mono font-bold text-[42px] sm:text-[60px] md:text-[90px] text-red leading-none mb-4">
						₹1,300 Cr
					</div>
					<div className="font-heading font-medium text-[24px] sm:text-[32px] md:text-[36px] text-white leading-[1.2] mb-8">
						lost to failed payments <br className="hidden sm:block" />
						by Indian SaaS companies <br className="hidden sm:block" />
						every year.
					</div>

					<div className="font-body text-[16px] md:text-[17px] text-silver max-w-[520px] leading-[1.8] space-y-5">
						<p>
							Your payment gateway sends you a webhook when a payment fails.
							Then it tries once more, maybe twice, then gives up.
						</p>
						<p>That's it. That's all Razorpay does for you by default.</p>
						<p>
							Meanwhile, 68% of those failures were recoverable. Someone's card
							expired. Someone's UPI balance was low on the 18th but full on the
							25th. Someone just needed a message.
						</p>
						<p className="text-white font-medium">
							FynBack is the layer that should have been built into your gateway
							but wasn't.
						</p>
					</div>
				</div>

				<div
					className="w-full md:w-[40%] animate-on-scroll"
					style={{ transitionDelay: "200ms" }}
				>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-0 font-mono border border-line rounded-xl overflow-hidden sm:border-none p-2">
						<div className="p-6 sm:p-0 sm:pr-6 border-b sm:border-b-0 sm:border-r border-line pb-8">
							<div className="text-[12px] text-silver/60 uppercase tracking-[0.1em] font-medium mb-3">
								WITHOUT FynBack
							</div>
							<div className="h-[1px] w-full bg-line mb-4"></div>

							<div className="mb-6">
								<div className="text-red text-[15px] mb-1">1 retry attempt</div>
								<div className="text-silver/40 text-[15px]">via processor</div>
							</div>
							<div className="mb-6">
								<div className="text-red text-[15px] mb-1">38%</div>
								<div className="text-silver/60 text-[15px]">recovery rate</div>
							</div>
							<div className="mb-6">
								<div className="text-red text-[15px] mb-1">₹0 WhatsApp</div>
								<div className="text-silver/60 text-[15px]">no WA outreach</div>
							</div>
							<div className="mb-6">
								<div className="text-red text-[15px] mb-1">Stripe only</div>
								<div className="text-silver/40 text-[15px]">
									siloed recovery
								</div>
							</div>
							<div>
								<div className="text-red text-[15px] mb-1">₹61,600</div>
								<div className="text-silver/60 text-[15px]">
									monthly recovered
								</div>
							</div>
						</div>
						<div className="p-6 sm:p-0 sm:pl-6 pb-8">
							<div className="text-[12px] text-silver/60 uppercase tracking-[0.1em] font-medium mb-3">
								WITH FynBack
							</div>
							<div className="h-[1px] w-full bg-line mb-4"></div>

							<div className="mb-6">
								<div className="text-green text-[15px] mb-1">
									Smart retry engine
								</div>
								<div className="text-silver/60 text-[15px]">
									payday-cycle aware
								</div>
							</div>
							<div className="mb-6">
								<div className="text-green text-[15px] mb-1">78%</div>
								<div className="text-silver/60 text-[15px]">recovery rate</div>
							</div>
							<div className="mb-6">
								<div className="text-green text-[15px] mb-1">₹1,00,800/mo</div>
								<div className="text-silver/60 text-[15px]">
									recovered via WhatsApp
								</div>
							</div>
							<div className="mb-6">
								<div className="text-[15px] text-green mb-1 mb-1">
									Razorpay + Stripe
								</div>
								<div className="text-silver/60 text-[15px]">
									+ Cashfree + PayU
								</div>
							</div>
							<div>
								<div className="text-green text-[15px] mb-1">₹2,40,000</div>
								<div className="text-silver/60 text-[15px]">
									monthly recovered
								</div>
							</div>
						</div>
					</div>
					<div className="mt-6 sm:mt-4 font-mono font-medium text-[16px] sm:text-[17px] text-green">
						+₹1,78,400/month. That's what the gap costs.
					</div>
				</div>
			</div>
		</section>
	);
}
