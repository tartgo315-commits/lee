/* Account suggestions never create, rename or move ledger records. */
(function(root){
 'use strict';const states=new Map(),custom='__custom_account__';
 function names(data,region,brokerOnly){
  const products=data?.products||[],rows=products.filter(p=>(!region||p.region===region)&&(!brokerOnly||p.type==='stock_us'||/tiger|券商|证券|broker/i.test(p.account||''))),out=[...new Set(rows.map(p=>String(p.account||'').trim()).filter(Boolean))];
  const defaults=brokerOnly?['Tiger','TIGER澳洲']:region==='au'?['TIGER澳洲']:region==='us'?['Tiger']:[];
  for(const name of defaults)if(!out.some(v=>v.toLowerCase()===name.toLowerCase()))out.push(name);return out;
 }
 function sync(id){const state=states.get(id);if(!state)return;const {input,select,options}=state,value=input.value.trim(),editing=select.value===custom&&!input.hidden&&!input.disabled,items=names(options.data(),options.region?.(),options.brokerOnly);if(value&&!editing&&!items.includes(value))items.push(value);
  const signature=JSON.stringify(items);if(signature!==state.signature){select.replaceChildren();for(const [v,text] of [['','请选择账户'],...items.map(v=>[v,v]),[custom,'＋ 自定义账户…']]){const option=document.createElement('option');option.value=v;option.textContent=text;select.append(option);}state.signature=signature;}
  select.value=editing?custom:value||'';select.disabled=input.disabled;input.hidden=!editing;
 }
 function bind(id,options){if(states.has(id)){if(states.get(id).input===document.getElementById(id)){sync(id);return;}states.delete(id);}const input=document.getElementById(id);if(!input)return;const select=document.createElement('select');select.id=id+'-select';select.setAttribute('data-native-dropdown','');select.setAttribute('aria-required','true');input.before(select);const label=document.querySelector('label[for="'+id+'"]');if(label)label.htmlFor=select.id;input.setAttribute('aria-label','自定义账户名称');input.placeholder='输入自定义账户名称';states.set(id,{input,select,options});
  const focus=input.focus.bind(input);input.focus=opts=>input.hidden?select.focus(opts):focus(opts);
  select.addEventListener('change',()=>{if(select.value===custom){input.hidden=false;input.value='';focus();}else{input.hidden=true;input.value=select.value;}input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});sync(id);
 }
 root.AccountPicker={bind,sync,names};
 document.addEventListener('DOMContentLoaded',()=>{bind('m-account',{data:()=>D,region:()=>document.getElementById('m-region').value});});
})(typeof globalThis!=='undefined'?globalThis:this);
