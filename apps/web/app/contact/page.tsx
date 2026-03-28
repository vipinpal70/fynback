import HeaderComponent from "@/components/landingPage/Header";
import Footer from "@/components/landingPage/Footer";
import ContactForm from "./_form";
import Link from "next/link";
import { Mail, MessageCircle, FileText } from "lucide-react";

export const metadata = {
  title: "Contact Us — FynBack",
  description: "Get in touch with the FynBack team.",
};

export default function ContactPage() {
  return (
    <div className="bg-[#08090c] min-h-screen font-body">
      <HeaderComponent />

      <main className="max-w-[1100px] mx-auto px-6 py-16 md:py-24">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[13px] text-[#8a919e] mb-10">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <span>/</span>
          <span className="text-white">Contact</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          {/* Left — info */}
          <div>
            <h1 className="text-[32px] md:text-[42px] font-heading font-semibold text-white tracking-[-1px] leading-tight mb-4">
              Get in touch
            </h1>
            <p className="text-[#8a919e] text-[16px] leading-[1.7] mb-12">
              Have questions about FynBack? Want a demo for your team? We typically
              respond within 1 business day.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-[8px] bg-[rgba(0,232,120,0.08)] border border-[rgba(0,232,120,0.15)] flex items-center justify-center shrink-0 mt-0.5">
                  <Mail size={16} className="text-[#00e878]" />
                </div>
                <div>
                  <div className="text-[14px] text-[#8a919e] mb-1">Email us</div>
                  <a
                    href="mailto:hello@fynback.com"
                    className="text-white hover:text-[#00e878] transition-colors text-[15px]"
                  >
                    hello@fynback.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-[8px] bg-[rgba(0,232,120,0.08)] border border-[rgba(0,232,120,0.15)] flex items-center justify-center shrink-0 mt-0.5">
                  <MessageCircle size={16} className="text-[#00e878]" />
                </div>
                <div>
                  <div className="text-[14px] text-[#8a919e] mb-1">Support</div>
                  <a
                    href="mailto:support@fynback.com"
                    className="text-white hover:text-[#00e878] transition-colors text-[15px]"
                  >
                    support@fynback.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-[8px] bg-[rgba(0,232,120,0.08)] border border-[rgba(0,232,120,0.15)] flex items-center justify-center shrink-0 mt-0.5">
                  <FileText size={16} className="text-[#00e878]" />
                </div>
                <div>
                  <div className="text-[14px] text-[#8a919e] mb-1">Office</div>
                  <p className="text-white text-[15px] leading-[1.6]">
                    FynBack Technologies Pvt. Ltd.<br />
                    Gurugram, Haryana — 122001
                  </p>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="mt-12 pt-10 border-t border-[#1f2228]">
              <p className="text-[13px] text-[#8a919e] leading-[1.7]">
                By submitting this form you agree to our{" "}
                <Link href="/privacy-policy" className="text-[#00e878] hover:underline">
                  Privacy Policy
                </Link>
                . We'll only use your information to respond to your enquiry.
              </p>
            </div>
          </div>

          {/* Right — form */}
          <div className="bg-[#0e1014] border border-[#1f2228] rounded-[12px] p-8">
            <h2 className="text-[18px] font-semibold text-white mb-6">Send us a message</h2>
            <ContactForm />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
