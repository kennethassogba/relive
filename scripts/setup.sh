#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Linux ]]; then echo 'Relive currently requires Linux (or WSL2).'; exit 1; fi
for command in python3 node npm g++; do command -v "$command" >/dev/null || { echo "Missing prerequisite: $command"; exit 1; }; done
test -f /usr/include/eigen3/Eigen/Core || { echo 'Install Eigen headers: sudo apt install libeigen3-dev'; exit 1; }
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
if ! command -v rustc >/dev/null && ! test -f .tools/rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin/rustc; then
  echo 'Install Rust with rustup (https://rustup.rs), then rerun setup.'; exit 1
fi
.venv/bin/python scripts/prepare.py
npm ci
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 .venv/bin/python -m relive build-engine
npm run build
echo 'Ready. Run npm run dev and open http://127.0.0.1:7331'
