import LegalLayout from "@/components/landingPage/LegalLayout";

export const metadata = {
  title: "Terms & Conditions — FynBack",
  description: "Terms and conditions for using the FynBack payment recovery platform.",
};

export default function Terms() {
  return (
    <LegalLayout title="Terms & Conditions" lastUpdated="March 26, 2026">
      <p>
        Please read these Terms and Conditions carefully before using the FynBack platform.
        By registering an account or using our services, you agree to be bound by these
        terms. If you do not agree, do not use FynBack.
      </p>

      <h2>1. Definitions</h2>
      <ul>
        <li><strong>"Platform"</strong> — the FynBack web application and API at fynback.com</li>
        <li><strong>"Merchant"</strong> — a business entity that subscribes to FynBack</li>
        <li><strong>"End Customer"</strong> — a Merchant's customer whose payment failed</li>
        <li><strong>"Recovery Campaign"</strong> — automated retry, email, WhatsApp, or SMS sequences initiated by FynBack on a Merchant's behalf</li>
      </ul>

      <h2>2. Eligibility</h2>
      <p>
        You must be a registered business entity in India and be at least 18 years old to
        use FynBack. By accepting these terms you represent that you have the authority to
        bind your organisation.
      </p>

      <h2>3. Account Registration</h2>
      <p>
        You are responsible for maintaining the confidentiality of your login credentials.
        You must notify us immediately at{" "}
        <a href="mailto:support@fynback.com">support@fynback.com</a> if you suspect
        unauthorised access to your account.
      </p>

      <h2>4. Permitted Use</h2>
      <p>You may use FynBack solely to:</p>
      <ul>
        <li>Recover involuntarily failed recurring payments from your own customers</li>
        <li>Send payment recovery communications to customers who have an existing relationship with your business</li>
        <li>View analytics and reports related to your own payment data</li>
      </ul>
      <p>You must not use FynBack to contact individuals who have not consented to receive communications from your business.</p>

      <h2>5. Prohibited Activities</h2>
      <ul>
        <li>Attempting to recover payments for a third party without written authorisation</li>
        <li>Sending unsolicited or spam communications via FynBack's infrastructure</li>
        <li>Reverse engineering, copying, or reselling the FynBack platform</li>
        <li>Using FynBack for any illegal purpose under Indian law</li>
        <li>Providing false or misleading information during onboarding</li>
      </ul>

      <h2>6. Subscription and Billing</h2>
      <p>
        FynBack charges a monthly subscription fee plus a success fee of 5% on recovered
        revenue. Subscription fees are billed in advance. Success fees are billed monthly in
        arrears based on payments confirmed as recovered.
      </p>
      <p>
        All prices are in Indian Rupees and exclusive of GST (18%). Invoices will reflect
        applicable GST.
      </p>

      <h2>7. Gateway Credentials</h2>
      <p>
        You grant FynBack a limited, non-exclusive licence to use your payment gateway API
        keys solely for the purpose of executing recovery actions. We encrypt all credentials
        at rest and never share them with third parties.
      </p>

      <h2>8. Data and Privacy</h2>
      <p>
        Your use of the Platform is subject to our{" "}
        <a href="/privacy-policy">Privacy Policy</a>, which is incorporated into these Terms
        by reference.
      </p>

      <h2>9. Intellectual Property</h2>
      <p>
        FynBack and all associated logos, code, algorithms, and content are the intellectual
        property of FynBack Technologies Pvt. Ltd. Nothing in these Terms transfers any IP
        rights to you.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        FynBack is not liable for any indirect, incidental, or consequential damages arising
        from your use of the Platform. Our aggregate liability to you shall not exceed the
        total subscription fees paid by you in the three months preceding the claim.
      </p>
      <p>
        FynBack does not guarantee recovery of any specific payment or any minimum recovery
        rate. Recovery outcomes depend on factors beyond our control including your customers'
        bank policies and payment method availability.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You agree to indemnify and hold FynBack harmless from any claims, damages, or
        expenses arising from your violation of these Terms or misuse of the Platform.
      </p>

      <h2>12. Termination</h2>
      <p>
        Either party may terminate the subscription with 30 days' written notice. FynBack
        may suspend or terminate your account immediately if you breach these Terms. Upon
        termination, your data will be retained for 90 days before permanent deletion.
      </p>

      <h2>13. Governing Law</h2>
      <p>
        These Terms are governed by the laws of India. Any disputes shall be subject to the
        exclusive jurisdiction of the courts in Gurugram, Haryana.
      </p>

      <h2>14. Changes to Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Platform after
        changes are notified constitutes acceptance of the updated Terms.
      </p>

      <h2>15. Contact</h2>
      <p>
        For any queries regarding these Terms, email{" "}
        <a href="mailto:legal@fynback.com">legal@fynback.com</a>.
      </p>
    </LegalLayout>
  );
}
