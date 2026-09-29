import { inngest } from '../client';
import { runConsistencyCheck } from '../../maintenance/consistency';
export const consistencyCheck = inngest.createFunction(
  { id: 'maintenance-consistency-check', retries: 5, triggers: [{ cron: '0 4 * * *' }] },
  async ({ step }) => step.run('verify-and-repair-projections', () => runConsistencyCheck()),
);
