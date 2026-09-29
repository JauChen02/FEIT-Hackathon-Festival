import '@learnarena/db/loadEnv';
import { runConsistencyCheck } from '../lib/maintenance/consistency';
import { getDatabase } from '@learnarena/db';
try {
  console.log(JSON.stringify(await runConsistencyCheck(), null, 2));
} finally {
  await getDatabase().close();
}
