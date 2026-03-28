"use client";
import React, { useEffect, useState } from "react";

export default function FinalCTA() {
	const [started, setStarted] = useState(false);
	const [promptText, setPromptText] = useState("");
	const [showLine2, setShowLine2] = useState(false);
	const [spinner1, setSpinner1] = useState("");
	const [showLine3, setShowLine3] = useState(false);
	const [spinner2, setSpinner2] = useState("");
	const [line4Text, setLine4Text] = useState("");
	const [line5Text, setLine5Text] = useState("");
	const [showHighlight, setShowHighlight] = useState(false);
	const [showReady, setShowReady] = useState(false);
	const [showCTA, setShowCTA] = useState(false);

	useEffect(() => {
		if (!started) return;
		let isActive = true;

		const runSequence = async () => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const typeText = async (
				full: string,
				setter: React.Dispatch<React.SetStateAction<string>>,
				speed = 40,
			) => {
				let current = "";
				for (let i = 0; i < full.length; i++) {
					if (!isActive) break;
					current += full[i];
					setter(current);
					await sleep(speed);
				}
			};

			const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
			const spinTimer = async (
				setter: React.Dispatch<React.SetStateAction<string>>,
				duration: number,
			) => {
				const start = Date.now();
				let i = 0;
				while (Date.now() - start < duration) {
					if (!isActive) break;
					setter(spinnerFrames[i % spinnerFrames.length]);
					i++;
					await sleep(80);
				}
				if (isActive) setter("");
			};

			await sleep(300);
			await typeText(
				">_ FynBack connect --gateway razorpay",
				setPromptText,
				40,
			);

			if (!isActive) return;
			await sleep(500);
			setShowLine2(true);
			await spinTimer(setSpinner1, 1500);

			if (!isActive) return;
			setShowLine3(true);
			await spinTimer(setSpinner2, 1000);

			if (!isActive) return;
			await typeText(
				"Found: 143 failed payments · ₹3,08,000 at risk",
				setLine4Text,
				25,
			);

			if (!isActive) return;
			await sleep(200);
			await typeText("Recovery potential: ₹2,40,000 (78%)", setLine5Text, 25);
			if (isActive) setShowHighlight(true);

			if (!isActive) return;
			await sleep(500);
			if (isActive) setShowReady(true);

			if (!isActive) return;
			await sleep(400);
			if (isActive) setShowCTA(true);
		};

		runSequence();
		return () => {
			isActive = false;
		};
	}, [started]);

	return (
		<section
			className="py-[140px] px-6 bg-ink border-t border-line"
			ref={(el) => {
				if (el && !el.dataset.observed) {
					el.dataset.observed = "true";
					const observer = new IntersectionObserver(
						([e]) => {
							if (e.isIntersecting) {
								setStarted(true);
								observer.disconnect();
							}
						},
						{ threshold: 0.5 },
					);
					observer.observe(el);
				}
			}}
		>
			<div className="w-full max-w-[800px] mx-auto text-center flex flex-col items-center">
				<div className="font-mono text-[20px] md:text-[28px] text-green mb-8 flex items-center justify-center font-medium min-h-[40px]">
					{started && <span>{promptText}</span>}
					{started && !showCTA && (
						<span className="animate-blink ml-1 leading-none text-[24px]">
							▮
						</span>
					)}
				</div>

				<div className="font-mono text-[15px] md:text-[16px] text-silver mb-12 flex flex-col items-start gap-3 min-h-[180px] w-full max-w-[480px] mx-auto text-left">
					{showLine2 && (
						<div className="flex items-center gap-2">
							Connecting to Razorpay API...{" "}
							<span className="text-green w-[1em]">{spinner1}</span>
						</div>
					)}
					{showLine3 && (
						<div className="flex items-center gap-2">
							Scanning last 30 days...{" "}
							<span className="text-green w-[1em]">{spinner2}</span>
						</div>
					)}
					{line4Text.length > 0 && (
						<div>
							<span>{line4Text.split("·")[0]}</span>
							{line4Text.includes("·") && (
								<span>
									·{" "}
									<span className="text-green">{line4Text.split("·")[1]}</span>
								</span>
							)}
						</div>
					)}
					{line5Text.length > 0 && (
						<div
							className={`mt-1 transition-all duration-500 origin-center rounded p-1 -ml-1 ${showHighlight ? "bg-[var(--green-dim)] border-l-[3px] border-green text-green animate-[successPop_400ms_ease_forwards]" : "text-silver border-transparent"}`}
						>
							{line5Text}
						</div>
					)}
					{showReady && (
						<div className="font-body font-medium text-white text-[18px] mt-6 w-full text-center animate-[delayedFadeIn_500ms_ease_forwards]">
							Ready. Start your free trial...
						</div>
					)}
				</div>

				<div
					className={`transition-all duration-700 transform ${showCTA ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4 pointer-events-none"}`}
				>
					<button className="bg-green text-black font-body font-bold text-[18px] px-10 py-4 rounded-[6px] hover:bg-[#00ff88] transition-colors mb-4 flex items-center gap-2 group mx-auto border-none cursor-pointer">
						Connect Razorpay and start recovering{" "}
						<span className="group-hover:translate-x-1 transition-transform">
							→
						</span>
					</button>
					<div className="font-mono text-[14px] text-silver tracking-tight mt-4">
						Free for 14 days · No credit card · Takes 8 minutes
					</div>
				</div>
			</div>
		</section>
	);
}
