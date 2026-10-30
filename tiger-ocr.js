/* Device-only OCR. No screenshot, text, or account data is sent to a server. */
(function(root){
 'use strict';
 const ASSETS='/vendor/tesseract',empty=()=>({currency:'UNKNOWN',totalAssets:null,securitiesValue:null,cash:null,dailyPnl:null,holdingPnl:null});
 function words(tsv,scale=1,offset={x:0,y:0}){return String(tsv||'').split('\n').slice(1).map(l=>l.split('\t')).filter(c=>c[0]==='5'&&c.length>=12&&c[11].trim()).map(c=>({text:c.slice(11).join('\t').trim(),x:Number(c[6])/scale+offset.x,y:Number(c[7])/scale+offset.y,w:Number(c[8])/scale,h:Number(c[9])/scale,confidence:Number(c[10])}));}
 const center=w=>w.y+w.h/2;
 function numeric(raw){const s=String(raw||'').trim().replace(/[，]/g,',').replace(/[−–]/g,'-');if(!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(s))return null;const n=Number(s.replace(/,/g,''));return Number.isFinite(n)?n:null;}
 function layout(tokens,pixels,width,height){
  const usd=tokens.filter(w=>/^USD$/i.test(w.text)&&w.x>width*0.45).sort((a,b)=>a.y-b.y);
  if(!usd.length)return null;
  const right=Math.max(...usd.map(w=>w.x));const rows=usd.filter(w=>Math.abs(w.x-right)<width*.03);
  if(rows.length>100)return null;
  const top=rows[0].y,bottom=Math.min(height-1,rows.at(-1).y+rows.at(-1).h);
  const headers=tokens.filter(w=>/当前|Current/i.test(w.text)&&w.y<top&&top-w.y<Math.max(100,height*.15));
  const header=headers.sort((a,b)=>b.y-a.y)[0];if(!header)return null;
  const edges=[];let last=-10;
  for(let x=0;x<width;x++){
   let hits=0,total=0;for(let y=Math.ceil(top);y<=bottom;y+=2){const i=(y*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2],v=(r+g+b)/3;total++;if(Math.max(r,g,b)-Math.min(r,g,b)<35&&(v>=27&&v<=90||v>=170&&v<=235))hits++;}
   if(total&&hits/total>.88){if(x-last>6)edges.push(x);else edges[edges.length-1]=x;last=x;}
  }
  const hx=header.x+header.w/2,index=edges.findIndex((x,i)=>x<=hx&&edges[i+1]>hx);
  if(index<0||!edges[index+9])return null;
  const columns={currentPrice:[edges[index],edges[index+1]],marketValue:[edges[index+4],edges[index+5]],costPrice:[edges[index+5],edges[index+6]],shares:[edges[index+6],edges[index+7]],ticker:[edges[index+8],edges[index+9]]};
  const quantity=tokens.find(w=>/数量/.test(w.text)&&Math.abs(w.y-header.y)<25&&w.x>header.x&&w.x<columns.shares[1]);
  if(!quantity||quantity.x<columns.shares[0]-20)return null;
  if(columns.ticker[1]>=right||Object.values(columns).some(([a,b])=>b-a<12))return null;
  return{rows,columns,left:edges[index-1]||0,summaryLeft:edges[index-2]||0,top:Math.max(0,Math.floor(top-10)),bottom:Math.min(height,Math.ceil(bottom+10)),header};
 }
 function columnValues(tokens,rows,key){return rows.map(row=>{const candidates=tokens.filter(w=>Math.abs(center(w)-center(row))<Math.max(row.h*1.1,12)).sort((a,b)=>a.x-b.x);if(!candidates.length)return null;const raw=candidates.map(w=>w.text).join('');return key==='ticker'&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(raw)?raw:key==='ticker'?null:numeric(raw);});}
 function summary(tokens,table){
  const out=empty();if(!table)return out;
  const left=tokens.filter(w=>w.x<table.header.x-60);
  const grouped=[];for(const w of left.sort((a,b)=>a.y-b.y||a.x-b.x)){let line=grouped.find(l=>Math.abs(l.y-center(w))<8);if(!line){line={y:center(w),words:[]};grouped.push(line);}line.words.push(w);}
  const lines=grouped.map(l=>({y:l.y,text:l.words.sort((a,b)=>a.x-b.x).map(w=>w.text).join(''),words:l.words}));
  const aud=lines.find(l=>/AUD/i.test(l.text)&&/\d/.test(l.text)&&l.y>table.header.y);
  if(aud){out.currency='AUD';const m=aud.text.match(/AUD\s*([\d,]+\.\d{2})/i);if(m)out.totalAssets=numeric(m[1]);}
  for(const [key,label]of [['securitiesValue',/证券总价值|證券總值/],['cash',/预估现[金全]额|預估現金/],['dailyPnl',/今日盈亏/],['holdingPnl',/持仓盈亏/]]){const line=lines.find(l=>label.test(l.text)&&l.y>table.header.y);if(line){const m=line.text.match(/(?<![\d,.])[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/);if(m&&(!['dailyPnl','holdingPnl'].includes(key)||/^[+-]/.test(m[0])))out[key]=numeric(m[0]);}}
  return out;
 }
 let script;
 function load(){if(root.Tesseract)return Promise.resolve();if(!script)script=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=ASSETS+'/tesseract.min.js';s.onload=resolve;s.onerror=()=>{script=null;s.remove();reject(Error('免费识别组件下载失败，请检查网络或手动填写'));};document.head.append(s);});return script;}
 function prepared(source,rect,scale){
  const c=document.createElement('canvas');c.width=Math.round(rect.width*scale);c.height=Math.round(rect.height*scale);const context=c.getContext('2d',{willReadFrequently:true});context.drawImage(source,rect.left,rect.top,rect.width,rect.height,0,0,c.width,c.height);
  const image=context.getImageData(0,0,c.width,c.height),d=image.data;let total=0,count=0;for(let i=0;i<d.length;i+=400){total+=(d[i]+d[i+1]+d[i+2])/3;count++;}const dark=total/count<130;
  for(let i=0;i<d.length;i+=4){let v=Math.max(d[i],d[i+1],d[i+2]);if(dark)v=255-v;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}context.putImageData(image,0,0);return c;
 }
 async function recognize(file,{onProgress=()=>{},signal}={}){
  let worker,image;const check=()=>{if(signal?.aborted)throw Error('已取消识别');};
  const abort=()=>{if(worker)void worker.terminate().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
   onProgress('正在加载免费识别组件，首次打开需要下载…');await load();check();
   const url=URL.createObjectURL(file);try{image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('无法读取图片，请选择 PNG、JPEG 或 WebP'));img.src=url;});}finally{URL.revokeObjectURL(url);}check();
   if(image.width*image.height>16000000)throw Error('图片分辨率过高，请裁剪到持仓表和账户汇总后重试');
   const source=document.createElement('canvas');source.width=image.width;source.height=image.height;const context=source.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);const pixels=context.getImageData(0,0,source.width,source.height).data;
   worker=await root.Tesseract.createWorker(['eng','chi_sim'],1,{workerPath:ASSETS+'/worker.min.js',corePath:ASSETS,langPath:ASSETS+'/lang',workerBlobURL:false,logger:m=>{if(m.status==='recognizing text')onProgress('正在本机识别 '+Math.round(m.progress*100)+'%…');}});check();
   const scale=Math.min(3,Math.sqrt(10000000/(source.width*source.height))),full=prepared(source,{left:0,top:0,width:source.width,height:source.height},scale);
   let result=await worker.recognize(full,{}, {tsv:true});check();const all=words(result.data.tsv,scale),table=layout(all,pixels,source.width,source.height),rawText=result.data.text;full.width=full.height=1;
   const output={rows:[],summary:summary(all,table),warnings:['免费文字识别可能误认小数点或代码，请对照原图核对所有字段。账户汇总未识别的字段留空，不会猜测。'],rawText};
   if(!table){output.warnings.push('未匹配到完整的 Tiger 电脑端持仓表。请上传包含表头、代码列和 USD 币种列的清晰原图，或点击“补充漏识别持仓”手动填写。');return output;}
   if(table.left-table.summaryLeft>100){
    onProgress('正在识别 AUD 账户汇总…');await worker.setParameters({tessedit_pageseg_mode:'6'});
    const rect={left:table.summaryLeft+3,top:table.top,width:table.left-table.summaryLeft-6,height:source.height-table.top},zoom=4,crop=prepared(source,rect,zoom);
    const account=await worker.recognize(crop,{}, {tsv:true});check();const parsed=summary(words(account.data.tsv,zoom,{x:rect.left,y:rect.top}),table);
    for(const [k,v]of Object.entries(parsed))if(v!==null&&v!=='UNKNOWN')output.summary[k]=v;crop.width=crop.height=1;
   }
   await worker.reinitialize('eng');check();await worker.setParameters({tessedit_pageseg_mode:'6'});
   const values={};for(const [key,[a,b]]of Object.entries(table.columns)){check();onProgress('正在逐列校对 '+({currentPrice:'股价',marketValue:'市值',costPrice:'成本',shares:'数量',ticker:'代码'}[key])+'…');await worker.setParameters({tessedit_char_whitelist:key==='ticker'?'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-':'0123456789.,-'});const rect={left:a+3,top:table.top,width:b-a-6,height:table.bottom-table.top},zoom=Math.min(5,Math.max(2,1000/rect.height)),crop=prepared(source,rect,zoom);result=await worker.recognize(crop,{}, {tsv:true});check();values[key]=columnValues(words(result.data.tsv,zoom,{x:rect.left,y:rect.top}),table.rows,key);crop.width=crop.height=1;}
   output.rows=table.rows.map((_,i)=>({ticker:values.ticker[i]||'',shares:values.shares[i],currentPrice:values.currentPrice[i],costPrice:values.costPrice[i],marketValue:values.marketValue[i],currency:'USD'}));
   for(const r of output.rows){if(r.shares!==null&&r.currentPrice!==null&&r.marketValue!==null&&Math.abs(r.shares*r.currentPrice-r.marketValue)>Math.max(.05,Math.abs(r.marketValue)*.002))output.warnings.push((r.ticker||'某行')+' 数量 × 股价与截图市值不一致，请特别核对小数点。');}
   source.width=source.height=1;return output;
  }finally{signal?.removeEventListener('abort',abort);if(worker)try{await worker.terminate();}catch{}}
 }
 root.TigerOCR={words,numeric,layout,columnValues,summary,recognize};
})(globalThis);
