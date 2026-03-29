"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronRight, ChevronLeft, ShieldCheck, Zap, Globe, ZapIcon } from "lucide-react";
import { toast } from "sonner";
import { createTrialPaymentOrder, verifyTrialPayment } from "./_actions";

// ─── Shared field components ──────────────────────────────────────────────────

export function Field({
	label,
	hint,
    id,
	children,
}: {
	label: string;
	hint?: string;
    id: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id} className="text-sm font-medium text-zinc-200">{label}</Label>
			{children}
            {hint && <p className="text-[11px] text-zinc-400 leading-normal">{hint}</p>}
		</div>
	);
}

export function NavButtons({
	onBack,
	onNext,
	onFinish,
	nextLabel,
	loading,
	showBack,
	skipLabel,
	onSkip,
}: {
	onBack?: () => void;
	onNext?: () => void;
	onFinish?: () => void;
	nextLabel?: string;
	loading?: boolean;
	showBack?: boolean;
	skipLabel?: string;
	onSkip?: () => void;
}) {
	return (
		<div className="flex items-center gap-4 pt-4">
			{showBack && (
				<Button
					variant="outline"
					onClick={onBack}
					className="flex-1 border-zinc-800 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
				>
					<ChevronLeft className="mr-2 h-4 w-4" />
                    Back
				</Button>
			)}
			{onSkip && (
				<Button
					variant="ghost"
					onClick={onSkip}
					className="flex-1 text-zinc-500 hover:text-zinc-300"
				>
					{skipLabel ?? "Skip"}
				</Button>
			)}
			<Button
				disabled={loading}
				onClick={onNext ?? onFinish}
				className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-lg shadow-blue-900/20"
			>
				{loading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                    </>
                ) : (
                    <>
                        {nextLabel ?? "Continue"}
                        {(!onFinish) && <ChevronRight className="ml-2 h-4 w-4" />}
                    </>
                )}
			</Button>
		</div>
	);
}

// ─── Step 2 — Business Profile ────────────────────────────────────────────────

export function Step2({
	values,
	onChange,
    onSelectChange,
	onNext,
}: {
	values: any;
	onChange: any;
    onSelectChange: any;
	onNext: () => void;
}) {
	return (
		<div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
			<Field
                id="businessLegalName"
				label="Business Legal Name"
				hint="May differ from your brand name — required for GST invoicing"
			>
				<Input
                    id="businessLegalName"
					name="businessLegalName"
					value={values.businessLegalName}
					onChange={onChange}
					placeholder="Acme Technologies Pvt Ltd"
					className="bg-zinc-950 border-zinc-800 focus:ring-blue-500 text-white"
                    required
				/>
			</Field>

			<Field id="businessType" label="Business Type">
                <Select value={values.businessType} onValueChange={(v) => onSelectChange('businessType', v)}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                        <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                        <SelectItem value="saas">SaaS</SelectItem>
                        <SelectItem value="d2c_subscription">D2C Subscription</SelectItem>
                        <SelectItem value="edtech">EdTech</SelectItem>
                        <SelectItem value="ott_media">OTT / Media</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                </Select>
			</Field>

			<Field id="websiteUrl" label="Website URL">
				<Input
                    id="websiteUrl"
					name="websiteUrl"
					type="url"
					value={values.websiteUrl}
					onChange={onChange}
					placeholder="https://acme.com"
					className="bg-zinc-950 border-zinc-800 text-white"
				/>
			</Field>

			<Field
                id="mrrRange"
				label="Approximate Monthly Revenue (MRR)"
				hint="Helps us recommend the right plan"
			>
                <Select value={values.mrrRange} onValueChange={(v) => onSelectChange('mrrRange', v)}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                        <SelectValue placeholder="Select range" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                        <SelectItem value="under_1l">Less than ₹1L/mo</SelectItem>
                        <SelectItem value="1l_to_5l">₹1L – ₹5L/mo</SelectItem>
                        <SelectItem value="5l_to_25l">₹5L – ₹25L/mo</SelectItem>
                        <SelectItem value="25l_to_1cr">₹25L – ₹1Cr/mo</SelectItem>
                        <SelectItem value="above_1cr">Above ₹1Cr/mo</SelectItem>
                    </SelectContent>
                </Select>
			</Field>

			<Field
                id="gstNumber"
				label="GST Number"
				hint="Optional now — required before your first invoice"
			>
				<Input
                    id="gstNumber"
					name="gstNumber"
					value={values.gstNumber}
					onChange={onChange}
					placeholder="07AAAAA0000A1Z5"
					maxLength={15}
					className="bg-zinc-950 border-zinc-800 uppercase text-white"
				/>
			</Field>

			<Field id="country" label="Country">
                <Select value={values.country} onValueChange={(v) => onSelectChange('country', v)}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                        <SelectItem value="IN">India</SelectItem>
                        <SelectItem value="US">United States</SelectItem>
                        <SelectItem value="GB">United Kingdom</SelectItem>
                        <SelectItem value="SG">Singapore</SelectItem>
                        <SelectItem value="AU">Australia</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                </Select>
			</Field>

			<NavButtons onNext={onNext} nextLabel="Continue" />
		</div>
	);
}

// ─── Step 3 — Plan & Activation ──────────────────────────────────────────────

export function StepPlan({
	values,
    user,
	onSelectChange,
	onNext,
	onBack,
}: {
	values: any;
    user: any;
	onSelectChange: any;
	onNext: () => void;
	onBack: () => void;
}) {
	const [paying, setPaying] = React.useState(false);

	const handlePay = async () => {
		setPaying(true);
		try {
			const { orderId, amount, currency, error } = await createTrialPaymentOrder(values.country);
			
			if (error || !orderId) {
				toast.error(error || "Payment failed to initialize");
				setPaying(false);
				return;
			}

			const options = {
				key: process.env.NEXT_PUBLIC_RAZORPAY_API_KEY || "rzp_test_SUw7ufqoD1XEwn",
				amount,
				currency,
				name: "FynBack Trial Activation",
				description: `Activate 14-day free trial for ${values.plan} plan`,
                image: "/fb_logo.png",
				order_id: orderId,
				handler: async (response: any) => {
					const verifyRes = await verifyTrialPayment(
						response.razorpay_order_id,
						response.razorpay_payment_id,
						response.razorpay_signature
					);

					if (verifyRes.success) {
						onSelectChange('trialActivationPaid', true);
						onSelectChange('trialActivationTxnId', response.razorpay_payment_id);
						toast.success("Trial activated successfully!");
						onNext();
					} else {
						toast.error("Payment verification failed");
					}
					setPaying(false);
				},
				prefill: {
					name: user?.fullName || "",
					email: user?.primaryEmailAddress?.emailAddress || "",
				},
				theme: { 
                    color: "#22c55e",
                    backdrop_color: "#08090c",
                },
                modal: {
                    ondismiss: () => setPaying(false),
                },
			};

			const rkp = new (window as any).Razorpay(options);
			rkp.open();
		} catch (err) {
			console.error(err);
			toast.error("An unexpected error occurred");
			setPaying(false);
		}
	};

	const plans = [
		{ id: "starter", name: "Starter", price: values.country === 'IN' ? "₹2,999" : "$39", desc: "Up to ₹2L MRR", icon: ShieldCheck },
		{ id: "growth", name: "Growth", price: values.country === 'IN' ? "₹6,999" : "$89", desc: "Up to ₹10L MRR", icon: Zap, popular: true },
		{ id: "scale", name: "Scale", price: values.country === 'IN' ? "₹14,999" : "$199", desc: "Unlimited MRR", icon: Globe },
	];

	return (
		<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
			<div className="text-center space-y-2">
				<p className="text-sm text-zinc-400">All plans include a 14-day free trial</p>
			</div>

			<div className="grid grid-cols-1 gap-4">
				{plans.map((p) => (
					<div
						key={p.id}
						onClick={() => onSelectChange("plan", p.id)}
						className={`relative p-5 rounded-xl border-2 cursor-pointer transition-all duration-300 card-inner-shadow ${
							values.plan === p.id 
								? p.id === 'starter' ? "border-blue-600 bg-blue-600/10 shadow-lg shadow-blue-500/10 scale-[1.02]" 
                                  : p.id === 'growth' ? "border-green-600 bg-green-600/10 shadow-lg shadow-green-500/10 scale-[1.02]"
                                  : "border-yellow-600 bg-yellow-600/10 shadow-lg shadow-yellow-500/10 scale-[1.02]"
								: "border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900/50"
						}`}
					>
                        {p.popular && (
							<div className="absolute -top-3 right-4 bg-green-600 text-[10px] font-bold uppercase py-1 px-2 rounded-full ring-2 ring-black">
								Most Popular
							</div>
						)}
						<div className="flex items-center gap-4">
							<div className={`p-2 rounded-lg ${
                                values.plan === p.id 
                                    ? p.id === 'starter' ? "bg-blue-600 text-white" 
                                    : p.id === 'growth' ? "bg-green-600 text-white" 
                                    : "bg-yellow-600 text-black"
                                    : "bg-zinc-800 text-zinc-400"
                            }`}>
								<p.icon className="h-5 w-5" />
							</div>
							<div className="flex-1">
								<h3 className="font-bold text-white">{p.name}</h3>
								<p className="text-xs text-zinc-400">{p.desc}</p>
							</div>
							<div className="text-right">
								<div className="text-lg font-bold text-white">{p.price}</div>
								<div className="text-[10px] text-zinc-400">per month</div>
							</div>
						</div>
					</div>
				))}
			</div>

			<div className={`${values.trialActivationPaid ? 'bg-green-950/20 border-green-900/30' : 'bg-blue-950/20 border-blue-900/30'} border rounded-xl p-4 flex gap-4 items-start transition-colors`}>
				<div className={`mt-1 ${values.trialActivationPaid ? 'bg-green-600/20 text-green-500' : 'bg-blue-600/20 text-blue-500'} p-2 rounded-full`}>
					{values.trialActivationPaid ? <ShieldCheck className="h-4 w-4" /> : <ZapIcon className="h-4 w-4" />}
				</div>
				<div>
					<h4 className={`text-sm font-bold ${values.trialActivationPaid ? 'text-green-400' : 'text-blue-400'}`}>
                        {values.trialActivationPaid ? "Activation Verified" : "Free Trial Activation"}
                    </h4>
					<p className={`text-xs ${values.trialActivationPaid ? 'text-green-400/80' : 'text-blue-400/80'} leading-relaxed`}>
						{values.trialActivationPaid 
                            ? `Transaction ID: ${values.trialActivationTxnId}. Your account is verified and ready for the 14-day trial.`
                            : `To prevent spam and verify your account, a one-time activation fee of ${values.country === 'IN' ? "₹10" : "$1.20"} is required. Your 14-day trial starts immediately after payment.`
                        }
					</p>
				</div>
			</div>

			<div className="flex items-center gap-4 pt-4">
				<Button
					variant="outline"
					onClick={onBack}
					className="flex-1 border-zinc-800 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
				>
					<ChevronLeft className="mr-2 h-4 w-4" />
					Back
				</Button>
				<Button
					onClick={values.trialActivationPaid ? onNext : handlePay}
					disabled={paying}
					className={`flex-[2] ${values.trialActivationPaid ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'} text-white font-bold h-11 transition-all`}
				>
					{paying ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Processing…
						</>
					) : values.trialActivationPaid ? (
                        <>
							Continue to Next Step
							<ChevronRight className="ml-2 h-4 w-4" />
						</>
                    ) : (
						<>
							Activate Trial ({values.country === 'IN' ? "₹10" : "$1.20"})
							<ChevronRight className="ml-2 h-4 w-4" />
						</>
					)}
				</Button>
			</div>
		</div>
	);
}

// ─── Step 4 — Gateway Connection ─────────────────────────────────────────────

export function Step3({
	values,
	onChange,
    onSelectChange,
	onNext,
	onBack,
}: {
	values: any;
	onChange: any;
    onSelectChange: any;
	onNext: () => void;
	onBack: () => void;
}) {
	return (
		<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
			<div className="rounded-lg border border-blue-900/30 bg-blue-950/20 p-4">
                <p className="text-sm text-blue-400 leading-relaxed">
                    Connecting your gateway lets us show you real failed-payment data in
                    seconds. Merchants who connect convert at{" "}
                    <span className="text-white font-bold">3× higher rates</span>.
                </p>
            </div>

			<Field id="gateway" label="Choose your payment gateway">
                <Select value={values.gateway} onValueChange={(v) => onSelectChange('gateway', v)}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 h-11 text-white">
                        <SelectValue placeholder="Select gateway…" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                        <SelectItem value="razorpay">Razorpay (API keys)</SelectItem>
                        <SelectItem value="stripe">Stripe (API keys)</SelectItem>
                        <SelectItem value="cashfree">Cashfree (API keys)</SelectItem>
                        <SelectItem value="payu">PayU (API keys)</SelectItem>
                    </SelectContent>
                </Select>
			</Field>

			{values.gateway && (
				<div className="space-y-4 pt-2 border-t border-zinc-800/50 mt-2 animate-in fade-in duration-300">
					<Field
                        id="gatewayApiKey"
						label="API Key / App ID"
						hint="Find this in your gateway dashboard under API keys"
					>
						<Input
                            id="gatewayApiKey"
							name="gatewayApiKey"
							value={values.gatewayApiKey}
							onChange={onChange}
							placeholder="cf_live_XXXXXXXXXXXXXXXX"
							className="bg-zinc-950 border-zinc-800 text-white"
						/>
					</Field>
					<Field id="gatewayApiSecret" label="API Secret / Secret Key">
						<Input
                            id="gatewayApiSecret"
							name="gatewayApiSecret"
							type="password"
							value={values.gatewayApiSecret}
							onChange={onChange}
							placeholder="••••••••••••••••"
							className="bg-zinc-950 border-zinc-800 text-white"
						/>
					</Field>
				</div>
			)}

			<NavButtons
				showBack
				onBack={onBack}
				onNext={onNext}
				nextLabel={values.gateway ? "Continue" : "Skip for now"}
			/>
		</div>
	);
}

// ─── Step 5 — Recovery Preferences ───────────────────────────────────────────

export function Step4({
	values,
	onChange,
    onSelectChange,
    onCheckboxChange,
	onNext,
	onBack,
}: {
	values: any;
	onChange: any;
    onSelectChange: any;
    onCheckboxChange: any;
	onNext: () => void;
	onBack: () => void;
}) {
	return (
		<div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
			<Field id="fromName" label="From Name" hint="Name customers see in recovery emails">
				<Input
                    id="fromName"
					name="fromName"
					value={values.fromName}
					onChange={onChange}
					placeholder="Billing team at Acme"
					className="bg-zinc-950 border-zinc-800 text-white"
				/>
			</Field>

			<Field
                id="replyToEmail"
				label="Reply-to Email"
				hint="Where customer replies about billing land"
			>
				<Input
                    id="replyToEmail"
					name="replyToEmail"
					type="email"
					value={values.replyToEmail}
					onChange={onChange}
					placeholder="billing@acme.com"
					className="bg-zinc-950 border-zinc-800 text-white"
				/>
			</Field>

			<Field
                id="brandColorHex"
				label="Brand Colour"
				hint="Used for CTA buttons in email templates"
			>
				<div className="flex items-center gap-3">
					<div 
						className="h-10 w-12 rounded-lg border border-zinc-800 p-0 overflow-hidden relative"
					>
						<input
							type="color"
							name="brandColorHex"
							value={values.brandColorHex}
							onChange={onChange}
							className="absolute inset-0 h-full w-full cursor-pointer bg-transparent border-none p-0 scale-[1.5]"
						/>
					</div>
					<Input
						name="brandColorHex"
						value={values.brandColorHex}
						onChange={onChange}
						placeholder="#3b82f6"
						maxLength={7}
						className="bg-zinc-950 border-zinc-800 font-mono text-white"
					/>
				</div>
			</Field>

			<Field
                id="defaultRecoveryCampaign"
				label="Default Recovery Campaign"
				hint="You can customise individual campaigns later"
			>
                <Select value={values.defaultRecoveryCampaign} onValueChange={(v) => onSelectChange('defaultRecoveryCampaign', v)}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                        <SelectItem value="aggressive_7d">Aggressive 7-day — high-frequency</SelectItem>
                        <SelectItem value="standard_10d">Standard 10-day — balanced (recommended)</SelectItem>
                        <SelectItem value="gentle_14d">Gentle 14-day — soft</SelectItem>
                    </SelectContent>
                </Select>
			</Field>

			<Card className="bg-zinc-800/30 border-zinc-800 p-4">
                <div className="flex items-start gap-4">
                    <Checkbox 
                        id="whatsappOptIn" 
                        checked={values.whatsappOptIn} 
                        onCheckedChange={(c) => onCheckboxChange('whatsappOptIn', c as boolean)}
                        className="mt-1 border-zinc-700 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <div className="space-y-1">
                        <Label
                            htmlFor="whatsappOptIn"
                            className="text-sm font-semibold text-zinc-100 cursor-pointer"
                        >
                            Enable WhatsApp Recovery
                        </Label>
                        <p className="text-xs text-zinc-400 leading-normal">
    						Adds 8–12% extra recovery through automated nudges.
                        </p>
                    </div>
                </div>
            </Card>

            {values.whatsappOptIn && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <Field
                        id="interaktApiKey"
                        label="Interakt API Key"
                        hint="Your secret API key from Interakt's developer settings. This is used to send WhatsApp recovery messages to your customers."
                    >
                        <Input
                            id="interaktApiKey"
                            name="interaktApiKey"
                            type="password"
                            value={values.interaktApiKey}
                            onChange={onChange}
                            placeholder="ik_live_••••••••••••••••••••••••"
                            className="bg-zinc-950 border-zinc-800 font-mono text-white"
                        />
                    </Field>
                    <a
                        href="https://app.interakt.ai/settings/developer-setting"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        Find your API key → Interakt Developer Settings
                    </a>
                </div>
            )}

			<NavButtons
				showBack
				onBack={onBack}
				onNext={onNext}
				nextLabel="Continue"
			/>
		</div>
	);
}

// ─── Step 6 — Team & Notifications ───────────────────────────────────────────

export function Step5({
	values,
	onChange,
    onSelectChange,
	onBack,
	onFinish,
	loading,
}: {
	values: any;
	onChange: any;
    onSelectChange: any;
	onBack: () => void;
	onFinish: () => void;
	loading: boolean;
}) {
	return (
		<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
			<Field
                id="teamEmails"
				label="Team Member Emails (Optional)"
				hint="Comma-separated. Each person gets an invite link."
			>
				<Input
                    id="teamEmails"
					name="teamEmails"
					value={values.teamEmails}
					onChange={onChange}
					placeholder="alice@acme.com, bob@acme.com"
					className="bg-zinc-950 border-zinc-800 text-white"
				/>
			</Field>

			<Field
                id="slackWebhookUrl"
				label="Slack Webhook URL"
				hint="Get a ping every time a payment is recovered"
			>
				<Input
                    id="slackWebhookUrl"
					name="slackWebhookUrl"
					value={values.slackWebhookUrl}
					onChange={onChange}
					placeholder="https://hooks.slack.com/services/…"
					className="bg-zinc-950 border-zinc-800 text-white"
				/>
			</Field>

			<Field id="digestFrequency" label="Recovery Digest Frequency">
                <Select value={values.digestFrequency} onValueChange={(v) => onSelectChange('digestFrequency', v)}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                        <SelectItem value="realtime">Real-time</SelectItem>
                        <SelectItem value="daily">Daily summary (recommended)</SelectItem>
                        <SelectItem value="weekly">Weekly summary</SelectItem>
                        <SelectItem value="never">Never</SelectItem>
                    </SelectContent>
                </Select>
			</Field>

			<NavButtons
				showBack
				onBack={onBack}
				onFinish={onFinish}
				nextLabel="Finish setup"
				loading={loading}
				skipLabel="Skip & finish"
				onSkip={onFinish}
			/>
		</div>
	);
}
