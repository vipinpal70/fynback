"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";
import { completeOnboarding } from "./_actions";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import Script from "next/script";

// Import refactored components
import { Step2, StepPlan, Step3, Step4, Step5 } from "./_components";

// ─── Step metadata moved outside component ────────────────────────────────────

const STEPS = [
	{ id: 2, label: "Business Profile" },
	{ id: 3, label: "Plan & Activation" },
	{ id: 4, label: "Gateway" },
	{ id: 5, label: "Recovery Prefs" },
	{ id: 6, label: "Team" },
] as const;

type Step = 2 | 3 | 4 | 5 | 6;

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
	const { user, isLoaded } = useUser();

	const [step, setStep] = React.useState<Step>(2);
	const [loading, setLoading] = React.useState(false);

	// Accumulated form data across all steps
	const [formState, setFormState] = React.useState({
		// Step 2 — Business profile
		businessLegalName: "",
		businessType: "",
		websiteUrl: "",
		mrrRange: "",
		gstNumber: "",
		country: "IN",
		// Step 3 — Subscription
		plan: "trial",
		billingCycle: "monthly",
		trialActivationPaid: false,
		trialActivationTxnId: "",
		// Step 4 — Gateway
		gateway: "",
		gatewayApiKey: "",
		gatewayApiSecret: "",
		// Step 5 — Recovery preferences
		fromName: "",
		replyToEmail: "",
		brandColorHex: "#3b82f6",
		defaultRecoveryCampaign: "standard_10d",
		whatsappOptIn: false,
		interaktApiKey: '',
		// Step 6 — Team & notifications
		teamEmails: "",
		slackWebhookUrl: "",
		digestFrequency: "daily",
	});

    // Initialize from localStorage on mount
    React.useEffect(() => {
        const savedPaid = localStorage.getItem('FynBack_trial_paid') === 'true';
        const savedTxnId = localStorage.getItem('FynBack_trial_txn_id') || "";
        
        if (savedPaid && !formState.trialActivationPaid) {
            setFormState(prev => ({
                ...prev,
                trialActivationPaid: true,
                trialActivationTxnId: savedTxnId
            }));
        }

        if (isLoaded && user && !formState.fromName) {
            setFormState(prev => ({
                ...prev,
                fromName: `Billing team at ${user.organizationMemberships?.[0]?.organization?.name || "your company"}`,
                replyToEmail: user.primaryEmailAddress?.emailAddress || "",
            }));
        }
    }, [isLoaded, user]);

    // Save payment status to localStorage when it changes
    React.useEffect(() => {
        if (formState.trialActivationPaid) {
            localStorage.setItem('FynBack_trial_paid', 'true');
            localStorage.setItem('FynBack_trial_txn_id', formState.trialActivationTxnId);
        }
    }, [formState.trialActivationPaid, formState.trialActivationTxnId]);

	const handleChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
	) => {
		const { name, value, type } = e.target;
		setFormState((prev) => ({
			...prev,
			[name]:
				type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
		}));
	};

    const handleSelectChange = (name: string, value: string | boolean) => {
        setFormState(prev => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (name: string, checked: boolean) => {
        setFormState(prev => ({ ...prev, [name]: checked }));
    };

	const next = () => setStep((s) => Math.min(s + 1, 6) as Step);
	const back = () => setStep((s) => Math.max(s - 1, 2) as Step);

	const handleFinish = async () => {
		setLoading(true);
		const fd = new FormData();
		Object.entries(formState).forEach(([k, v]) => fd.append(k, String(v)));
		
        const res = await completeOnboarding(fd);
		
        if (res?.message) {
			toast.success("Onboarding complete!");
            localStorage.removeItem('FynBack_trial_paid');
            localStorage.removeItem('FynBack_trial_txn_id');
			await user?.reload();
			window.location.href = "/dashboard";
		}
		if (res?.error) {
			toast.error(res.error);
		}
		setLoading(false);
	};

	const progress = ((step - 2) / (STEPS.length - 1)) * 100;

    if (!isLoaded) return null;

	return (
		<main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-6 font-sans">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.1),transparent_50%)] pointer-events-none" />
            
			<div className="w-full max-w-xl relative z-10">
				{/* Header */}
				<header className="mb-10 text-center">
					<p className="text-xs text-blue-500 font-bold tracking-[0.2em] uppercase mb-4">
						Step {step - 1} of {STEPS.length}
					</p>
					<h1 className="text-3xl font-bold tracking-tight text-white mb-6">
						{STEPS.find((s) => s.id === step)?.label}
					</h1>
					<div className="max-w-xs mx-auto">
                        <Progress 
                            value={progress} 
                            className="h-1.5 bg-zinc-800" 
                            aria-label={`Onboarding progress: ${Math.round(progress)}%`}
                        />
                    </div>
				</header>

				{/* Card Container */}
				<Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl">
					<CardContent className="pt-8 space-y-6">
						{step === 2 && (
							<Step2 values={formState} onChange={handleChange} onSelectChange={handleSelectChange} onNext={next} />
						)}
						{step === 3 && (
							<StepPlan
								values={formState}
                                user={user}
								onSelectChange={handleSelectChange}
								onNext={next}
								onBack={back}
							/>
						)}
						{step === 4 && (
							<Step3
								values={formState}
								onChange={handleChange}
                                onSelectChange={handleSelectChange}
								onNext={next}
								onBack={back}
							/>
						)}
						{step === 5 && (
							<Step4
								values={formState}
								onChange={handleChange}
                                onSelectChange={handleSelectChange}
                                onCheckboxChange={handleCheckboxChange}
								onNext={next}
								onBack={back}
							/>
						)}
						{step === 6 && (
							<Step5
								values={formState}
								onChange={handleChange}
                                onSelectChange={handleSelectChange}
								onBack={back}
								onFinish={handleFinish}
								loading={loading}
							/>
						)}
					</CardContent>
				</Card>

				{/* Razorpay Script */}
				<Script
					id="razorpay-checkout"
					src="https://checkout.razorpay.com/v1/checkout.js"
				/>

                <footer className="mt-8 text-center text-zinc-500 text-sm">
                    Secured by FynBack Infrastructure
                </footer>
			</div>
		</main>
	);
}
