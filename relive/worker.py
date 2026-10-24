"""Single-threaded prepared host. Fork before loading any user library.

The child inherits prepared buffers by copy-on-write. A segfault or abort only
kills that child. No dlclose, heap transfer, or pointer migration is required.
This is a local trusted-code development tool, not a security sandbox.
"""
import argparse
import json
import os
from pathlib import Path
import resource
import signal
import sys
import time
import importlib
from .adapters import Prepared

def main():
    p=argparse.ArgumentParser(); p.add_argument("dataset"); p.add_argument("state"); p.add_argument("--engine"); p.add_argument("--fresh",action="store_true"); p.add_argument("--snapshot"); p.add_argument("--adapter")
    args=p.parse_args()
    factory=Prepared
    if args.adapter:
        module,name=args.adapter.split(':'); factory=getattr(importlib.import_module(module),name)
    prepared=factory(args.dataset,args.state,args.engine,args.fresh,args.snapshot)
    view_path=Path(args.state)/"views"/f"{prepared.id}.json"; view_path.parent.mkdir(parents=True,exist_ok=True)
    view_path.write_text(json.dumps(prepared.view(),separators=(',',':')))
    print(json.dumps({"ready":True,"prepared":{k:v for k,v in prepared.meta.items() if k!='cells'},"pid":os.getpid()}),flush=True)
    for line in sys.stdin:
        request=json.loads(line)
        output=Path(request["output"])
        started=time.perf_counter()
        pid=os.fork()
        if pid==0:
            log=os.open(str(output.with_name('native.log')),os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
            os.dup2(log,1); os.dup2(log,2); os.close(log)
            resource.setrlimit(resource.RLIMIT_CORE,(0,0))
            memory=int(os.environ.get('RELIVE_WORKER_MEMORY_MB','768'))*1024*1024
            resource.setrlimit(resource.RLIMIT_AS,(memory,memory))
            signal.alarm(int(os.environ.get('RELIVE_TIMEOUT','30')))
            try:
                result=prepared.run(request["library"],request["params"])
                output.write_text(json.dumps(result,separators=(',',':'),allow_nan=False))
                os._exit(0)
            except BaseException as exc:
                output.with_suffix('.error').write_text(str(exc))
                os._exit(1)
        _,status,usage=os.wait4(pid,0)
        code=os.waitstatus_to_exitcode(status)
        error=None
        if code:
            error=output.with_suffix('.error').read_text() if output.with_suffix('.error').exists() else f"Native worker exited {code}" + (f" ({signal.Signals(-code).name})" if code<0 else "")
        print(json.dumps({"ok":code==0,"error":error,"worker_ms":(time.perf_counter()-started)*1000,"worker_peak_rss_mb":usage.ru_maxrss/1024,"host_peak_rss_mb":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,"pid":pid,"prepared_id":prepared.id,"host_pid":os.getpid()}),flush=True)

if __name__=="__main__": main()
