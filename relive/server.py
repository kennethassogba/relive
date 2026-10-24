from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, unquote
import io
import json
import mimetypes
import queue
import threading
import time
import zipfile
from .paths import ROOT, digest

def serve(runtime, port=7331):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def respond(self,value,status=200,kind='application/json'):
            data=json.dumps(value,allow_nan=False).encode() if kind=='application/json' else value
            self.send_response(status); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(data))); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.end_headers()
            try: self.wfile.write(data)
            except (BrokenPipeError,ConnectionResetError): pass
        def do_GET(self):
            try:
                path=unquote(urlparse(self.path).path)
                if path=='/api/state': return self.respond(runtime.view())
                if path=='/api/events':
                    self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.send_header('Cache-Control','no-cache'); self.end_headers()
                    listener=queue.Queue(maxsize=20)
                    with runtime.lock: runtime.listeners.append(listener)
                    try:
                        self.wfile.write(b'data: state\n\n'); self.wfile.flush()
                        while not runtime.closed:
                            try: event=listener.get(timeout=15)
                            except queue.Empty: event='ping'
                            self.wfile.write(f'data: {event}\n\n'.encode()); self.wfile.flush()
                    except (BrokenPipeError,ConnectionResetError): pass
                    finally:
                        with runtime.lock: runtime.listeners.remove(listener)
                    return
                if path.startswith('/api/source/'):
                    project=path.split('/')[-1]; config=runtime.projects[project]
                    return self.respond({'source':(ROOT/config['source']).read_text(),'path':config['source'],'sha256':digest(ROOT/config['source'])})
                if path.startswith('/api/result/'):
                    run=runtime.get_run(path.split('/')[-1]); file=runtime.state/'runs'/run['id']/'result.json'
                    if digest(file)!=run['result_sha256']: raise ValueError('Result checksum mismatch')
                    return self.respond(file.read_bytes(),kind='application/json; charset=utf-8')
                if path.startswith('/api/prepared/'):
                    key=path.split('/')[-1]
                    if len(key)!=24 or not all(c in '0123456789abcdef' for c in key): raise ValueError('Invalid snapshot')
                    return self.respond((runtime.state/'views'/f'{key}.json').read_bytes(),kind='application/json; charset=utf-8')
                if path.startswith('/api/export/'):
                    run=runtime.get_run(path.split('/')[-1]); buffer=io.BytesIO()
                    with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as z:
                        for directory,prefix in ((runtime.state/'runs'/run['id'],'experiment'),(runtime.state/'prepared'/run['prepared_id'],'prepared')):
                            for file in sorted(directory.iterdir()):
                                if file.is_file(): z.write(file,prefix+'/'+file.name)
                        for file in (ROOT/'relive').glob('*.py'): z.write(file,'runtime/relive/'+file.name)
                        for name in ('projects.json','requirements.txt','assets/manifest.json','THIRD_PARTY.md','LICENSE'): z.write(ROOT/name,'runtime/'+name)
                        z.writestr('README.txt','Relive experiment. From the same Relive version: python -m relive import experiment.zip\nIncludes native code, parameters, input data, prepared arrays, results, runtime sources and same-platform binaries. See docs/architecture.md for portability. The runtime directory preserves the host implementation for audit; use a matching checkout to replay.\n')
                    return self.respond(buffer.getvalue(),kind='application/zip')
                base=(ROOT/'web/dist').resolve(); file=(base/path.lstrip('/')).resolve()
                if not file.is_relative_to(base): return self.respond({'error':'Not found'},404)
                if not file.is_file(): file=base/'index.html'
                if not file.exists(): return self.respond({'error':'Build the UI with npm run build'},503)
                return self.respond(file.read_bytes(),kind=mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
            except (KeyError,ValueError,FileNotFoundError) as exc: self.respond({'error':str(exc)},404)
        def do_POST(self):
            # Local source editing must not be callable from an unrelated webpage.
            host=self.headers.get('Host','')
            origin=self.headers.get('Origin')
            if host not in (f'127.0.0.1:{port}',f'localhost:{port}') or (origin and origin not in (f'http://{host}','http://127.0.0.1:5173','http://localhost:5173')):
                return self.respond({'error':'Local origin required'},403)
            if self.headers.get('Content-Type','').split(';')[0]!='application/json': return self.respond({'error':'JSON required'},415)
            try:
                length=int(self.headers.get('Content-Length','0'))
                if length>512000: raise ValueError('Request too large')
                data=json.loads(self.rfile.read(length) or '{}'); path=urlparse(self.path).path
                if path=='/api/run':
                    run_id,_=runtime.submit(data['project'],data.get('params'),fresh=bool(data.get('fresh')),reason='classic' if data.get('fresh') else 'run')
                    return self.respond({'id':run_id},202)
                if path=='/api/mode':
                    if data['project'] not in runtime.projects or data['mode'] not in ('relive','classic'): raise ValueError('Invalid watcher mode')
                    runtime.watch_modes[data['project']]=data['mode']
                    return self.respond({'mode':data['mode']})
                if path=='/api/save':
                    project=data['project']; config=runtime.projects[project]; file=ROOT/config['source']
                    if data.get('base_sha256')!=digest(file): return self.respond({'error':'File changed in your editor. Reload before saving.'},409)
                    if not isinstance(data['source'],str): raise ValueError('Source must be text')
                    tmp=file.with_suffix(file.suffix+'.tmp'); tmp.write_text(data['source']); tmp.replace(file)
                    # Watcher owns compilation so API and editor saves use the same path.
                    return self.respond({'saved':True,'sha256':digest(file)})
                if path=='/api/branch':
                    run=runtime.branch_from(data['id'],data['name'])
                    return self.respond({'branch':runtime.branch[run['project']]})
                if path=='/api/replay':
                    run=runtime.get_run(data['id']); src=runtime.state/'runs'/run['id']/run['source_file']
                    if digest(src)!=run['source_sha256']: raise ValueError('Source checksum mismatch')
                    run_id,_=runtime.submit(run['project'],run['params'],src.read_text(),reason='replay',replay=run['id'])
                    return self.respond({'id':run_id},202)
                if path=='/api/restore':
                    run=runtime.get_run(data['id']); project=run['project']; file=ROOT/runtime.projects[project]['source']
                    if data.get('base_sha256')!=digest(file): return self.respond({'error':'Working file changed; reload it first'},409)
                    # Archive the current working source, including an uncompiled edit.
                    backup=runtime.state/'working-backups'; backup.mkdir(exist_ok=True)
                    (backup/(str(time.time_ns())+file.suffix)).write_bytes(file.read_bytes())
                    saved=runtime.state/'runs'/run['id']/run['source_file']
                    if digest(saved)!=run['source_sha256']: raise ValueError('Source checksum mismatch')
                    runtime.branch_from(run['id'],data.get('name','restore-'+run['id'][-8:]))
                    tmp=file.with_suffix(file.suffix+'.tmp'); tmp.write_bytes(saved.read_bytes()); tmp.replace(file)
                    return self.respond({'restored':True})
                if path=='/api/paint': return self.respond({'paint_ms':runtime.paint(data['id'])})
                return self.respond({'error':'Not found'},404)
            except (KeyError,ValueError,TypeError,OSError) as exc: self.respond({'error':str(exc)},400)
    httpd=ThreadingHTTPServer(('127.0.0.1',port),Handler); httpd.daemon_threads=True
    print(f'Relive is running at http://127.0.0.1:{port}',flush=True)
    try: httpd.serve_forever()
    finally: httpd.server_close(); runtime.close()
