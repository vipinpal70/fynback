import type { Metadata } from "next";
import {
	Bricolage_Grotesque,
	Geist,
	Geist_Mono,
	Plus_Jakarta_Sans,
	DM_Sans,
	JetBrains_Mono,
	Syne,
	DM_Mono,
} from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ClerkProvider } from "@clerk/nextjs";

// Premium display font for headings — expressive, modern, high contrast
const bricolage = Bricolage_Grotesque({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800"],
	variable: "--font-grotesque",
	display: "swap",
});

const syne = Syne({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700", "800"],
	variable: "--font-syne",
	display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
	subsets: ["latin"],
	weight: ["500", "600", "700"],
	variable: "--font-plus-jakarta",
	display: "swap",
});

const dmSans = DM_Sans({
	subsets: ["latin"],
	weight: ["400", "500", "700"],
	style: ["normal", "italic"],
	variable: "--font-dm-sans-custom",
	display: "swap",
});

const dmMono = DM_Mono({
	subsets: ["latin"],
	weight: ["400", "500"],
	variable: "--font-dm-mono-custom",
	display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	weight: ["500"],
	variable: "--font-jetbrains-mono",
	display: "swap",
});

// Geist — clean, geometric, made for developer tools & SaaS UIs
const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const geistMono = Geist_Mono({
	subsets: ["latin"],
	weight: ["400", "500"],
	variable: "--font-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "FynBack – India's First Failed Payment Recovery Tool",
	description:
		"FynBack automatically recovers failed Razorpay and Stripe payments through smart retries, WhatsApp nudges, and personalised email sequences. Average recovery rate: 78%.",
	icons: {
		icon: [
			{ url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
			{ url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
		],
		apple: [
			{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
		],
		other: [
			{ rel: "android-chrome-192x192", url: "/android-chrome-192x192.png" },
			{ rel: "android-chrome-512x512", url: "/android-chrome-512x512.png" },
		],
	},
	manifest: "/site.webmanifest",
	themeColor: "#08090c",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={cn(
				"h-full dark",
				"antialiased",
				syne.variable,
				bricolage.variable,
				plusJakartaSans.variable,
				dmSans.variable,
				dmMono.variable,
				jetbrainsMono.variable,
				geistMono.variable,
				"font-sans",
				geist.variable
			)}
			suppressHydrationWarning
		>
			<body className="min-h-full flex flex-col" suppressHydrationWarning>
				<ClerkProvider
					domain={process.env.NEXT_PUBLIC_CLERK_DOMAIN ?? "fynback.com"}
					proxyUrl={process.env.NEXT_PUBLIC_CLERK_PROXY_URL}
				>
					<TooltipProvider>
						{children}
					</TooltipProvider>
					<Toaster />
				</ClerkProvider>
			</body>
		</html>
	);
}
