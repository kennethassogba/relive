import argparse
import json
from pathlib import Path
import shutil
import zipfile
from .runtime import Runtime, atomic_json
from .paths import digest

def main():
    parser=argparse.ArgumentParser(prog='relive'); sub=parser.add_subparsers(dest='command',required=True)
    server=sub.add_parser('serve'); server.add_argument('--port',type=int,default=7331)
    run=sub.add_parser('run'); run.add_argument('project'); run.add_argument('--classic',action='store_true')
    replay=sub.add_parser('replay'); replay.add_argument('id')
    imp=sub.add_parser('import'); imp.add_argument('archive')
    sub.add_parser('build-engine')
    args=parser.parse_args(); runtime=Runtime(watch=args.command=='serve')
    if args.command=='serve':
        from .server import serve
        try: serve(runtime,args.port)
        except KeyboardInterrupt: pass
        return
    try:
        if args.command=='build-engine': print(runtime.build_engine()); return
        if args.command=='run': _,future=runtime.submit(args.project,fresh=args.classic)
        else:
            if args.command=='import':
                with zipfile.ZipFile(args.archive) as z:
                    manifest=json.loads(z.read('experiment/manifest.json')); prepared=json.loads(z.read('prepared/manifest.json'))
                    # IDs are checked before constructing destinations; no zip extraction.
                    for value in (manifest['id'],prepared['id']):
                        if not value or any(c not in '0123456789abcdef-' for c in value): raise ValueError('Invalid archive ID')
                    for prefix,destination in (('experiment/',runtime.state/'runs'/manifest['id']),('prepared/',runtime.state/'prepared'/prepared['id'])):
                        if destination.exists(): raise ValueError('Experiment or snapshot already exists; replay its ID instead')
                        destination.mkdir(parents=True)
                        for item in z.infolist():
                            if item.filename.startswith(prefix):
                                name=item.filename[len(prefix):]
                                if '/' in name or name in ('','.','..'): raise ValueError('Invalid archive entry')
                                if item.file_size>200_000_000: raise ValueError('Archive entry too large')
                                (destination/name).write_bytes(z.read(item))
                    if digest(runtime.state/'prepared'/prepared['id']/'state.npz')!=prepared['state_sha256']: raise ValueError('Prepared checksum mismatch')
                    runtime.runs.append(manifest); args.id=manifest['id']
            old=runtime.get_run(args.id); src=runtime.state/'runs'/old['id']/old['source_file']
            if digest(src)!=old['source_sha256']: raise ValueError('Source checksum mismatch')
            _,future=runtime.submit(old['project'],old['params'],src.read_text(),reason='replay',replay=old['id'])
        result=future.result(); print(json.dumps(result,indent=2)); raise SystemExit(0 if result['status']=='ready' else 1)
    finally: runtime.close()

if __name__=='__main__': main()
