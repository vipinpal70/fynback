import { Queue } from 'bullmq';
import { bullmqConnection } from '../connection';

export const gatewayQueue = new Queue('gatewayQueue', {
  connection: bullmqConnection as any,
});
