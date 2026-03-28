export * from 'bullmq';
export * from './connection';

// Existing queues
export * from './queues/welcome.queue';
export * from './types/welcome.types';

// Gateway connected notification queue
export * from './queues/gateway.queue';
export * from './types/gateway.types';

// Payment recovery queues — core to the product
// recoveryQueue: retries + email + WhatsApp + SMS jobs
// analyticsQueue: daily snapshot computation
export * from './queues/recovery.queue';
export * from './types/recovery.types';

// Campaign (dunning sequence) queues
// campaignQueue: validate → schedule → execute steps → cancel on recovery
// paydayQueue: 1st + 25th of month payday notifications
export * from './queues/campaign.queue';
export * from './types/campaign.types';
