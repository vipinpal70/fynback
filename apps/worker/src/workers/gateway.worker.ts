import { Worker } from 'bullmq';
import { bullmqConnection, GatewayConnectedJobData } from '@fynback/queue';
import { Resend } from 'resend';

const GATEWAY_LABELS: Record<string, string> = {
    razorpay: 'Razorpay',
    stripe: 'Stripe',
    cashfree: 'Cashfree',
    payu: 'PayU',
};

export function startGatewayWorker() {
    const worker = new Worker<GatewayConnectedJobData>(
        'gatewayQueue',
        async (job) => {
            const apiKey = process.env.RESEND_API_KEY;
            if (!apiKey) throw new Error('RESEND_API_KEY is not set');
            const resend = new Resend(apiKey);

            const { email, fullName, gatewayName, webhookUrl, webhookSecret, testMode } = job.data;
            const gatewayLabel = GATEWAY_LABELS[gatewayName] ?? gatewayName;
            const firstName = fullName.split(' ')[0];
            const dashboardUrl = 'https://app.fynback.com/dashboard/gateway';

            console.log(`[GatewayWorker] Sending gateway-connected email to ${email}`);

            const { data, error } = await resend.emails.send({
                from: 'FynBack <no-reply@fynback.com>',
                to: email,
                subject: `🎉 ${gatewayLabel} connected — FynBack is now working for you`,
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
    color: #e2e8f0;
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
    padding: 28px 32px;
    text-align: center;
    border-bottom: 1px solid #1f2937;
}
.header h1 { margin: 0; font-size: 26px; }
.header h1 .fyn { color: #22c55e; }
.header h1 .back { color: #ffffff; }
.header p { margin-top: 6px; font-size: 13px; color: #cbd5e1; }
.hero {
    padding: 32px;
    text-align: center;
    background: linear-gradient(180deg, #0f1f0f 0%, #0a0a0a 100%);
    border-bottom: 1px solid #1f2937;
}
.hero .badge {
    display: inline-block;
    background: #14532d;
    color: #4ade80;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 99px;
    margin-bottom: 14px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}
.hero h2 { font-size: 22px; margin: 0 0 10px; color: #f9fafb; }
.hero p { font-size: 14px; color: #cbd5e1; margin: 0; line-height: 1.6; }
.engine-box {
    margin: 24px 32px;
    padding: 20px;
    border-radius: 10px;
    background: #111827;
    border: 1px solid #374151;
    text-align: center;
}
.engine-box .icon { font-size: 28px; margin-bottom: 8px; }
.engine-box strong { display: block; font-size: 16px; color: #f9fafb; margin-bottom: 6px; }
.engine-box p { font-size: 13px; color: #cbd5e1; margin: 0; line-height: 1.6; }
.next-step {
    margin: 0 32px 24px;
    padding: 20px;
    border-radius: 10px;
    background: #0f172a;
    border: 1px solid #1e3a5f;
}
.next-step .label {
    font-size: 11px;
    font-weight: 700;
    color: #60a5fa;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 10px;
}
.next-step h3 { font-size: 15px; color: #f9fafb; margin: 0 0 10px; }
.next-step p { font-size: 13px; color: #cbd5e1; margin: 0 0 14px; line-height: 1.6; }
.step-list { list-style: none; margin: 0; padding: 0; }
.step-list li {
    font-size: 13px;
    color: #cbd5e1;
    padding: 5px 0;
    padding-left: 20px;
    position: relative;
}
.step-list li::before {
    content: "→";
    position: absolute;
    left: 0;
    color: #60a5fa;
}
.webhook-url {
    margin-top: 14px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 10px 12px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #7dd3fc;
    word-break: break-all;
}
.webhook-secret {
    margin-top: 8px;
    background: #1e293b;
    border: 1px dashed #4b5563;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    color: #94a3b8;
}
.webhook-secret .secret-label { color: #f59e0b; font-weight: 600; display: block; margin-bottom: 2px; }
.webhook-secret code { font-family: 'Courier New', Courier, monospace; word-break: break-all; color: #fde68a; }
${testMode ? `.testmode-warning {
    margin: 0 32px 20px;
    padding: 12px 16px;
    border-radius: 8px;
    background: #1c1508;
    border: 1px solid #78350f;
    font-size: 13px;
    color: #fcd34d;
}` : ''}
.cta { text-align: center; margin: 28px 32px; }
.cta a {
    display: inline-block;
    background: #22c55e;
    color: #000000 !important;
    padding: 14px 32px;
    border-radius: 8px;
    font-weight: 700;
    text-decoration: none;
    font-size: 15px;
    letter-spacing: 0.01em;
}
.founder {
    margin: 0 32px 28px;
    padding: 20px;
    background: #111827;
    border-radius: 10px;
    border-left: 3px solid #22c55e;
}
.founder p { font-size: 13px; color: #e2e8f0; margin: 0 0 10px; line-height: 1.7; }
.founder p:last-child { margin-bottom: 0; }
.footer {
    background: #020617;
    padding: 20px;
    text-align: center;
    font-size: 12px;
    color: #94a3b8;
    border-top: 1px solid #1f2937;
}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1><span class="fyn">Fyn</span><span class="back">Back</span></h1>
        <p>The smart payment recovery engine</p>
    </div>
    <div class="hero">
        <div class="badge">✅ Gateway Connected</div>
        <h2>You're all set, ${firstName}!</h2>
        <p>Your ${gatewayLabel} account is now linked to FynBack.<br>
        The recovery engine is already watching for failed payments.</p>
    </div>

    <div class="engine-box">
        <div class="icon">⚙️</div>
        <strong>Your engine is running</strong>
        <p>FynBack is now silently working in the background — monitoring every payment,
        flagging failures, and preparing to recover them automatically.
        You don't need to do a thing. We've got it from here.</p>
    </div>

    ${testMode ? `<div class="testmode-warning">
        ⚠️ <strong>Test mode detected</strong> — You connected a test API key. No real payments will be recovered until you switch to live keys.
    </div>` : ''}

    <div class="next-step">
        <div class="label">Next Step</div>
        <h3>Connect your webhook for live payment updates</h3>
        <p>Right now FynBack syncs your recent history, but to catch every failed payment
        the <em>moment</em> it happens, paste this webhook URL into your ${gatewayLabel} dashboard:</p>
        <ol class="step-list">
            <li>Go to your <strong>${gatewayLabel} Dashboard</strong> → Developer / Webhooks</li>
            <li>Add a new endpoint and paste the URL below</li>
            <li>Use the secret below to verify webhook signatures</li>
        </ol>
        <div class="webhook-url">${webhookUrl}</div>
        <div class="webhook-secret">
            <span class="secret-label">🔑 Webhook Secret (save this now — shown once)</span>
            <code>${webhookSecret}</code>
        </div>
        <p style="margin-top:12px; font-size:12px; color:#64748b;">
            You can also find this anytime in your <a href="${dashboardUrl}" style="color:#60a5fa;">FynBack dashboard</a>.
        </p>
    </div>

    <div class="cta">
        <a href="${dashboardUrl}">Open Gateway Dashboard →</a>
    </div>

    <div class="founder">
        <p>Hey ${firstName},</p>
        <p>I wanted to personally say — connecting your gateway is the most important step,
        and you just did it. Most teams set this up and forget about it, and that's exactly
        how it should work. FynBack runs quietly in the background, doing the heavy lifting
        so you never have to chase a failed payment manually again.</p>
        <p>If you ever feel stuck, have a question, or just want to share how things are going —
        reply to this email. I personally read every single reply. No ticket system, no bot.
        Just me.</p>
        <p>You're in good hands. 🙌</p>
        <p>— Vipin<br>Founder, FynBack</p>
    </div>

    <div class="footer">
        <p>© 2026 FynBack Inc. · Gurugram, India</p>
        <p><a href="https://fynback.com/unsubscribe" style="color:#94a3b8;">Unsubscribe</a></p>
    </div>
</div>
</body>
</html>
        `,
            });

            if (error) {
                console.error(`[GatewayWorker] Resend error for ${email}:`, error);
                throw new Error(`Resend error: ${JSON.stringify(error)}`);
            }

            console.log(`[GatewayWorker] Gateway-connected email sent to ${email}. ID: ${data?.id}`);
        },
        { connection: bullmqConnection }
    );

    worker.on('completed', (job) => {
        console.log(`[GatewayWorker] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[GatewayWorker] Job ${job?.id} failed: ${err.message}`);
    });

    console.log('[GatewayWorker] Worker started, listening on "gatewayQueue"');
    return worker;
}
