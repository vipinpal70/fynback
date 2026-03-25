import LegalLayout from "../components/landingPage/LegalLayout";

export const metadata = {
  title: "Privacy Policy — FynBack",
  description: "How FynBack collects, uses, and protects your data.",
};

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="March 26, 2026">
      <p>
        FynBack Technologies Pvt. Ltd. ("FynBack", "we", "our", or "us") is committed to
        protecting the privacy of merchants and their customers. This Privacy Policy describes
        how we collect, use, store, and share information when you use our payment recovery
        platform at fynback.com.
      </p>

      <h2>1. Information We Collect</h2>

      <h3>1.1 Information you provide</h3>
      <ul>
        <li>Business name, GST number, and registered address during onboarding</li>
        <li>Your name and email address when creating an account</li>
        <li>Payment gateway API keys and webhook secrets (stored encrypted)</li>
        <li>Brand settings such as logo, colour, and email preferences</li>
      </ul>

      <h3>1.2 Information we receive from your payment gateway</h3>
      <p>
        When a payment fails on your Razorpay, Stripe, Cashfree, or PayU account, FynBack
        receives webhook data that may include your customers' names, email addresses, phone
        numbers, payment amounts, and failure reasons. This data is processed solely to
        execute payment recovery on your behalf.
      </p>

      <h3>1.3 Usage data</h3>
      <ul>
        <li>IP addresses, browser type, and device information</li>
        <li>Pages visited, time spent, and actions taken within the dashboard</li>
        <li>Server logs and error reports</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To provide and operate the FynBack payment recovery service</li>
        <li>To send recovery emails, WhatsApp messages, and SMS on your behalf</li>
        <li>To generate analytics and recovery reports in your dashboard</li>
        <li>To communicate service updates, billing notices, and support responses</li>
        <li>To detect and prevent fraud, abuse, or security incidents</li>
        <li>To comply with applicable Indian laws and regulations</li>
      </ul>

      <h2>3. Data Storage and Security</h2>
      <p>
        All data is stored on servers located in India or within AWS/GCP regions covered by
        adequate data protection standards. Payment gateway credentials are encrypted at rest
        using AES-256. We do not store full card numbers or UPI PINs.
      </p>
      <p>
        We implement industry-standard security measures including TLS 1.3 in transit,
        role-based access control, and regular security audits. However, no method of
        transmission over the internet is 100% secure.
      </p>

      <h2>4. Data Sharing</h2>
      <p>We do not sell your data or your customers' data. We share data only with:</p>
      <ul>
        <li><strong>Resend</strong> — transactional email delivery</li>
        <li><strong>MSG91 / Interakt</strong> — SMS and WhatsApp delivery</li>
        <li><strong>Supabase</strong> — database hosting</li>
        <li><strong>Clerk</strong> — authentication</li>
        <li>Law enforcement or regulators when required by Indian law</li>
      </ul>

      <h2>5. Your Customers' Data</h2>
      <p>
        You are the data controller for your customers' personal information. FynBack acts as
        a data processor. We process your customers' data strictly according to your
        instructions and this policy. We do not use your customers' data for any purpose
        other than executing recovery campaigns on your behalf.
      </p>

      <h2>6. Data Retention</h2>
      <p>
        We retain merchant account data for the duration of your subscription plus 90 days
        after cancellation. Failed payment records and recovery logs are retained for 2 years
        for audit purposes, after which they are permanently deleted.
      </p>

      <h2>7. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you</li>
        <li>Correct inaccurate data</li>
        <li>Request deletion of your account and associated data</li>
        <li>Export your data in a machine-readable format</li>
        <li>Withdraw consent for marketing communications at any time</li>
      </ul>
      <p>
        To exercise these rights, email us at{" "}
        <a href="mailto:privacy@fynback.com">privacy@fynback.com</a>.
      </p>

      <h2>8. Cookies</h2>
      <p>
        We use strictly necessary cookies for authentication sessions and preference storage.
        We do not use third-party advertising or tracking cookies.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you via email or
        an in-app banner at least 7 days before material changes take effect.
      </p>

      <h2>10. Contact</h2>
      <p>
        For privacy-related queries, contact our Data Protection Officer at{" "}
        <a href="mailto:privacy@fynback.com">privacy@fynback.com</a> or write to us at
        FynBack Technologies Pvt. Ltd., Gurugram, Haryana, India.
      </p>
    </LegalLayout>
  );
}
