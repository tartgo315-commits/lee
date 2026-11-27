const months={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
export function parseEasternTime(text){
 const m=String(text||'').replace(/^Closed at\s+/i,'').match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(AM|PM)\s+(ET|EST|EDT)$/i);if(!m||months[m[1]]===undefined)return null;
 const hour=Number(m[4])%12+(m[7].toUpperCase()==='PM'?12:0),naive=Date.UTC(+m[3],months[m[1]],+m[2],hour,+m[5],+(m[6]||0));if(+m[4]<1||+m[4]>12||+m[5]>59||+(m[6]||0)>59)return null;
 const format=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 let at=naive;for(let i=0;i<3;i++){const p=format.formatToParts(new Date(at)),get=k=>+p.find(x=>x.type===k).value,shown=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'));at=naive-(shown-at);}
 const p=format.formatToParts(new Date(at)),get=k=>+p.find(x=>x.type===k).value;if(get('year')!==+m[3]||get('month')!==months[m[1]]+1||get('day')!==+m[2]||get('hour')!==hour||get('minute')!==+m[5])return null;return at;
}
export function parseNasdaqQuote(raw,symbol,now=Date.now()){
 const d=raw?.data;if(raw?.status?.rCode!==200||!d||d.symbol!==symbol||!['STOCKS','ETF'].includes(d.assetClass)||d.primaryData?.currency&&d.primaryData.currency!=='USD')throw Error('Nasdaq symbol unavailable');
 const q=d.primaryData,price=Number(String(q?.lastSalePrice||'').replace(/^\$/,'').replace(/,/g,'')),quoteAt=parseEasternTime(q?.lastTradeTimestamp);
 if(!(price>0)||!Number.isFinite(price)||!quoteAt||quoteAt>now+120000)throw Error('Nasdaq quote or timestamp unavailable');
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(quoteAt)),get=k=>+parts.find(p=>p.type===k).value,minute=get('hour')*60+get('minute');
 // Infer the session from the actual trade time, including early regular closes.
 const status=String(d.marketStatus||''),session=minute<240||minute>=1200?'overnight':minute<570?'pre':/After|Post/i.test(status)&&minute>=780?'post':minute<960?'regular':'post';
 return{symbol,price,currency:'USD',quoteAt,fetchedAt:now,session,marketState:status,source:'nasdaq',sourceUrl:'https://www.nasdaq.com/market-activity/'+(d.assetClass==='ETF'?'etf':'stocks')+'/'+symbol.toLowerCase(),delayed:q.isRealTime!==true};
}
export async function fetchNasdaqQuote(symbol,fetcher=fetch,now=Date.now){
 if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)||symbol.endsWith('.AX'))throw Error('Unsupported US symbol');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
 const etfs=new Set(['VOO','IVV','QQQM','QQQ','SPY','SGOV','SHV','BIL','GLD','TLT','IWM']);
 try{for(const asset of (etfs.has(symbol)?['etf','stocks']:['stocks','etf'])){const r=await fetcher('https://api.nasdaq.com/api/quote/'+encodeURIComponent(symbol)+'/info?assetclass='+asset+'&_='+now(),{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json','Referer':'https://www.nasdaq.com/','Cache-Control':'no-cache'},signal:controller.signal});if(!r.ok)continue;try{return parseNasdaqQuote(await r.json(),symbol,now());}catch{}}
 throw Error('Nasdaq quote unavailable');}finally{clearTimeout(timer);}
}
