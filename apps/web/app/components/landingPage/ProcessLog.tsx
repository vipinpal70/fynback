"use client";

import React, { useState, useEffect, useRef } from "react";

// SECTION 4 — HOW IT ACTUALLY WORKS
const ProcessLog = () => {
	const [started, setStarted] = useState(false);
	const [revealed, setRevealed] = useState({ block: 0, token: 0, chars: 0 });
	const [isComplete, setIsComplete] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleStart = () => setStarted(true);
		const el = containerRef.current;
		if (el) {
			el.addEventListener("startTypewriter", handleStart);
			if (el.classList.contains("visible")) setStarted(true);
		}
		return () => {
			if (el) el.removeEventListener("startTypewriter", handleStart);
		};
	}, []);

	// Also sync with the visible class being added by the global ScrollObserver
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (
					mutation.type === "attributes" &&
					mutation.attributeName === "class"
				) {
					if (el.classList.contains("visible")) {
						setStarted(true);
					}
				}
			});
		});

		observer.observe(el, { attributes: true });
		return () => observer.disconnect();
	}, []);

	const reset = () => {
		setStarted(false);
		setRevealed({ block: 0, token: 0, chars: 0 });
		setIsComplete(false);
		setTimeout(() => setStarted(true), 10);
	};

	const PROCESS_BLOCKS = [
		[
			{ text: "[09:42:14]", className: "text-silver", speed: 8 },
			{ text: " webhook received from razorpay", className: "text-silver" },
			{ text: "\n", className: "" },
			{ text: "event:", className: "text-silver pl-[90px]" },
			{ text: " subscription.halted", className: "text-white" },
			{ text: "\n", className: "" },
			{ text: "customer:", className: "text-silver pl-[90px]" },
			{ text: " priya@startup.in", className: "text-white" },
			{ text: " | amount:", className: "text-silver" },
			{ text: " ₹12,800", className: "text-white" },
		],
		[
			{ text: "[09:42:14]", className: "text-silver", speed: 8 },
			{ text: " classifying decline code:", className: "text-silver" },
			{ text: " card_expired", className: "text-white" },
			{ text: "\n", className: "" },
			{ text: "verdict:", className: "text-silver pl-[90px]" },
			{ text: " SOFT_DECLINE", className: "text-green uppercase" },
			{ text: " → retryable", className: "text-silver" },
		],
		[
			{ text: "[09:42:15]", className: "text-silver", speed: 8 },
			{ text: " campaign triggered:", className: "text-silver" },
			{ text: " 7-day-aggressive", className: "text-white" },
			{ text: "\n", className: "" },
			{ text: "step 1:", className: "text-silver pl-[90px]" },
			{ text: " email #1 queued (delay: 0ms)", className: "text-silver" },
			{ text: "\n", className: "" },
			{ text: "step 2:", className: "text-silver pl-[90px]" },
			{
				text: " retry attempt 1 scheduled (delay: 48h)",
				className: "text-silver",
			},
		],
		[
			{ text: "[09:42:15]", className: "text-silver", speed: 8 },
			{ text: " email sent:", className: "text-silver" },
			{
				text: ' "Payment issue with your subscription"',
				className: "text-white",
			},
			{ text: "\n", className: "" },
			{
				text: "delivered: ✓  opened: ✓ (09:51)  clicked: ✗",
				className: "text-silver pl-[90px]",
			},
		],
		[
			{ text: "[Mar 22, 10:00]", className: "text-silver", speed: 8 },
			{ text: " retry attempt 1 fired", className: "text-silver" },
			{ text: "\n", className: "" },
			{ text: "result:", className: "text-silver pl-[125px]" },
			{ text: " declined again (card_expired)", className: "text-amber" },
			{ text: "\n", className: "" },
			{
				text: "note: retrying after payday window (Mar 25)",
				className: "text-silver pl-[125px] italic",
			},
		],
		[
			{ text: "[Mar 25, 09:00]", className: "text-silver", speed: 8 },
			{
				text: " retry attempt 2 fired — post-salary timing",
				className: "text-silver",
			},
			{ text: "\n", className: "" },
			{ text: "result:", className: "text-silver pl-[125px]" },
			{ text: " ✓ SUCCESS", className: "text-green uppercase" },
		],
		[
			{ text: "[Mar 25, 09:00]", className: "text-silver", speed: 8 },
			{
				text: " ₹12,800 RECOVERED",
				className: "text-green font-medium text-[17px]",
				speed: 40,
			},
			{ text: "\n", className: "" },
			{ text: "time elapsed:", className: "text-silver pl-[125px]" },
			{ text: " 2.8 days", className: "text-silver" },
			{ text: "\n", className: "" },
			{ text: "channel:", className: "text-silver pl-[125px]" },
			{ text: " auto-retry + email sequence", className: "text-silver" },
		],
	];

	useEffect(() => {
		if (!started || isComplete) return;

		let { block, token, chars } = revealed;
		if (block >= PROCESS_BLOCKS.length) {
			setIsComplete(true);
			return;
		}

		const currentToken = PROCESS_BLOCKS[block][token];
		const fullText = currentToken.text;

		if (chars < fullText.length) {
			const speed = currentToken.speed || 20;
			const timer = setTimeout(() => {
				setRevealed({ block, token, chars: chars + 1 });
			}, speed);
			return () => clearTimeout(timer);
		} else {
			if (token + 1 < PROCESS_BLOCKS[block].length) {
				setRevealed({ block, token: token + 1, chars: 0 });
			} else {
				setRevealed({ block: block + 1, token: 0, chars: 0 });
			}
		}
	}, [started, revealed, isComplete, PROCESS_BLOCKS]);

	return (
		<section id="how-it-works" className="py-[120px] px-6 md:px-20 bg-black">
			<div className="w-full max-w-[1440px] mx-auto">
				<div className="font-mono text-[15px] text-silver mb-4">
					// process.log
				</div>
				<div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
					<h2 className="font-heading font-semibold text-[44px] md:text-[54px] text-white leading-[1.1]">
						What happens when
						<br />a payment fails
					</h2>
					<div className="font-mono text-[17px] text-green mb-2">
						With FynBack running.
					</div>
				</div>

				<div
					className="bg-ink border border-line rounded-[10px] p-8 md:p-10 font-mono text-[15px] md:text-[16px] max-w-[760px] relative overflow-hidden animate-on-scroll"
					ref={containerRef}
					data-typewriter="true"
				>
					<div className="space-y-6">
						{PROCESS_BLOCKS.map((tokens, bIdx) => {
							if (bIdx > revealed.block) return null;

							const isLastBlock = bIdx === 6;
							const applySuccessClass = isLastBlock && isComplete;

							return (
								<div
									key={bIdx}
									className={
										isLastBlock
											? `transition-all duration-500 origin-center -mx-4 px-4 py-2 border-l-[3px] border-transparent rounded bg-transparent ${applySuccessClass ? "!bg-[var(--green-dim)] !border-green animate-[successPop_400ms_ease_forwards]" : ""}`
											: ""
									}
								>
									{tokens.map((tok, tIdx) => {
										if (bIdx === revealed.block && tIdx > revealed.token)
											return null;

										const isCurrent =
											bIdx === revealed.block && tIdx === revealed.token;
										const textToShow = isCurrent
											? tok.text.slice(0, revealed.chars)
											: tok.text;

										if (tok.text === "\n") return <br key={tIdx} />;

										return (
											<span key={tIdx} className={tok.className}>
												{textToShow}
											</span>
										);
									})}
								</div>
							);
						})}
					</div>

					<button
						onClick={reset}
						className="absolute bottom-6 right-6 font-mono text-[11px] text-silver hover:text-white transition-colors border-none bg-transparent cursor-pointer"
					>
						↺ replay
					</button>
				</div>

				<div className="max-w-[760px] text-right mt-4 font-body text-[17px] italic text-silver animate-on-scroll">
					This happened automatically. You were asleep.
				</div>
			</div>
		</section>
	);
};

export default ProcessLog;
