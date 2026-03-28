import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function Footer() {
	return (
		<footer className="bg-black border-t border-line py-[60px] md:py-[80px] px-6 md:px-20">
			<div className="w-full max-w-[1440px] mx-auto">
				<div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
					<div className="col-span-1 border-b md:border-b-0 border-line pb-8 md:pb-0">
						<div className="font-heading font-semibold text-[20px] text-white tracking-[-0.5px] mb-4">
							FynBack
						</div>
						<p className="font-body text-[15px] text-silver leading-[1.6] mb-8">
							India's first intelligent
							<br />
							payment recovery platform.
						</p>
						<div className="font-body text-[15px] text-silver leading-[1.5]">
							Made in India · Gurugram, Haryana
							<br />
							GST: 07XXXXX1234X1ZX
						</div>
					</div>

					<div className="col-span-1">
						<div className="font-body text-[15px] text-white font-medium mb-4">
							Product
						</div>
						<ul className="space-y-3 font-body text-[15px] text-silver">
							<li>
								<a href="#" className="hover:text-silver transition-colors">
									Features
								</a>
							</li>
							<li>
								<a href="#" className="hover:text-silver transition-colors">
									Integrations
								</a>
							</li>
							<li>
								<a
									href="#pricing"
									className="hover:text-silver transition-colors"
								>
									Pricing
								</a>
							</li>
							<li>
								<a href="#" className="hover:text-silver transition-colors">
									Changelog
								</a>
							</li>
							<li>
								<a href="#" className="hover:text-silver transition-colors">
									API docs
								</a>
							</li>
						</ul>
					</div>

					<div className="col-span-1">
						<div className="font-body text-[15px] text-white font-medium mb-4">
							Company
						</div>
						<ul className="space-y-3 font-body text-[15px] text-silver">
							<li>
								<a href="#" className="hover:text-white transition-colors">
									About
								</a>
							</li>
							<li>
								<a href="#" className="hover:text-white transition-colors">
									Blog
								</a>
							</li>
							<li>
								<a href="#" className="hover:text-white transition-colors">
									Careers
								</a>
							</li>
							<li>
								<Link href="/contact" className="hover:text-white transition-colors">
									Contact
								</Link>
							</li>
							<li>
								<Link href="/privacy-policy" className="hover:text-white transition-colors">
									Privacy Policy
								</Link>
							</li>
							<li>
								<Link href="/terms" className="hover:text-white transition-colors">
									Terms & Conditions
								</Link>
							</li>
							<li>
								<Link href="/refund-policy" className="hover:text-white transition-colors">
									Refund Policy
								</Link>
							</li>
						</ul>
					</div>

					<div className="col-span-1">
						<div className="font-body text-[15px] text-white font-medium mb-4">
							Integrations
						</div>
						<ul className="space-y-3 font-body text-[15px] text-silver">
							<li>
								<a
									href="#"
									className="hover:text-silver transition-colors flex items-center gap-1 group"
								>
									Razorpay recovery{" "}
									<ArrowUpRight
										size={12}
										className="opacity-0 group-hover:opacity-100 transition-opacity"
									/>
								</a>
							</li>
							<li>
								<a
									href="#"
									className="hover:text-silver transition-colors flex items-center gap-1 group"
								>
									Stripe recovery{" "}
									<ArrowUpRight
										size={12}
										className="opacity-0 group-hover:opacity-100 transition-opacity"
									/>
								</a>
							</li>
							<li>
								<a
									href="#"
									className="hover:text-silver transition-colors flex items-center gap-1 group"
								>
									Cashfree recovery{" "}
									<ArrowUpRight
										size={12}
										className="opacity-0 group-hover:opacity-100 transition-opacity"
									/>
								</a>
							</li>
							<li>
								<a
									href="#"
									className="hover:text-silver transition-colors flex items-center gap-1 group"
								>
									PayU recovery{" "}
									<ArrowUpRight
										size={12}
										className="opacity-0 group-hover:opacity-100 transition-opacity"
									/>
								</a>
							</li>
							<li>
								<a
									href="#"
									className="hover:text-silver transition-colors flex items-center gap-1 group"
								>
									WhatsApp Business{" "}
									<ArrowUpRight
										size={12}
										className="opacity-0 group-hover:opacity-100 transition-opacity"
									/>
								</a>
							</li>
						</ul>
					</div>
				</div>

				<div className="pt-8 border-t border-line flex flex-col md:flex-row justify-between items-center gap-4">
					<div className="font-body text-[13px] text-silver flex flex-wrap items-center gap-x-4 gap-y-2">
						<span>© 2026 FynBack Technologies Pvt. Ltd.</span>
						<Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
						<Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
						<Link href="/refund-policy" className="hover:text-white transition-colors">Refunds</Link>
						<Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
					</div>
					<div className="flex gap-4">
						<a
							href="#"
							className="text-silver hover:text-silver transition-colors"
							aria-label="X (formerly Twitter)"
						>
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
							</svg>
						</a>
						<a
							href="#"
							className="text-silver hover:text-silver transition-colors"
							aria-label="LinkedIn"
						>
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
							</svg>
						</a>
					</div>
				</div>
			</div>
		</footer>
	);
}
