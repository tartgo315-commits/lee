import { handleLedgerSync } from '../_ledger-sync-service.js';
export const onRequest=({request,env})=>handleLedgerSync(request,env);
