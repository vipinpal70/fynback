import Link from "next/link";
import HeaderComponent from "./Header";
import Footer from "./Footer";

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export default function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="bg-[#08090c] min-h-screen font-body">
      <HeaderComponent />

      <main className="max-w-[780px] mx-auto px-6 py-16 md:py-24">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[13px] text-[#8a919e] mb-10">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <span>/</span>
          <span className="text-white">{title}</span>
        </div>

        {/* Header */}
        <div className="mb-12 pb-10 border-b border-[#1f2228]">
          <h1 className="text-[32px] md:text-[42px] font-heading font-semibold text-white tracking-[-1px] leading-tight mb-4">
            {title}
          </h1>
          <p className="text-[14px] text-[#8a919e]">Last updated: {lastUpdated}</p>
        </div>

        {/* Content */}
        <div className="legal-content text-[#8a919e] text-[15px] leading-[1.8] space-y-8">
          {children}
        </div>
      </main>

      <Footer />

      <style>{`
        .legal-content h2 {
          font-size: 18px;
          font-weight: 600;
          color: #f2f3f5;
          margin-top: 40px;
          margin-bottom: 12px;
        }
        .legal-content h3 {
          font-size: 15px;
          font-weight: 600;
          color: #f2f3f5;
          margin-top: 24px;
          margin-bottom: 8px;
        }
        .legal-content p { margin-bottom: 12px; }
        .legal-content ul {
          list-style: disc;
          padding-left: 20px;
          space-y: 4px;
        }
        .legal-content ul li { margin-bottom: 6px; }
        .legal-content a { color: #00e878; text-decoration: none; }
        .legal-content a:hover { text-decoration: underline; }
        .legal-content strong { color: #f2f3f5; font-weight: 500; }
      `}</style>
    </div>
  );
}
