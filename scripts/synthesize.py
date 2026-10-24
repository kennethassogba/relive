"""Reproduce the PicoRV32 input using an installed Yosys or YoWASP-Yosys."""
from pathlib import Path
import os
import shutil
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
yosys=shutil.which('yosys') or shutil.which('yowasp-yosys') or str(root/'.venv/bin/yowasp-yosys')
# Synthesis is dataset acquisition, not part of the algorithm iteration benchmark.
command='read_verilog assets/picorv32.v; synth -top picorv32; write_json assets/picorv32.json'
env={**os.environ,'XDG_CACHE_HOME':str(root/'.tools/cache')}
print(command,flush=True)
subprocess.run([yosys,'-p',command],cwd=root,env=env,check=True)
print('Stop and restart Relive to prepare a snapshot of the regenerated input.')
