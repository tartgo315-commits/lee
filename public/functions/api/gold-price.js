import { jsonResponse, optionsResponse } from '../_helpers.js';
import { fetchCcbGold } from '../_ccb-gold.js';
export async function onRequest({request}){
  if(request.method==='OPTIONS')return optionsResponse('GET, OPTIONS');
  if(request.method!=='GET')return jsonResponse({error:'method not allowed'},405);
  const headers={'Cache-Control':'no-store, max-age=0'};
  try{return jsonResponse(await fetchCcbGold(),200,headers);}
  catch{return jsonResponse({error:'建行官方报价暂不可用，请保留最后有效报价',source:'ccb_redemption',stale:true},502,headers);}
}
