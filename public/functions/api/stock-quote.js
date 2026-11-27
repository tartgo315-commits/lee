import {jsonResponse,optionsResponse} from '../_helpers.js';
import {fetchNasdaqQuote} from '../_nasdaq-quote.js';
export async function onRequest({request}){
 if(request.method==='OPTIONS')return optionsResponse('GET, OPTIONS');
 if(request.method!=='GET')return jsonResponse({error:'method not allowed'},405);
 const symbol=(new URL(request.url).searchParams.get('symbol')||'').trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)||symbol.endsWith('.AX'))return jsonResponse({error:'invalid US symbol'},400);
 try{return jsonResponse(await fetchNasdaqQuote(symbol),200,{'Cache-Control':'no-store, max-age=0'});}
 catch{return jsonResponse({error:'股票报价暂不可用，请保留最后有效报价'},502,{'Cache-Control':'no-store'});}
}
