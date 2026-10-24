import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const base='http://127.0.0.1:7331';
const state=await (await fetch(base+'/api/state')).json();
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
await fs.mkdir('docs/images',{recursive:true});
try{
  for(const project of ['netlist','mesh-cpp']){
    const runs=state.runs.filter(r=>r.project===project).slice(-24).reverse().filter(r=>r.status==='ready');
    const current=runs[0];
    const alternate=runs.find(r=>r.prepared_id===current.prepared_id&&(project==='netlist'?r.metrics.cut_nets!==current.metrics.cut_nets:r.metrics.rms_error!==current.metrics.rms_error));
    await page.goto(base+'/?project='+project);await page.waitForSelector(project==='netlist'?'.netlist-canvas':'.mesh-canvas canvas');
    if(alternate){
      await page.getByRole('button',{name:`Use experiment ${current.id.slice(-8)} as reference A`}).click();
      await page.locator('.run-select').filter({hasText:alternate.source_sha256.slice(0,7)}).first().click();
      await page.waitForFunction(id=>document.documentElement.dataset.drawnRun===id,alternate.id);
    }
    await page.waitForTimeout(400);
    const shot=async name=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'docs/images/'+name,fullPage:true});};
    if(project==='netlist'){
      await page.getByRole('button',{name:'Cut connections'}).click();await shot('netlist-comparison.png');
    }else{
      await shot('mesh-comparison.png');
      await page.getByRole('button',{name:'Code',exact:true}).click();await shot('mesh-code.png');
      await page.getByRole('button',{name:'Collapse bottom panel'}).click();
      await page.getByRole('button',{name:'Wireframe'}).click();await shot('mesh-wireframe.png');
      await page.getByRole('button',{name:'Wireframe'}).click();await page.getByRole('button',{name:'Error map'}).click();await shot('mesh-error.png');
    }
    if(project==='mesh-cpp'){await page.setViewportSize({width:390,height:844});await shot('mobile.png');}
  }
}finally{await browser.close();}
