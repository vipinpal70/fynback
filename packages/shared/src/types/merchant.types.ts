export interface Merchant {
    id: string;
    companyName: string;
    status: 'onboarding' | 'active' | 'trial_expired' | 'suspended' | 'cancelled';
}

export type TeamRole = 'owner' | 'admin' | 'viewer';
