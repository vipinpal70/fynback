export interface GatewayConnectedJobData {
  email: string;
  fullName: string;
  gatewayName: string;   // e.g. 'razorpay' | 'stripe'
  webhookUrl: string;    // e.g. https://app.fynback.com/api/webhooks/razorpay
  webhookSecret: string; // shown once — user copies into gateway dashboard
  testMode: boolean;
}
