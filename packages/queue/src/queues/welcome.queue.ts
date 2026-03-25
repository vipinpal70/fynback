import { Queue } from 'bullmq';
import { bullmqConnection } from '../connection';

export const welcomeQueue = new Queue('welcomeQueue', { 
  connection: bullmqConnection as any 
});
