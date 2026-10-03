import { config } from 'dotenv';
import { connectInfra, processQueued,safeFailure } from './infraestrutura-import-lib.mjs';
config({ path: process.env.INFRA_ENV_FILE || '../../.env',override: false,quiet: true });
let pool;
try {
  pool = connectInfra();
  for (let index = 0; index < 3; index++) {
    const result = await processQueued(pool);
    if (!result) break;
    console.log(JSON.stringify({ cycleId: result.id,status: 'PASSED',checked: result.validation.ok,total: result.validation.total }));
  }
} catch (error) { console.error(safeFailure(error,'Falha no importador SICRO.')); process.exitCode = 1; }
finally { if (pool) await pool.end(); }
