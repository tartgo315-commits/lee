import { handleAssistant } from '../functions/_assistant-service.js';
export default async function handler(req,res){
 try{let raw;if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);else{const chunks=[];let size=0;for await(const c of req){size+=Buffer.byteLength(c);if(size>120000){res.status(413).json({error:'相关数据过多'});return;}chunks.push(c);}raw=Buffer.concat(chunks.map(c=>Buffer.from(c))).toString('utf8');}
 if(Buffer.byteLength(raw||'')>120000){res.status(413).json({error:'相关数据过多'});return;}
 const headers=new Headers();for(const [key,value]of Object.entries(req.headers||{}))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):String(value));
 const scheme=String(req.headers['x-forwarded-proto']||'https').split(',')[0],url=scheme+'://'+(req.headers.host||'localhost')+'/api/ledger-assistant';
 const aborter=new AbortController();req.once?.('aborted',()=>aborter.abort());res.once?.('close',()=>{if(!res.writableEnded)aborter.abort();});const request=new Request(url,{signal:aborter.signal,method:req.method||'GET',headers,...(!['GET','HEAD'].includes(req.method)?{body:raw||''}:{})});const response=await handleAssistant(request,process.env);
 res.statusCode=response.status;for(const [key,value]of response.headers)res.setHeader(key,value);res.end(await response.text());
 }catch{res.status(500).json({error:'AI 分析暂不可用'});}
}
