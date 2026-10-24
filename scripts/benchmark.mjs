// End-to-end measurement: actual source write -> native rebuild -> browser draw.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
const url=process.env.RELIVE_URL||'http://127.0.0.1:7331';
const samples=Number(process.env.SAMPLES||5);
const out=process.env.RELIVE_BENCH_OUTPUT||'docs/benchmark.json';
const api=async(p,data)=>{const response=await fetch(url+'/api/'+p,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(JSON.stringify(result));return result;};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const report={date:new Date().toISOString(),machine:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0].model,logical_cpus:os.cpus().length,total_ram_mb:Math.round(os.totalmem()/1048576)},browser:await browser.version(),renderer:'Chromium headless / SwiftShader (software rendering)',samples_per_mode:samples,method:'Native source write to server receipt of browser acknowledgement after completed draw and two animation frames. Same watcher, flags, source semantics and warmed browser in both modes. Classic recompiles the plugin, starts a fresh host and prepares raw input. Relive retains prepared data. Both retain OS file caches and the prebuilt libigl engine. Unique source changes prevent plugin cache hits. Dataset acquisition/synthesis and initial engine compilation are excluded.',runs:[],summary:{}};
const projects=JSON.parse(await fs.readFile('projects.json','utf8'));
async function waitForRun(project,hash,after=0){
  const start=Date.now();
  while(Date.now()-start<120000){
    const state=await api('state');const run=state.runs.filter(r=>r.project===project&&r.source_sha256===hash&&r.started_ns>=after).at(-1);
    if(run?.status==='error')throw Error(run.error);
    if(run?.paint_ms!=null)return run;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw Error('Timed out waiting for rendered experiment '+project);
}
try{
  for(const project of Object.keys(projects)){
    const config=projects[project],filename=path.resolve(config.source),original=await fs.readFile(filename,'utf8');
    await page.goto(url+'/?project='+project);await page.waitForSelector('h1');
    // Warm host, renderer and compiler page cache. Not included in the samples.
    const {id}=await api('run',{project});
    await page.waitForFunction(id=>document.documentElement.dataset.renderedRun===id,id,{timeout:120000});
    try{
      // Alternate mode order by sample to reduce time/order bias.
      for(let i=0;i<samples;i++)for(const mode of i%2?['classic','relive']:['relive','classic']){
        await api('mode',{project,mode});
        const variant=i%2?1:0;
        let content=original.replace(/FANOUT_EXPONENT = [\d.]+/,`FANOUT_EXPONENT = ${variant}.0`).replace(/FEATURE_BIAS(: f64)? = [\d.]+/,(m,type)=>`FEATURE_BIAS${type||''} = ${variant?8:0}.0`);
        content+=`\n// Benchmark sample ${crypto.randomUUID()}\n`;
        const hash=crypto.createHash('sha256').update(content).digest('hex');const start=Date.now()*1e6;
        await fs.writeFile(filename+'.tmp',content);await fs.rename(filename+'.tmp',filename);
        const run=await waitForRun(project,hash,start);
        if(run.cache_hit)throw Error('Unexpected cached compilation in measured sample');
        report.runs.push({project,mode,sample:i,id:run.id,source_sha256:hash,compile_ms:run.compile_ms,prepare_ms:run.prepare_ms,worker_ms:run.worker_ms,ready_ms:run.ready_ms,paint_ms:run.paint_ms,algorithm_ms:run.metrics.algorithm_ms,worker_peak_rss_mb:run.worker_peak_rss_mb,host_peak_rss_mb:run.host_peak_rss_mb,prepared_id:run.prepared_id,toolchain:run.toolchain,metrics:run.metrics});
        console.log(`${project} ${mode} ${i+1}/${samples}: ${run.paint_ms.toFixed(1)} ms visible (${run.metrics.algorithm_ms.toFixed(1)} ms native)`);
      }
    }finally{await api('mode',{project,mode:'relive'});await fs.writeFile(filename,original);await new Promise(resolve=>setTimeout(resolve,1200));}
    const sorted=mode=>report.runs.filter(r=>r.project===project&&r.mode===mode).map(r=>r.paint_ms).sort((a,b)=>a-b);
    const stats=values=>({median_ms:values[Math.floor(values.length/2)],p95_ms:values[Math.ceil(values.length*.95)-1],min_ms:values[0],max_ms:values.at(-1)});
    const warm=stats(sorted('relive')),cold=stats(sorted('classic'));
    report.summary[project]={relive:warm,classic:cold,speedup:cold.median_ms/warm.median_ms,saved_ms:cold.median_ms-warm.median_ms};
    await page.screenshot({path:`output/playwright/${project}-benchmark.png`,fullPage:true});
  }
  report.browser_errors=errors;if(errors.length)throw Error(errors.join('\n'));
}finally{
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');await browser.close();
}
console.log(JSON.stringify(report.summary,null,2));
