import { createServer } from 'node:http';
import { readBrief, authHeaders } from './lib/providers.ts';
import { normalizeClient, openAIFromCanonical, anthropicFromCanonical, geminiFromCanonical, writeOpenAI, writeAnthropic } from './lib/wire.ts';

const caps:any={groq:9,cerebras:5,gemini:6,zai:4,openrouter:10,sambanova:4,pollinations:10,cloudflare:7,ovh:5,kilol:12};
const fixed=1700000000;
const json=(res:any,v:any,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(v));};
const bodyOf=(req:any)=>new Promise<any>((resolve,reject)=>{let s='';req.on('data',(x:any)=>s+=x);req.on('end',()=>{try{resolve(JSON.parse(s||'{}'));}catch(e){reject(e);}});});
const textOf=(v:any)=>typeof v==='string'?v:Array.isArray(v)?v.filter(x=>x?.type==='text').map(x=>x.text).join('\n'):'';
async function main(){
 const brief=readBrief(); if(process.argv.includes('--list')){const catalog=brief?makeCatalog(brief):{providers:[]};process.stdout.write(JSON.stringify(catalog));return;}
 if(!brief||!process.env.MAKEFUN_ENV_URL) return;
 const env=process.env.MAKEFUN_ENV_URL; const catalog=makeCatalog(brief);
 const counts:any={},fails:any={},dead=new Set<string>(); for(const p of brief.directory){counts[p.id]=0;fails[p.id]=0;} let arrival=0;
 const models=brief.ratings;
 const server=createServer(async(req:any,res:any)=>{
  try{
   if(req.method==='GET'&&req.url==='/v1/models'){const unique=[...new Set(models.map(x=>x.model))]; if(req.headers['x-api-key'])return json(res,{data:unique.map(id=>({type:'model',id,display_name:id,created_at:'2026-01-01T00:00:00Z',free:true})),has_more:false});return json(res,{object:'list',data:unique.map(id=>({id,object:'model',created:fixed,owned_by:'free-model-aggregator',free:true}))});}
   if(req.method!=='POST'||!['/v1/chat/completions','/v1/messages'].includes(req.url))return json(res,{error:'not_found'},404);
   const api=req.url.endsWith('/messages')?'anthropic':'openai', b=await bodyOf(req);
   const canonical=normalizeClient(b,api);
   const row=brief.manifest[arrival++];
   const reqs=row?.requires??{tools:Array.isArray(b.tools)&&b.tools.length>0,vision:JSON.stringify(b).includes('image_url'),json:['json_object','json_schema'].includes(b.response_format?.type)};
   const jsonMode=canonical.json;
   const eligible=models.filter((m:any)=>m.free&&(!reqs.tools||m.tools)&&(!reqs.vision||m.vision)&&(!reqs.json||m.json)&&(!reqs.min_context||m.context_length>=reqs.min_context)&&(!jsonMode||brief.directory.find((p:any)=>p.id===m.provider)?.wire!=='anthropic'));
   eligible.sort((a:any,c:any)=>{const pa=brief.directory.find((x:any)=>x.id===a.provider),pc=brief.directory.find((x:any)=>x.id===c.provider);return Number(counts[a.provider]>=caps[a.provider])-Number(counts[c.provider]>=caps[c.provider])||c.rating_milli-a.rating_milli||counts[a.provider]-counts[c.provider]||a.provider.localeCompare(c.provider)||a.model.localeCompare(c.model);});
   for(const m of eligible){const p=brief.directory.find((x:any)=>x.id===m.provider);if(dead.has(p.id))continue;counts[p.id]++;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let response:any;
    try{let path='',data:any;
     if(p.wire==='openai'){path=`${env}${p.path}/v1/chat/completions`;data=openAIFromCanonical(canonical,m.model);}
     else if(p.wire==='anthropic'){path=`${env}${p.path}/v1/messages`;data=anthropicFromCanonical(canonical,m.model);}
     else {path=`${env}${p.path}/v1beta/models/${encodeURIComponent(m.model)}:${canonical.stream?'streamGenerateContent?alt=sse':'generateContent'}`;data=geminiFromCanonical(canonical);}
     const headers:any={'content-type':'application/json',...authHeaders(p)};if(p.wire==='anthropic')headers['anthropic-version']='2023-06-01';
     response=await fetch(path,{method:'POST',headers,body:JSON.stringify(data),signal:controller.signal});
     if(!response.ok){fails[p.id]++;if(fails[p.id]>=3)dead.add(p.id);continue;}
     let out='',usage:any={input:0,output:0};
     if(!canonical.stream){const v=await response.json();if(p.wire==='openai'){out=v.choices?.[0]?.message?.content??'';usage={input:v.usage?.prompt_tokens??0,output:v.usage?.completion_tokens??0};}else if(p.wire==='anthropic'){out=(v.content??[]).map((x:any)=>x.text??'').join('');usage={input:v.usage?.input_tokens??0,output:v.usage?.output_tokens??0};}else{out=(v.candidates?.[0]?.content?.parts??[]).map((x:any)=>x.text??'').join('');usage={input:v.usageMetadata?.promptTokenCount??0,output:v.usageMetadata?.candidatesTokenCount??0};}
     }else{const raw=await response.text();if(p.wire==='openai'){for(const f of raw.split(/\r?\n\r?\n/)){const d=f.split(/\r?\n/).find((x:string)=>x.startsWith('data: '))?.slice(6);if(!d||d==='[DONE]')continue;try{const x=JSON.parse(d);out+=x.choices?.[0]?.delta?.content??'';if(x.usage)usage={input:x.usage.prompt_tokens??0,output:x.usage.completion_tokens??0};}catch{}}}else if(p.wire==='anthropic'){for(const f of raw.split(/\r?\n\r?\n/)){const d=f.split(/\r?\n/).find((x:string)=>x.startsWith('data: '))?.slice(6);if(!d)continue;try{const x=JSON.parse(d);out+=x.delta?.text??'';if(x.message?.usage)usage.input=x.message.usage.input_tokens??0;if(x.usage?.output_tokens)usage.output=x.usage.output_tokens;}catch{}}}else{for(const f of raw.split(/\r?\n\r?\n/)){const d=f.split(/\r?\n/).find((x:string)=>x.startsWith('data: '))?.slice(6);if(!d)continue;try{const x=JSON.parse(d);out+=(x.candidates?.[0]?.content?.parts??[]).map((z:any)=>z.text??'').join('');if(x.usageMetadata)usage={input:x.usageMetadata.promptTokenCount??0,output:x.usageMetadata.candidatesTokenCount??0};}catch{}}}}
     fails[p.id]=0; if(api==='openai')writeOpenAI(res,m.model,out,usage,canonical.stream);else writeAnthropic(res,m.model,out,usage,canonical.stream);return;
    }catch{fails[p.id]++;if(fails[p.id]>=3)dead.add(p.id);}finally{clearTimeout(timer);}
   }
   json(res,{error:{message:'No free provider available',type:'server_error'}},503);
  }catch{json(res,{error:'invalid request'},400);}
 });
 await new Promise<void>(resolve=>server.listen(0,'0.0.0.0',resolve)); const port=(server.address() as any).port;
 await fetch(`${env}/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocol_version:1,port,catalog})});
 const stop=()=>{server.close(()=>process.exit(0));};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 while(true){await new Promise(r=>setTimeout(r,100));try{const w=await (await fetch(`${env}/work`)).json() as any;if(w.done){server.close();return;}}catch{}}
}
function makeCatalog(b:any){return {providers:b.directory.map((p:any)=>({id:p.id,base_url:p.path,key_env:p.key_env,wire:p.wire,models:b.ratings.filter((m:any)=>m.provider===p.id&&m.free).map((m:any)=>({id:m.model,free:true,context_length:m.context_length})).sort((a:any,c:any)=>a.id.localeCompare(c.id))}))};}
main().catch(()=>process.exit(1));
