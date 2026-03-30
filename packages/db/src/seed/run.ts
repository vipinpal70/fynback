import { seedCampaignDefaults } from './campaigns.seed';
import { createDb } from '../index';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[Seed] DATABASE_URL environment variable is required');
  process.exit(1);
}

const db = createDb(url);

seedCampaignDefaults(db)
  .then(() => process.exit(0))
  .catch((err: Error) => {
    console.error('[Seed] Error:', err);
    process.exit(1);
  });
