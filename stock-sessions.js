/* Provider quote times stay distinct from retrieval times. No credentials or requests. */
(function(root){
  'use strict';
  const keys=['regular','pre','post','overnight'],labels={regular:'常规',pre:'盘前',post:'盘后',overnight:'夜盘'},num=v=>{v=v?.raw??v;if(v==null||typeof v==='boolean'||typeof v==='string'&&!v.trim())return null;const n=Number(v);return Number.isFinite(n)&&n>0?n:null;};
  const time=v=>{const n=num(v);return n===null?null:n>1e12?n:Math.round(n*1000);};
  function session(at){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)),get=k=>parts.find(p=>p.type===k)?.value,minute=Number(get('hour'))*60+Number(get('minute'));return{kind:minute<240||minute>=1200?'overnight':minute<570?'pre':minute<960?'regular':'post',day:get('weekday'),minute};}
  function nightWindow(now){const s=session(now);return s.kind==='overnight'&&(s.minute>=1200?['Sun','Mon','Tue','Wed','Thu'].includes(s.day):['Mon','Tue','Wed','Thu','Fri'].includes(s.day));}
  function point(price,at,source='yahoo',reference=false){const p=num(price);return p?{price:p,at:time(at),source,reference}:null;}
  function parse(raw){if(typeof raw==='string'){try{return JSON.parse(raw);}catch{return null;}}return raw;}
  function merge(a,b){const out={symbol:b?.symbol||a?.symbol||'',fetchedAt:Math.max(a?.fetchedAt||0,b?.fetchedAt||0),marketState:b?.marketState||a?.marketState||''};for(const k of [...keys,'fullDay']){const x=a?.[k],y=b?.[k];out[k]=!x?y||null:!y?x:((y.at||0)>(x.at||0)||(y.at||0)===(x.at||0)&&(b?.fetchedAt||0)>=(a?.fetchedAt||0))?y:x;}return out;}
  function fromQuote(raw,symbol='',now=Date.now()){
    const data=parse(raw),q=data?.quoteResponse?.result?.find(r=>!symbol||String(r.symbol).toUpperCase()===symbol.toUpperCase())||data;if(!q||typeof q!=='object')return null;
    const out={symbol:String(q.symbol||symbol).toUpperCase(),fetchedAt:now,marketState:String(q.marketState||'').toUpperCase()};
    for(const [key,prefix] of [['regular','regularMarket'],['pre','preMarket'],['post','postMarket'],['overnight','overnightMarket']])out[key]=point(q[prefix+'Price'],q[prefix+'Time']);
    out.fullDay=point(q.fulldayPrice,null,'yahoo-24h',true);if(out.fullDay)out.fullDay.fetchedAt=now;return keys.some(k=>out[k])||out.fullDay?out:null;
  }
  function fromChart(raw,symbol='',now=Date.now()){
    const result=parse(raw)?.chart?.result?.[0];if(!result)return null;const meta=result.meta||{},out=fromQuote(meta,symbol,now)||{symbol:String(meta.symbol||symbol).toUpperCase(),fetchedAt:now,marketState:''};
    const stamps=result.timestamp||[],close=result.indicators?.quote?.[0]?.close||[];
    for(let i=0;i<stamps.length;i++){const row=point(close[i],stamps[i]);if(!row?.at||row.at>now+120000)continue;const kind=session(row.at).kind;if(!out[kind]?.at||row.at>out[kind].at)out[kind]=row;}
    return keys.some(k=>out[k])||out.fullDay?out:null;
  }
  function select(snapshot,now=Date.now()){
    if(!snapshot)return null;
    const candidates=keys.map(kind=>snapshot[kind]?{...snapshot[kind],kind}:null).filter(p=>p?.at&&p.at<=now+120000).sort((a,b)=>b.at-a.at);
    const latest=candidates[0]||null,full=snapshot.fullDay;
    // Yahoo's fullday field has no execution timestamp: always labelled reference.
    const fullRetrieved=full?.fetchedAt||snapshot.fetchedAt;
    if(full?.price&&nightWindow(now)&&now-fullRetrieved>=0&&now-fullRetrieved<600000&&(!latest||latest.kind!=='overnight'||fullRetrieved-latest.at>900000))return{...full,kind:'overnight',label:'夜盘 / 24h参考',estimated:true,at:null,fetchedAt:fullRetrieved};
    if(latest)return{...latest,label:labels[latest.kind],estimated:false,fetchedAt:snapshot.fetchedAt};
    const state={REGULAR:'regular',PRE:'pre',PREPRE:'pre',PREOPEN:'pre',POST:'post',POSTPOST:'post',OVERNIGHT:'overnight',EXTENDED:'overnight'}[snapshot.marketState];
    const kind=state&&snapshot[state]?state:keys.find(k=>snapshot[k]);return kind?{...snapshot[kind],kind,label:labels[kind]+'参考',estimated:true,fetchedAt:snapshot.fetchedAt}:null;
  }
  root.StockSessions={keys,labels,session,nightWindow,point,merge,fromQuote,fromChart,select};
})(typeof globalThis!=='undefined'?globalThis:this);
