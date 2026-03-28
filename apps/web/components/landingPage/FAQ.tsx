export default function FAQ() {
	const faqs = [
		{
			q: "How does FynBack connect to Razorpay?",
			a: "Through Razorpay's OAuth partner API. You approve once. We never see your password.",
		},
		{
			q: "Do customers know their payment failed before I do?",
			a: "No. All emails and WhatsApp messages come from your brand.",
		},
		{
			q: "What about UPI AutoPay?",
			a: "NPCI allows max 4 attempts with timing rules. We follow them. Plus we send a WhatsApp re-auth link.",
		},
		{
			q: "Is my customers' data safe?",
			a: "We never store card numbers, UPI IDs, or CVVs. Zero payment instrument data.",
		},
		{
			q: "What if the payment recovers without FynBack?",
			a: "Only recoveries triggered by FynBack retries or outreach are attributed to us.",
		},
		{
			q: "Can I customise the messages?",
			a: "Yes. The Campaign editor lets you edit copy, timing, and A/B test subject lines.",
		},
	];

	return (
		<section className="py-[120px] px-6 md:px-20 bg-black">
			<div className="w-full max-w-[1000px] mx-auto animate-on-scroll">
				<div className="font-mono text-[15px] text-silver mb-4">// faq</div>
				<h2 className="font-heading font-semibold text-[44px] md:text-[54px] text-white leading-[1.1] mb-12">
					Questions.
				</h2>

				<div className="space-y-0">
					{faqs.map((faq, i) => (
						<div
							key={i}
							className="flex flex-col md:flex-row border-t border-[var(--line)] py-8 hover:bg-[var(--ghost)] transition-colors px-4 -mx-4 group"
						>
							<div className="w-full md:w-1/2 flex items-start gap-6 pr-8 mb-4 md:mb-0">
								<div className="font-mono text-[15px] text-silver pt-1">
									0{i + 1}
								</div>
								<div className="font-body font-medium text-[17px] text-white pt-1">
									{faq.q}
								</div>
							</div>
							<div className="hidden md:block w-[1px] bg-[var(--line)] group-hover:bg-[var(--line-hi)] transition-colors self-stretch mx-4"></div>
							<div className="w-full md:w-1/2 pl-0 md:pl-8 font-body text-[17px] text-silver leading-[1.7] pt-1">
								{faq.a}
							</div>
						</div>
					))}
					<div className="border-t border-[var(--line)]"></div>
				</div>
			</div>
		</section>
	);
}
