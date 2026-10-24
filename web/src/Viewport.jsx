import React, {useEffect, useRef} from 'react';
import * as THREE from 'three';

const palette=['#3478e5','#e88b43','#9b70d4','#df6d95','#5eafd5','#ac743e','#355290','#dd4b4b'];
const colors=palette.map(c=>new THREE.Color(c));

function geometry(positions, faces, errors) {
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setIndex(faces); g.computeVertexNormals();
  if(errors) {
    const rgb=[];
    // Fixed scale across experiments: 0..1% of input bounding-box diagonal.
    for(const d of errors){const t=Math.min(1,d/.01); const c=new THREE.Color('#3279d8').lerp(new THREE.Color('#f07636'),t); rgb.push(c.r,c.g,c.b);}
    g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
  }
  return g;
}

export function MeshViewport({prepared, left, right, wireframe, errorMap, camera, onRendered, runId}) {
  const container=useRef(); const engine=useRef(); const callback=useRef(onRendered); callback.current=onRendered;
  useEffect(()=>{
    const el=container.current; let renderer;
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'}); }
    catch {el.innerHTML='<p class="viewport-error">WebGL is unavailable. Metrics and experiment exports remain available.</p>';return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setClearColor(0xffffff);
    renderer.outputColorSpace=THREE.SRGBColorSpace; el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','Synchronized 3D comparison. Drag to orbit; scroll to zoom.');
    const view=new THREE.PerspectiveCamera(34,1,.01,100);
    const scenes=[new THREE.Scene(),new THREE.Scene()];
    scenes.forEach(scene=>{scene.add(new THREE.HemisphereLight(0xffffff,0x97a0b4,2.4)); const sun=new THREE.DirectionalLight(0xffffff,3.4);sun.position.set(2,3,4);scene.add(sun); const fill=new THREE.DirectionalLight(0xd9e9ff,1.2);fill.position.set(-3,0,-2);scene.add(fill);});
    const state={renderer,view,scenes,groups:[],el};
    const render=()=>{
      const width=el.clientWidth,height=el.clientHeight; if(!width||!height)return;
      renderer.setSize(width,height,false); renderer.setScissorTest(true);
      const {yaw,pitch,distance}=camera.current;
      view.position.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance);view.lookAt(0,0,0);
      const half=Math.floor(width/2);view.aspect=half/height;view.updateProjectionMatrix();
      scenes.forEach((scene,i)=>{renderer.setViewport(i*half,0,i?width-half:half,height);renderer.setScissor(i*half,0,i?width-half:half,height);renderer.render(scene,view);});
    };
    state.render=render;engine.current=state;
    const resize=new ResizeObserver(render);resize.observe(el);
    let last;
    const down=e=>{last=[e.clientX,e.clientY];el.setPointerCapture(e.pointerId);};
    const move=e=>{if(!last)return;camera.current.yaw-=(e.clientX-last[0])*.008;camera.current.pitch=Math.max(-1.3,Math.min(1.3,camera.current.pitch+(e.clientY-last[1])*.008));last=[e.clientX,e.clientY];render();};
    const up=()=>{last=null;};
    const wheel=e=>{e.preventDefault();camera.current.distance=Math.max(.7,Math.min(4,camera.current.distance*Math.exp(e.deltaY*.001)));render();};
    const key=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')Object.assign(camera.current,{yaw:.25,pitch:.08,distance:1.8});else if(e.key==='+'||e.key==='-')camera.current.distance=Math.max(.7,Math.min(4,camera.current.distance*(e.key==='+'?.9:1.1)));else if(e.key==='ArrowLeft'||e.key==='ArrowRight')camera.current.yaw+=e.key==='ArrowLeft'?.1:-.1;else camera.current.pitch=Math.max(-1.3,Math.min(1.3,camera.current.pitch+(e.key==='ArrowUp'?.1:-.1)));render();}};
    el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('wheel',wheel,{passive:false});el.addEventListener('keydown',key);
    return()=>{resize.disconnect();['pointerdown','pointermove','pointerup','pointercancel','wheel','keydown'].forEach((n,i)=>el.removeEventListener(n,[down,move,up,up,wheel,key][i]));state.groups.forEach(g=>{g.geometry.dispose();g.material.dispose();});renderer.dispose();renderer.domElement.remove();engine.current=null;};
  },[camera]);
  useEffect(()=>{
    const e=engine.current;if(!e||!prepared)return;
    e.groups.forEach((g,i)=>{e.scenes[i].remove(g);g.geometry.dispose();g.material.dispose();});
    e.groups=[left,right].map((result,i)=>{
      const data=errorMap?prepared:(result||prepared);
      const errors=errorMap?(result?.errors||Array(prepared.positions.length/3).fill(0)):null;
      const g=geometry(data.positions,data.faces,errors);
      const material=new THREE.MeshStandardMaterial({color:errors?0xffffff:(i===0?0xb8c6da:0x6e9bd5),roughness:.88,metalness:0,vertexColors:!!errors,wireframe,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(g,material); e.scenes[i].add(mesh);return mesh;
    });e.render();
    // Complete GPU work before scheduling the paint acknowledgement. This is a
    // conservative browser draw measurement, not a display scanout timestamp.
    e.renderer.getContext().finish();
    let second;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>callback.current?.(runId));});
    return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
  },[prepared,left,right,wireframe,errorMap,runId]);
  return <div className="mesh-canvas" ref={container} tabIndex={0} role="img" aria-label="3D comparison. Arrow keys rotate, plus and minus zoom, zero resets."/>;
}

export function NetlistViewport({prepared,left,right,showCuts,onRendered,runId,onInspect}) {
  const ref=useRef();const callback=useRef(onRendered);callback.current=onRendered;
  useEffect(()=>{
    const canvas=ref.current;const el=canvas.parentElement;if(!prepared)return;
    const draw=()=>{
      const w=el.clientWidth,h=el.clientHeight,dpr=Math.min(devicePixelRatio,2);canvas.width=w*dpr;canvas.height=h*dpr;
      const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
      const scale=Math.min(w/2-56,h-72);const project=(p,i)=>[w/4+i*w/2+p[0]*scale,h/2+p[1]*scale];
      [left,right].forEach((r,i)=>{
        const parts=r?.partitions||prepared.positions.map(()=>0);
        if(showCuts){
          ctx.beginPath();ctx.strokeStyle='rgba(222,112,49,.11)';ctx.lineWidth=.5;
          for(const [a,b] of prepared.links){if(parts[a]===parts[b])continue;const x=project(prepared.positions[a],i),y=project(prepared.positions[b],i);ctx.moveTo(...x);ctx.lineTo(...y);}ctx.stroke();
        }
        const dot=Math.max(1.2,Math.min(3.4,scale/Math.sqrt(parts.length)*.34));
        prepared.positions.forEach((p,j)=>{const xy=project(p,i);ctx.fillStyle=r?palette[parts[j]%palette.length]:'#aebed1';ctx.fillRect(xy[0]-dot/2,xy[1]-dot/2,dot,dot);});
      });
    };
    const observer=new ResizeObserver(draw);observer.observe(el);draw();
    let second;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>callback.current?.(runId));});
    return()=>{observer.disconnect();cancelAnimationFrame(first);cancelAnimationFrame(second);};
  },[prepared,left,right,showCuts,runId]);
  const inspect=e=>{
    if(!prepared)return;const rect=ref.current.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,side=x>rect.width/2?1:0;
    const scale=Math.min(rect.width/2-56,rect.height-72);let nearest=0,best=Infinity;
    prepared.positions.forEach((p,i)=>{const d=Math.hypot(x-(rect.width/4+side*rect.width/2+p[0]*scale),y-(rect.height/2+p[1]*scale));if(d<best){best=d;nearest=i;}});
    const result=side?right:left;onInspect(`${prepared.meta.cells[nearest]} · ${result?'partition '+result.partitions[nearest]:'input cell'}`);
  };
  return <canvas ref={ref} className="netlist-canvas" onClick={inspect} aria-label="Netlist comparison. Colors encode partitions, orange lines show cut connections." role="img"/>;
}
