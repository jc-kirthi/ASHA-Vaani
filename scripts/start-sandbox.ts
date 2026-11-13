import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandboxData = path.join(projectRoot, 'data', 'sandbox');

process.env.ASHA_RECORDS_FILE ||= path.join(sandboxData, 'visit_records.json');
process.env.ASHA_BENEFICIARIES_FILE ||= path.join(sandboxData, 'beneficiaries.json');
if (!process.env.PORT) process.env.PORT = '3001';
if (!process.env.DISABLE_HMR) process.env.DISABLE_HMR = 'true';

await import('../server.ts');
