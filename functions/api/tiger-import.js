import { handleTiger } from '../_tiger-service.js';
export const onRequest=({request,env})=>handleTiger(request,env);
