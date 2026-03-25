import LegalLayout from "../components/landingPage/LegalLayout";

export const metadata = {
  title: "Refund & Cancellation Policy — FynBack",
  description: "FynBack's policy on refunds, cancellations, and subscription changes.",
};

export default function RefundPolicy() {
  return (
    <LegalLayout title="Refund & Cancellation Policy" lastUpdated="March 26, 2026">
      <p>
        This Refund and Cancellation Policy governs subscriptions to FynBack Technologies
        Pvt. Ltd. ("FynBack"). By subscribing, you agree to the terms below.
      </p>

      <h2>1. Subscription Plans</h2>
      <p>
        FynBack offers monthly subscription plans (Starter, Growth, Scale). All plans are
        billed in advance at the beginning of each billing cycle. Pricing is displayed in
        Indian Rupees exclusive of GST.
      </p>

      <h2>2. Cancellation</h2>
      <p>
        You may cancel your subscription at any time from your dashboard under{" "}
        <strong>Settings → Billing → Cancel Subscription</strong>. Cancellation takes effect
        at the end of your current billing period. You will retain full access to the
        platform until that date.
      </p>
      <p>
        Cancellation requests via email must be sent to{" "}
        <a href="mailto:billing@fynback.com">billing@fynback.com</a> at least 5 business
        days before the next billing date to avoid being charged for the following period.
      </p>

      <h2>3. Refund Policy</h2>

      <h3>3.1 Monthly Subscriptions</h3>
      <p>
        Monthly subscription fees are <strong>non-refundable</strong> once a billing cycle
        has started. If you cancel mid-cycle, you will not be charged for the next cycle but
        no pro-rata refund will be issued for the current cycle.
      </p>

      <h3>3.2 Success Fees</h3>
      <p>
        The 5% success fee is charged only on payments confirmed as successfully recovered.
        Success fees are non-refundable as they represent work already completed. In the
        event of a disputed recovery (e.g., a customer reversal within 7 days), the
        corresponding success fee will be adjusted in your next billing statement.
      </p>

      <h3>3.3 Exceptions — Eligible for Refund</h3>
      <p>We will issue a full refund of the subscription fee in the following cases:</p>
      <ul>
        <li>
          You were charged due to a billing error on our part (e.g., double charge or
          incorrect plan amount)
        </li>
        <li>
          You cancel within <strong>7 days</strong> of your first-ever subscription payment
          and have not yet connected a payment gateway or processed any recovery campaigns
        </li>
        <li>
          FynBack experiences a verified platform outage exceeding 72 consecutive hours
          during your billing period
        </li>
      </ul>

      <h3>3.4 How to Request a Refund</h3>
      <p>
        Email <a href="mailto:billing@fynback.com">billing@fynback.com</a> with your
        registered email address, the invoice number, and reason for the refund request.
        Eligible refunds are processed within <strong>7–10 business days</strong> to the
        original payment method.
      </p>

      <h2>4. Plan Downgrades</h2>
      <p>
        You may downgrade your plan at any time. The downgrade takes effect at the start of
        the next billing cycle. No refund is issued for the difference in the current cycle.
      </p>

      <h2>5. Plan Upgrades</h2>
      <p>
        When you upgrade mid-cycle, you are charged a prorated amount for the remainder of
        the current billing period. The new plan's full price applies from the next billing
        date.
      </p>

      <h2>6. Account Suspension and Termination by FynBack</h2>
      <p>
        If FynBack suspends or terminates your account due to a violation of our{" "}
        <a href="/terms">Terms & Conditions</a>, no refund will be issued. If FynBack
        terminates your account for reasons other than a breach (e.g., business shutdown),
        a pro-rata refund for the unused portion of the current billing period will be
        provided.
      </p>

      <h2>7. GST on Refunds</h2>
      <p>
        Refunds will be processed for the amount charged inclusive of GST. A revised tax
        invoice will be issued for the refunded amount.
      </p>

      <h2>8. Contact</h2>
      <p>
        For billing and refund queries, contact us at{" "}
        <a href="mailto:billing@fynback.com">billing@fynback.com</a> or through the{" "}
        <a href="/contact">Contact page</a>.
      </p>
    </LegalLayout>
  );
}
