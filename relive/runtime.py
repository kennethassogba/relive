"""Reusable compile / prepared-host / experiment runtime, independent of the UI."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import os
import platform
import queue
import shutil
import subprocess
import sys
import threading
import time
import uuid
import fcntl
from .paths import ROOT, digest

def atomic_json(path, value):
    path=Path(path); tmp=path.with_suffix('.tmp'); tmp.write_text(json.dumps(value,indent=2,allow_nan=False)); tmp.replace(path)

def toolchain(language):
    if language=="cpp": return shutil.which(os.environ.get("CXX","g++")) or "g++"
    local=ROOT/".tools/rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin/rustc"
    return shutil.which("rustc") or str(local)

def validate_params(dataset, values):
    if dataset=="netlist":
        if set(values)!={"parts","passes","seed","imbalance"}: raise ValueError("Unexpected partition parameters")
        for key,lo,hi in (("parts",2,16),("passes",1,100),("seed",0,2147483647)):
            if type(values[key]) is not int or not lo<=values[key]<=hi: raise ValueError(f"Invalid {key}")
        if not isinstance(values['imbalance'],(int,float)) or not 0<=values['imbalance']<=.5: raise ValueError("Invalid imbalance")
    elif dataset=="mesh":
        if set(values)!={"ratio","feature_weight"}: raise ValueError("Unexpected mesh parameters")
        for key,lo,hi in (("ratio",.01,.95),("feature_weight",0,1000)):
            if not isinstance(values[key],(int,float)) or not lo<=values[key]<=hi: raise ValueError(f"Invalid {key}")
    return dict(values)

class Host:
    def __init__(self, dataset, state, engine, fresh=False, snapshot=None, adapter=None):
        command=[sys.executable,"-m","relive.worker",dataset,str(state)]
        if engine: command += ["--engine",str(engine)]
        if fresh: command += ["--fresh"]
        if snapshot: command += ["--snapshot",snapshot]
        if adapter: command += ["--adapter",adapter]
        env={**os.environ,"OPENBLAS_NUM_THREADS":"1","OMP_NUM_THREADS":"1"}
        self.process=subprocess.Popen(command,cwd=ROOT,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
        line=self.process.stdout.readline()
        if not line: raise RuntimeError(self.process.stderr.read()[-6000:])
        self.ready=json.loads(line)
    def run(self, library, params, output):
        self.process.stdin.write(json.dumps({"library":str(library),"params":params,"output":str(output)})+'\n'); self.process.stdin.flush()
        line=self.process.stdout.readline()
        if not line: raise RuntimeError("Prepared host stopped unexpectedly")
        return json.loads(line)
    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try: self.process.wait(timeout=3)
            except subprocess.TimeoutExpired: self.process.kill(); self.process.wait()

class Runtime:
    def __init__(self, state=None, watch=True):
        self.state=Path(state or os.environ.get('RELIVE_STATE') or ROOT/".relive").resolve(); self.state.mkdir(parents=True,exist_ok=True)
        (self.state/"runs").mkdir(exist_ok=True); (self.state/"build").mkdir(exist_ok=True)
        self.projects=json.loads((ROOT/"projects.json").read_text())
        self.lock=threading.RLock(); self.listeners=[]; self.executor=ThreadPoolExecutor(max_workers=1)
        self.hosts={}; self.runs=[]; self.status={}; self.closed=False
        self.watch_modes={p:'relive' for p in self.projects}
        self.pending={}
        self.branch={p:{"name":"main","parent":None,"params":v["params"],"snapshot":None} for p,v in self.projects.items()}
        for path in sorted((self.state/"runs").glob('*/manifest.json')):
            try:
                archived=json.loads(path.read_text())
                archived.get('prepared',{}).pop('cells',None)
                self.runs.append(archived)
            except (ValueError,OSError): pass
        self.runs.sort(key=lambda r:r["started_ns"])
        self.seen={p:self.signature(v) for p,v in self.projects.items()}
        self.engine=None
        if watch:
            self.watcher=threading.Thread(target=self._watch,daemon=True); self.watcher.start()

    def emit(self, event="state"):
        with self.lock:
            for listener in self.listeners:
                try: listener.put_nowait(event)
                except queue.Full: pass

    def view(self):
        with self.lock:
            return {"projects":self.projects,"runs":self.runs[-200:],"status":self.status,"branches":self.branch,
                    "prepared":{key:host.ready for key,host in self.hosts.items()},"watch_modes":self.watch_modes,"root":str(ROOT)}

    def build_engine(self):
        src=ROOT/'native/mesh_engine.cpp'
        key=hashlib.sha256((digest(src)+digest(ROOT/'native/abi.h')+toolchain('cpp')+'libigl-v2.5.0-O2-serial').encode()).hexdigest()[:24]
        out=self.state/'build'/f'engine-{key}.so'
        with (self.state/'build/engine.lock').open('w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            if not out.exists():
                command=[toolchain('cpp'),'-std=c++17','-O2','-DNDEBUG','-DIGL_PARALLEL_FOR_FORCE_SERIAL','-fPIC','-shared',str(src),'-I'+str(ROOT/'third_party/libigl/include'),'-I/usr/include/eigen3','-o',str(out)+'.tmp']
                p=subprocess.run([sys.executable,'-m','relive.compiler',*command],cwd=ROOT,capture_output=True,text=True,timeout=300)
                if p.returncode: raise RuntimeError(p.stderr[-12000:])
                Path(str(out)+'.tmp').replace(out)
        self.engine=out
        return out

    def dependencies(self, config):
        return [ROOT/config['source'],ROOT/'native/abi.h']+([ROOT/'native/mesh_engine.cpp'] if config.get('engine') else [])

    def signature(self, config):
        return hashlib.sha256(''.join(digest(p) for p in self.dependencies(config)).encode()).hexdigest()

    def _watch(self):
        pending={}
        while not self.closed:
            for project, config in self.projects.items():
                path=ROOT/config['source']
                try:
                    content=path.read_bytes(); key=self.signature(config)
                    if key!=self.seen[project]:
                        if project not in pending or pending[project][0]!=key: pending[project]=(key,time.monotonic())
                        elif time.monotonic()-pending[project][1] >= .1:
                            self.seen[project]=key; pending.pop(project,None)
                            self.submit(project,saved_ns=max(p.stat().st_mtime_ns for p in self.dependencies(config)),source=content.decode(),reason="save",fresh=self.watch_modes[project]=='classic')
                    else: pending.pop(project,None)
                except (OSError,UnicodeError): pass # Atomic editor saves can briefly remove a path.
            time.sleep(.05)

    def submit(self, project, params=None, source=None, saved_ns=None, reason="run", fresh=False, replay=None):
        if project not in self.projects: raise ValueError("Unknown project")
        config=self.projects[project]
        with self.lock:
            branch=dict(self.branch[project])
            params=validate_params(config['dataset'],params or branch['params'])
            self.branch[project]['params']=params
        text=source if source is not None else (ROOT/config['source']).read_text()
        run_id=time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8]
        request={"id":run_id,"project":project,"source":text,"params":params,"saved_ns":saved_ns or time.time_ns(),"reason":reason,"fresh":fresh,"branch":branch,"replay":replay}
        self.status[project]={"phase":"queued","run_id":run_id}; self.emit()
        if reason=='save' and project in self.pending: self.pending[project].cancel()
        future=self.executor.submit(self._run,request)
        self.pending[project]=future
        return run_id,future

    def _run(self, req):
        project=req['project']; config=self.projects[project]; run_id=req['id']; directory=self.state/'runs'/run_id; directory.mkdir()
        ext='.rs' if config['language']=='rust' else '.cpp'; src=directory/('source'+ext); src.write_text(req['source'])
        replay=req.get('replay')
        header=(self.state/'runs'/replay/'abi.h') if replay else ROOT/'native/abi.h'
        shutil.copyfile(header,directory/'abi.h')
        compiler=toolchain(config['language'])
        flags=['--crate-name','relive_plugin','--crate-type','cdylib','--edition=2021','-C','opt-level=2','-C','panic=abort'] if config['language']=='rust' else ['-std=c++17','-O2','-fPIC','-shared']
        manifest={"id":run_id,"project":project,"dataset":config['dataset'],"language":config['language'],"branch":req['branch']['name'],"parent":replay or req['branch']['parent'],"params":req['params'],"reason":req['reason'],"mode":"classic" if req['fresh'] else "relive","source_sha256":digest(src),"saved_ns":req['saved_ns'],"started_ns":time.time_ns(),"status":"building","paint_ms":None,"source_file":src.name}
        self.status[project]={"phase":"compiling","run_id":run_id}; self.emit()
        host=None; temporary_host=False
        try:
            version=subprocess.check_output([compiler,'--version'],text=True,timeout=10).splitlines()[0]
            manifest['toolchain']={"compiler":version,"flags":flags,"platform":platform.platform(),"python":sys.version.split()[0]}
            cache_key=hashlib.sha256((req['source']+digest(directory/'abi.h')+version+str(flags)).encode()).hexdigest()
            cache=self.state/'build'/(cache_key+'.so'); library=directory/'plugin.so'
            start=time.perf_counter(); cache_hit=cache.exists() and not req['fresh']
            if not cache_hit:
                command=[compiler,*flags,str(src),'-o',str(library)]
                p=subprocess.run([sys.executable,'-m','relive.compiler',*command],cwd=ROOT,capture_output=True,text=True,timeout=90)
                (directory/'build.log').write_text(p.stdout+p.stderr)
                if p.returncode: raise RuntimeError(p.stderr[-12000:])
                shutil.copyfile(library,cache)
            else: shutil.copyfile(cache,library)
            manifest['compile_ms']=(time.perf_counter()-start)*1000; manifest['cache_hit']=cache_hit
            engine=None
            if config.get('engine'):
                if replay and (self.state/'runs'/replay/'engine.so').exists(): engine=self.state/'runs'/replay/'engine.so'
                else: engine=self.build_engine()
                shutil.copyfile(engine,directory/'engine.so')
                shutil.copyfile(self.state/'runs'/replay/'mesh_engine.cpp' if replay else ROOT/'native/mesh_engine.cpp',directory/'mesh_engine.cpp')
                manifest['engine_sha256']=digest(engine)
            self.status[project]={"phase":"preparing","run_id":run_id}; self.emit()
            snapshot=req['branch'].get('snapshot')
            if replay: snapshot=self.get_run(replay)['prepared_id']
            if snapshot and not config.get('adapter'):
                saved_adapter=json.loads((self.state/'prepared'/snapshot/'manifest.json').read_text()).get('adapter_sha256')
                if saved_adapter!=digest(ROOT/'relive/adapters.py'):
                    raise ValueError('Prepared adapter version differs. Replay with the matching Relive version or prepare a new snapshot.')
            key=config['dataset']+':'+(snapshot or 'current')+':'+(digest(engine)[:12] if engine else 'none')
            prep_start=time.perf_counter()
            temporary_host=req['fresh']
            if temporary_host: host=Host(config['dataset'],self.state,engine,fresh=True,adapter=config.get('adapter'))
            else:
                if key not in self.hosts:
                    match=next((h for k,h in self.hosts.items() if snapshot and h.ready['prepared']['id']==snapshot and k.split(':')[-1]==key.split(':')[-1]),None)
                    if match: self.hosts[key]=match
                    else:
                        # At most one prepared process per dataset. Histories remain
                        # on disk; returning to an older snapshot rehydrates arrays.
                        for old in list(self.hosts):
                            if old.startswith(config['dataset']+':'): self.hosts.pop(old).close()
                        self.hosts[key]=Host(config['dataset'],self.state,engine,snapshot=snapshot,adapter=config.get('adapter'))
                host=self.hosts[key]
            manifest['prepare_ms']=(time.perf_counter()-prep_start)*1000; manifest['prepared']=host.ready['prepared']; manifest['prepared_id']=host.ready['prepared']['id']
            self.status[project]={"phase":"running","run_id":run_id}; self.emit()
            response=host.run(library,req['params'],directory/'result.json'); manifest.update(response)
            if not response['ok']: raise RuntimeError(response['error'])
            result=json.loads((directory/'result.json').read_text()); manifest['metrics']=result['metrics']; manifest['result_sha256']=digest(directory/'result.json')
            manifest['status']='ready'
        except Exception as exc:
            manifest['status']='error'; manifest['error']=str(exc)
        finally:
            if temporary_host and host: host.close()
        manifest['ready_ns']=time.time_ns(); manifest['ready_ms']=(manifest['ready_ns']-req['saved_ns'])/1e6
        atomic_json(directory/'manifest.json',manifest)
        with self.lock:
            self.runs.append(manifest)
            self.status[project]={"phase":manifest['status'],"run_id":run_id}
            # Saving repeatedly on a branch creates a history chain.
            if manifest['status']=='ready' and self.branch[project]['name']==req['branch']['name']:
                self.branch[project]['parent']=run_id
        self.emit()
        return manifest

    def get_run(self, run_id):
        with self.lock:
            for run in self.runs:
                if run['id']==run_id: return dict(run)
        raise ValueError("Unknown experiment")

    def branch_from(self, run_id, name):
        run=self.get_run(run_id)
        if run['status']!='ready': raise ValueError("Branch requires a successful experiment")
        if not name or len(name)>60: raise ValueError("Branch name must contain 1–60 characters")
        with self.lock:
            self.branch[run['project']]={"name":name,"parent":run_id,"params":run['params'],"snapshot":run['prepared_id']}
        self.emit()
        return run

    def paint(self, run_id):
        with self.lock:
            for run in self.runs:
                if run['id']==run_id and run['paint_ms'] is None and run['status']=='ready':
                    run['paint_ms']=(time.time_ns()-run['saved_ns'])/1e6
                    atomic_json(self.state/'runs'/run_id/'manifest.json',run); self.emit(); return run['paint_ms']

    def close(self):
        self.closed=True
        self.executor.shutdown(wait=True)
        for host in self.hosts.values(): host.close()
