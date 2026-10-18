import { handleAssistant } from '../_assistant-service.js';
export const onRequest=({request,env})=>handleAssistant(request,env);
