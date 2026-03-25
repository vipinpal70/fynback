export interface WelcomeJobData {
  onboardRedis: {
    clerkUserId: string;
    merchantId: string;
    email: string;
    fullName: string;
    companyName: string;
    status: string;
    onboardingStep: number;
    trialEndsAt: string;
    plan: string;
    trialActivationPaid: boolean;
    mrrRange: string;
  };
}
