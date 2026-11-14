export function anthropicFromOpenAI(b: any, model: string) {
  const systems: string[] = [], blocks: any[] = [];
  for (const m of b.messages ?? []) {
    if (m.role === 'system' || m.role === 'developer') { const t = typeof m.content === 'string' ? m.content : (m.content ?? []).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n'); if(t) systems.push(t); }
    else if (m.role === 'user') {
      if (typeof m.content === 'string') blocks.push({type:'text',text:m.content});
      else for (const x of m.content ?? []) { if (x.type==='text') blocks.push({type:'text',text:x.text}); else if(x.type==='image_url') { const u=x.image_url.url, d=/^data:([^;]+);base64,(.*)$/s.exec(u); blocks.push(d?{type:'image',source:{type:'base64',media_type:d[1],data:d[2]}}:{type:'image',source:{type:'url',url:u}}); } }
    } else if (m.role === 'tool') blocks.push({type:'tool_result',tool_use_id:m.tool_call_id,content:m.content});
  }
  const r:any={model,max_tokens:b.max_tokens ?? b.max_completion_tokens ?? 1024,messages:[{role:'user',content:blocks.length===1&&blocks[0].type==='text'?blocks[0].text:blocks}]};
  if(systems.length)r.system=systems.join('\n'); if(b.tools)r.tools=b.tools.map((t:any)=>({name:t.function.name,description:t.function.description,input_schema:t.function.parameters}));
  if(b.stop!==undefined)r.stop_sequences=Array.isArray(b.stop)?b.stop:[b.stop]; if(b.stream!==undefined)r.stream=b.stream;
  return r;
}
// Canonical representation shared by both client APIs and all provider wires.
export function normalizeClient(b: any, api: 'openai'|'anthropic') {
  const systems:string[]=[], user:any[]=[], tools:any[]=[];
  if(api==='openai') {
    for(const m of b.messages??[]) {
      if(m.role==='system'||m.role==='developer') systems.push(typeof m.content==='string'?m.content:(m.content??[]).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n'));
      if(m.role==='user') { if(typeof m.content==='string')user.push({type:'text',text:m.content}); else for(const x of m.content??[]) {if(x.type==='text')user.push({type:'text',text:x.text});else if(x.type==='image_url'){const u=x.image_url.url,d=/^data:([^;]+);base64,(.*)$/s.exec(u);user.push(d?{type:'image',media_type:d[1],data:d[2]}:{type:'image',url:u});}} }
    }
    for(const t of b.tools??[])if(t?.function)tools.push({name:t.function.name,description:t.function.description,parameters:t.function.parameters});
  } else {
    const sys=typeof b.system==='string'?[b.system]:(b.system??[]).filter((x:any)=>x.type==='text').map((x:any)=>x.text); systems.push(...sys);
    for(const m of b.messages??[]) if(m.role==='user') {if(typeof m.content==='string')user.push({type:'text',text:m.content});else for(const x of m.content??[]){if(x.type==='text')user.push({type:'text',text:x.text});else if(x.type==='image')user.push(x.source?.type==='base64'?{type:'image',media_type:x.source.media_type,data:x.source.data}:{type:'image',url:x.source?.url});}}
    for(const t of b.tools??[])tools.push({name:t.name,description:t.description,parameters:t.input_schema});
  }
  const stop=api==='openai'?b.stop:b.stop_sequences;
  return {system:systems.filter(Boolean).join('\n'),user,tools,max_tokens:b.max_tokens??b.max_completion_tokens,stop:stop===undefined?undefined:Array.isArray(stop)?stop:[stop],json:api==='openai'?['json_object','json_schema'].includes(b.response_format?.type):!!(b.output_config?.format||b.response_format),stream:!!b.stream,temperature:b.temperature,top_p:b.top_p,tool_choice:b.tool_choice};
}
export function openAIFromCanonical(c:any,model:string){
 const content=c.user.map((x:any)=>x.type==='text'?{type:'text',text:x.text}:{type:'image_url',image_url:{url:x.data?`data:${x.media_type};base64,${x.data}`:x.url}});
 const r:any={model,messages:[],stream:c.stream};if(c.system)r.messages.push({role:'system',content:c.system});r.messages.push({role:'user',content:content.length===1&&content[0].type==='text'?content[0].text:content});
 if(c.tools.length)r.tools=c.tools.map((t:any)=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}}));if(c.tool_choice!==undefined)r.tool_choice=c.tool_choice;
 if(c.max_tokens!==undefined)r.max_tokens=c.max_tokens;if(c.stop!==undefined)r.stop=c.stop;if(c.json)r.response_format={type:'json_object'};if(c.temperature!==undefined)r.temperature=c.temperature;if(c.top_p!==undefined)r.top_p=c.top_p;if(c.stream)r.stream_options={include_usage:true};return r;
}
export function anthropicFromCanonical(c:any,model:string){
 const content=c.user.map((x:any)=>x.type==='text'?{type:'text',text:x.text}:x.data?{type:'image',source:{type:'base64',media_type:x.media_type,data:x.data}}:{type:'image',source:{type:'url',url:x.url}});
 const r:any={model,max_tokens:c.max_tokens??1024,messages:[{role:'user',content:content.length===1&&content[0].type==='text'?content[0].text:content}],stream:c.stream};if(c.system)r.system=c.system;if(c.tools.length)r.tools=c.tools.map((t:any)=>({name:t.name,description:t.description,input_schema:t.parameters}));if(c.stop!==undefined)r.stop_sequences=c.stop;if(c.temperature!==undefined)r.temperature=c.temperature;if(c.top_p!==undefined)r.top_p=c.top_p;return r;
}
export function geminiFromCanonical(c:any){
 const parts=c.user.map((x:any)=>x.type==='text'?{text:x.text}:x.data?{inlineData:{mimeType:x.media_type,data:x.data}}:{fileData:{fileUri:x.url}});const g:any={contents:[{role:'user',parts}]};if(c.system)g.systemInstruction={parts:[{text:c.system}]};if(c.tools.length)g.tools=[{functionDeclarations:c.tools.map((t:any)=>({name:t.name,description:t.description,parameters:t.parameters}))}];const config:any={};if(c.max_tokens!==undefined)config.maxOutputTokens=c.max_tokens;if(c.stop!==undefined)config.stopSequences=c.stop;if(c.json)config.responseMimeType='application/json';if(c.temperature!==undefined)config.temperature=c.temperature;if(c.top_p!==undefined)config.topP=c.top_p;if(Object.keys(config).length)g.generationConfig=config;return g;
}
export function geminiFromClient(b:any, model:string) {
  const systems:string[]=[], parts:any[]=[];
  for(const m of b.messages??[]) { if(m.role==='system'||m.role==='developer'){ if(typeof m.content==='string')systems.push(m.content); else systems.push((m.content??[]).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n')); }
    if(m.role==='user'){ if(typeof m.content==='string')parts.push({text:m.content}); else for(const x of m.content??[]) {if(x.type==='text')parts.push({text:x.text}); else if(x.type==='image_url'){const u=x.image_url.url,d=/^data:([^;]+);base64,(.*)$/s.exec(u);parts.push(d?{inlineData:{mimeType:d[1],data:d[2]}}:{fileData:{fileUri:u}});}}}}
  const g:any={contents:[{role:'user',parts:parts.filter(Boolean)}]}; if(systems.filter(Boolean).length)g.systemInstruction={parts:[{text:systems.filter(Boolean).join('\n')}]};
  if(b.tools)g.tools=[{functionDeclarations:b.tools.map((t:any)=>({name:t.function?.name??t.name,description:t.function?.description??t.description,parameters:t.function?.parameters??t.input_schema}))}];
  const c:any={}; if(b.max_tokens!==undefined)c.maxOutputTokens=b.max_tokens; if(b.stop!==undefined)c.stopSequences=Array.isArray(b.stop)?b.stop:[b.stop]; if(b.temperature!==undefined)c.temperature=b.temperature; if(b.top_p!==undefined)c.topP=b.top_p; if(b.response_format)c.responseMimeType='application/json'; if(Object.keys(c).length)g.generationConfig=c; return g;
}
export function writeOpenAI(res:any, model:string, text:string, usage:any, stream:boolean) {
 const u={prompt_tokens:usage.input,completion_tokens:usage.output,total_tokens:usage.input+usage.output};
 if(!stream)return res.end(JSON.stringify({id:'chatcmpl-sim',object:'chat.completion',created:1700000000,model,choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop',logprobs:null}],usage:u}));
 res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8'}); const chunk=(delta:any,finish:any)=>({id:'chatcmpl-sim',object:'chat.completion.chunk',created:1700000000,model,choices:[{index:0,delta,finish_reason:finish}]});
 const send=(x:any)=>res.write(`data: ${JSON.stringify(x)}\n\n`); send(chunk({role:'assistant',content:''},null)); for(let i=0;i<text.length;i+=64)send(chunk({content:text.slice(i,i+64)},null)); send(chunk({},'stop')); send({id:'chatcmpl-sim',object:'chat.completion.chunk',created:1700000000,model,choices:[],usage:u});res.end('data: [DONE]\n\n');
}
export function writeAnthropic(res:any,model:string,text:string,usage:any,stream:boolean){
 if(!stream)return res.end(JSON.stringify({id:'msg_sim',type:'message',role:'assistant',model,content:[{type:'text',text}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:usage.input,output_tokens:usage.output}}));
 res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8'});const send=(e:string,d:any)=>res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);
 send('message_start',{type:'message_start',message:{id:'msg_sim',type:'message',role:'assistant',model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:usage.input,output_tokens:0}}});send('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}});for(let i=0;i<text.length;i+=64)send('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:text.slice(i,i+64)}});send('content_block_stop',{type:'content_block_stop',index:0});send('message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:usage.output}});send('message_stop',{type:'message_stop'});res.end();
}
