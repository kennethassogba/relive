import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.RELIVE_URL||'http://127.0.0.1:7331';
await fs.mkdir('output/playwright',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const api=async(path,data)=>{const r=await fetch(base+'/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();assert(r.ok,JSON.stringify(j));return j;};
const wait=async(id)=>page.waitForFunction(id=>document.documentElement.dataset.renderedRun===id,id,{timeout:30000});
const latest=async project=>(await api('state')).runs.filter(r=>r.project===project).at(-1);
const until=async fn=>{for(let i=0;i<600;i++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out');};
const report={date:new Date().toISOString(),checks:[],accessibility:[],screenshots:[]};
const original={};for(const project of ['netlist','mesh-cpp','mesh-rust'])original[project]=await api('source/'+project);
try{
  await page.goto(base);await page.waitForSelector('h1');
  const initial=await api('run',{project:'netlist'});await wait(initial.id);
  const before=await api('result/'+initial.id);
  await page.getByRole('button',{name:'Try fanout weighting'}).click();
  const variant=await until(async()=>{const r=await latest('netlist');return r.id!==initial.id&&r.status==='ready'?r:null;});await wait(variant.id);
  const after=await api('result/'+variant.id);assert.notDeepEqual(before.partitions,after.partitions);assert.equal(variant.prepared_id,(await api('state')).runs.find(r=>r.id===initial.id).prepared_id);
  assert((await api('source/netlist')).source.includes('FANOUT_EXPONENT = 1.0'));
  report.checks.push('UI variant changes the actual C++ source and native result, with the same prepared snapshot');
  await page.getByRole('button',{name:'Cut connections'}).click();
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'output/playwright/netlist-comparison.png',fullPage:true});report.screenshots.push('netlist-comparison.png');
  await page.getByRole('button',{name:'Branch from here'}).click();await page.getByRole('textbox',{name:'Branch name'}).fill('smoke-branch');await page.getByRole('button',{name:'Create branch'}).click();
  assert.equal((await api('state')).branches.netlist.name,'smoke-branch');report.checks.push('Branch dialog applies a named prepared-state branch');
  await page.getByRole('button',{name:'Code',exact:true}).click();
  const source=page.getByRole('textbox',{name:'Native algorithm source'});await source.fill('this is an intentional compile error;');await page.getByRole('button',{name:'Save & run'}).click();
  await until(async()=>{const r=await latest('netlist');return r.status==='error'?r:null;});
  await page.getByRole('alert').waitFor();assert.equal(await page.locator('html').getAttribute('data-rendered-run'),variant.id);
  await source.fill(original.netlist.source);await page.getByRole('button',{name:'Save & run'}).click();
  const recovered=await until(async()=>{const r=await latest('netlist');return r.status==='ready'&&r.id!==variant.id?r:null;});await wait(recovered.id);
  report.checks.push('Compilation error retains the last visible result; repairing the source recovers');
  await page.getByRole('button',{name:'Close source editor'}).click();
  for(const width of [320,768,1024,1440]){
    await page.setViewportSize({width,height:1000});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}px`);
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/netlist-${width}.png`,fullPage:true});
    if(width===320||width===1440){const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();report.accessibility.push({view:'netlist',width,violations:results.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});}
  }
  report.checks.push('No horizontal overflow at 320, 768, 1024 and 1440 pixels');
  await page.getByRole('button',{name:'Jerry the ogre Mesh simplification'}).click();
  const mesh=await api('run',{project:'mesh-cpp'});await wait(mesh.id);
  await page.getByRole('button',{name:'Try feature protection'}).click();
  const feature=await until(async()=>{const r=await latest('mesh-cpp');return r.id!==mesh.id&&r.status==='ready'?r:null;});await wait(feature.id);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'output/playwright/mesh-comparison.png',fullPage:true});report.screenshots.push('mesh-comparison.png');
  const viewport=page.getByRole('img',{name:'3D comparison. Arrow keys rotate, plus and minus zoom, zero resets.'});
  await viewport.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('+');
  await page.getByRole('button',{name:'Wireframe'}).click();assert.equal(await page.getByRole('button',{name:'Wireframe'}).getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'output/playwright/mesh-wireframe.png',fullPage:true});report.screenshots.push('mesh-wireframe.png');
  await page.getByRole('button',{name:'Wireframe'}).click();await page.getByRole('button',{name:'Error map'}).click();
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'output/playwright/mesh-error.png',fullPage:true});report.screenshots.push('mesh-error.png');
  report.checks.push('Native mesh variants, synchronized keyboard camera, wireframe and geometric error map');
  const ax=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();report.accessibility.push({view:'mesh',width:1440,violations:ax.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});
  await page.getByRole('combobox',{name:'Native language'}).selectOption('mesh-rust');const rust=await api('run',{project:'mesh-rust'});await wait(rust.id);report.checks.push('Rust native library renders in the same mesh workbench');
  const exportResponse=await fetch(base+'/api/export/'+rust.id);assert(exportResponse.ok);assert((await exportResponse.arrayBuffer()).byteLength>10000);report.checks.push('Experiment export includes data and native sources');
  const csrf=await fetch(base+'/api/run',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.invalid'},body:JSON.stringify({project:'netlist'})});assert.equal(csrf.status,403);report.checks.push('Cross-origin native execution is rejected');
  assert.equal(errors.length,0,errors.join('\n'));report.checks.push('No browser JavaScript errors');
  const serious=report.accessibility.flatMap(a=>a.violations.filter(v=>['serious','critical'].includes(v.impact)));
  assert.equal(serious.length,0,JSON.stringify(serious));
}finally{
  for(const [project,file] of Object.entries(original)){const current=await api('source/'+project);if(current.source!==file.source)await api('save',{project,source:file.source,base_sha256:current.sha256});}
  report.browser_errors=errors;await fs.writeFile('output/playwright/smoke-report.json',JSON.stringify(report,null,2)+'\n');await browser.close();
}
console.log(JSON.stringify(report,null,2));
