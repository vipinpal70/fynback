import { Worker } from 'bullmq';
import { bullmqConnection } from '@fynback/queue';
import { WelcomeJobData } from '@fynback/queue';
import { Resend } from 'resend';

// Maps MRR range to an estimated recoverable revenue per month
function getEstimatedRevenue(mrrRange: string): string {
  const estimates: Record<string, string> = {
    under_1l: '2,000 – 5,000',
    '1l_to_5l': '8,000 – 25,000',
    '5l_to_25l': '40,000 – 1,25,000',
    '25l_to_1cr': '1,50,000 – 5,00,000',
    above_1cr: '5,00,000+',
  };
  return estimates[mrrRange] ?? '5,000 – 20,000';
}

export function startWelcomeWorker() {
  const worker = new Worker<WelcomeJobData>(
    'welcomeQueue',
    async (job) => {
      // Instantiate Resend lazily so missing key throws at job time, not on startup
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        throw new Error('RESEND_API_KEY is not set');
      }
      const resend = new Resend(apiKey);

      const { onboardRedis } = job.data;
      const { email, fullName, trialEndsAt, mrrRange } = onboardRedis;

      const trialEndFormatted = new Date(trialEndsAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const estimatedRevenue = getEstimatedRevenue(mrrRange);

      console.log(`[WelcomeWorker] Processing welcome email for ${email} (${fullName})`);

      const { data, error } = await resend.emails.send({
        from: 'FynBack <welcome@fynback.com>',
        to: email,
        subject: `Welcome to FynBack, ${fullName}! Your trial has started.`,
        html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body {
    margin: 0;
    background: #000000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #e5e7eb;
}
.container {
    max-width: 600px;
    margin: 32px auto;
    background: #0a0a0a;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #1f2937;
}
.header {
    padding: 32px;
    text-align: center;
    border-bottom: 1px solid #1f2937;
}
.header h1 { margin: 0; font-size: 26px; color: #a855f7; }
.header p { margin-top: 6px; font-size: 13px; color: #9ca3af; }
.hero { padding: 28px 32px; text-align: center; }
.hero h2 { font-size: 22px; margin-bottom: 10px; color: #f9fafb; }
.hero p { font-size: 14px; color: #9ca3af; }
.revenue-box {
    margin: 24px 32px;
    padding: 18px;
    border-radius: 10px;
    background: #111827;
    border: 1px solid #374151;
    text-align: center;
}
.revenue-box strong { display: block; font-size: 20px; color: #22c55e; }
.revenue-box span { font-size: 13px; color: #9ca3af; }
.trial-box {
    margin: 20px 32px;
    padding: 14px;
    border-radius: 8px;
    background: #1f2937;
    text-align: center;
    font-size: 13px;
}
.trial-box strong { color: #f59e0b; }
.steps { padding: 0 32px; }
.step { margin-bottom: 18px; }
.step strong { display: block; color: #f9fafb; margin-bottom: 4px; }
.step span { font-size: 13px; color: #9ca3af; }
.cta { text-align: center; margin: 32px; }
.cta a {
    display: inline-block;
    background: #dc2626;
    color: #ffffff !important;
    padding: 14px 28px;
    border-radius: 8px;
    font-weight: 600;
    text-decoration: none;
    font-size: 15px;
}
.founder {
    margin: 32px;
    padding: 18px;
    background: #111827;
    border-radius: 10px;
    border-left: 3px solid #a855f7;
}
.founder p { font-size: 13px; color: #d1d5db; margin: 0 0 10px; }
.footer {
    background: #020617;
    padding: 20px;
    text-align: center;
    font-size: 12px;
    color: #6b7280;
    border-top: 1px solid #1f2937;
}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>FynBack</h1>
        <p>The smart payment recovery engine</p>
    </div>
    <div class="hero">
        <h2>Welcome, ${fullName} 👋</h2>
        <p>You're now set up to recover revenue that would otherwise be lost.</p>
    </div>
    <div class="revenue-box">
        Estimated recoverable revenue
        <strong>₹ ${estimatedRevenue}</strong>
        <span>based on similar SaaS businesses</span>
    </div>
    <div class="trial-box">
        Your trial is active until <strong>${trialEndFormatted}</strong>
    </div>
    <div class="steps">
        <div class="step">
            <strong>1. Connect your gateway</strong>
            <span>Integrate Razorpay or Stripe to detect failed payments instantly.</span>
        </div>
        <div class="step">
            <strong>2. Activate recovery campaigns</strong>
            <span>Pre-built flows are already configured for you.</span>
        </div>
        <div class="step">
            <strong>3. Start recovering revenue</strong>
            <span>Automated nudges bring customers back to complete payments.</span>
        </div>
    </div>
    <div class="cta">
        <a href="https://fynback.com/dashboard">Start Recovering Revenue →</a>
    </div>
    <div class="founder">
        <p>Hey ${fullName},</p>
        <p>I built FynBack after seeing how much revenue companies quietly lose from failed payments.
        Most teams don't realize how big this problem is until they fix it.</p>
        <p>If you need help setting things up, just reply to this email — I read every message personally.</p>
        <p>— Vipin<br>Founder, FynBack</p>
    </div>
    <div class="footer">
        <p>© 2026 FynBack Inc.</p>
        <p>Gurugram, India</p>
        <p><a href="https://fynback.com/unsubscribe" style="color:#6b7280;">Unsubscribe</a></p>
    </div>
</div>
</body>
</html>
        `,
      });

      if (error) {
        console.error(`[WelcomeWorker] Resend error for ${email}:`, error);
        throw new Error(`Resend error: ${JSON.stringify(error)}`);
      }

      console.log(`[WelcomeWorker] Welcome email sent to ${email}. ID: ${data?.id}`);
    },
    { connection: bullmqConnection }
  );

  worker.on('completed', (job) => {
    console.log(`[WelcomeWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[WelcomeWorker] Job ${job?.id} failed: ${err.message}`);

    // Add this job

  });

  console.log('[WelcomeWorker] Worker started, listening on "welcomeQueue"');
  return worker;
}
