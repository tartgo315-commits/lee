// Official page script operate_cpjs.js maps Cst_Sell_Prc to redemption price.
export const CCB_PAGE='https://gold.ccb.com/chn/home/gold_new/cpjs/index.shtml';
export const CCB_BASE='https://gold.ccb.com/tran/WCCMainPlatV5?CCB_IBSVersion=V5&SERVLET_NAME=WCCMainPlatV5&TXCODE=';
export const GOLD_STALE_MS=180000;
export function parseCcbGold(data,now=Date.now()){
  if(!data||(data.SUCCESS!==true&&data.SUCCESS!=='true')||data.retCode!=='000000'||data.CcyCd!=='156'||data.PM_Txn_Vrty_Cd!=='33')throw Error('CCB invalid product or response');
  const price=Number(data.Cst_Sell_Prc),buyPrice=Number(data.Cst_Buy_Prc);
  const match=String(data.Tms||'').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  if(!match||!(price>100&&price<20000)||!(buyPrice>=price&&buyPrice<20000))throw Error('CCB invalid quote');
  const quoteAt=match[1]+'T'+match[2]+'+08:00',at=Date.parse(quoteAt);
  if(!Number.isFinite(at)||at>now+60000)throw Error('CCB invalid timestamp');
  return{price,buyPrice,source:'ccb_redemption',sourceName:'建设银行黄金积存赎回价',sourceUrl:CCB_PAGE,quoteAt,fetchedAt:new Date(now).toISOString(),unit:'CNY/g',stale:now-at>GOLD_STALE_MS};
}
function cookiesOf(response){
  const values=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')||''];
  return values.flatMap(v=>v.split(/,(?=\s*[^;,=\s]+=)/)).map(v=>v.trim().split(';')[0]).filter(Boolean).join('; ');
}
export async function fetchCcbGold(fetcher=fetch,now=Date.now){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  const headers={Referer:CCB_PAGE,'User-Agent':'Mozilla/5.0','Accept':'application/json, text/plain, */*','Cache-Control':'no-cache'};
  try{
    const session=await fetcher(CCB_BASE+'100119',{headers,signal:controller.signal});
    if(!session.ok)throw Error('CCB session HTTP '+session.status);
    const cookie=cookiesOf(session);await session.text();
    const response=await fetcher(CCB_BASE+'NGJS01&_='+now(),{headers:{...headers,...(cookie?{Cookie:cookie}:{})},signal:controller.signal});
    if(!response.ok)throw Error('CCB quote HTTP '+response.status);
    return parseCcbGold(await response.json(),now());
  }finally{clearTimeout(timer);}
}
