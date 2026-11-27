import { fetchCcbGold } from '../functions/_ccb-gold.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return res.status(405).json({error:'method not allowed'});
  try{return res.json(await fetchCcbGold());}
  catch{return res.status(502).json({error:'建行官方报价暂不可用，请保留最后有效报价',source:'ccb_redemption',stale:true});}
}
