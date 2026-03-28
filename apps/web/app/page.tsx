import dynamic from "next/dynamic";
import HeaderComponent from "@/components/landingPage/Header";
import Hero from "@/components/landingPage/Hero";
import ScrollObserver from "@/components/landingPage/ScrollObserver";

// Lazy load below-the-fold components
const ProblemStatement = dynamic(() => import("@/components/landingPage/Problem"));
const ProcessLog = dynamic(() => import("@/components/landingPage/ProcessLog"));
const IndiaFirst = dynamic(() => import("@/components/landingPage/IndiaFirst"));
const WhatsAppSpotlight = dynamic(() => import("@/components/landingPage/WhatsAppSpotlight"));
const Testimonials = dynamic(() => import("@/components/landingPage/Testimonials"));
const Price = dynamic(() => import("@/components/landingPage/Price"));
const FAQ = dynamic(() => import("@/components/landingPage/FAQ"));
const Footer = dynamic(() => import("@/components/landingPage/Footer"));
const Integrations = dynamic(() => import("@/components/landingPage/Integrations"));
const FinalCTA = dynamic(() => import("@/components/landingPage/FinalCTA"));

// GlobalStyles migrated to globals.css for better performance

export default function Home() {
	return (
		<main className="fynback-landing">
			<ScrollObserver />
			<HeaderComponent />
			<Hero />
			<ProblemStatement />
			<ProcessLog />
			<IndiaFirst />
			<WhatsAppSpotlight />
			<Testimonials />
			<Price />
			<Integrations />
			<FAQ />
			<FinalCTA />
			<Footer />
		</main>
	);
}
