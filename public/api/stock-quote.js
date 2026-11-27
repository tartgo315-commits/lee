import {fetchNasdaqQuote} from '../functions/_nasdaq-quote.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');if(req.method!=='GET')return res.status(405).json({error:'method not allowed'});
 const symbol=String(req.query.symbol||'').trim().toUpperCase();if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)||symbol.endsWith('.AX'))return res.status(400).json({error:'invalid US symbol'});
 try{return res.json(await fetchNasdaqQuote(symbol));}catch{return res.status(502).json({error:'股票报价暂不可用，请保留最后有效报价'});}
}
