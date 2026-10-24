# Measured save-to-visible latency

Measured on 24 October 2026 on an Intel Core i7-8650U @ 1.90 GHz, 8 logical CPUs and 7,289 MiB of OS-visible RAM. The machine was running its normal desktop workload. Chromium used **SwiftShader software rendering**. These are prototype measurements on this laptop, not hardware-GPU performance or a universal latency promise.

| Example | Relive median | Classic median | Ratio | Median time saved |
| --- | ---: | ---: | ---: | ---: |
| PicoRV32, C++ | 1,595 ms | 2,239 ms | 1.40× | 644 ms |
| Jerry, C++ | 1,475 ms | 2,936 ms | 1.99× | 1,461 ms |
| Jerry, Rust | 1,258 ms | 2,958 ms | 2.35× | 1,700 ms |

Measured again after the workbench redesign. Other open Relive views were fixed on historical experiments so only the measurement browser acknowledged new results.

Five measured source edits per mode and example, 30 measured edits in total. The order of the two modes alternates between repetitions. Each edit changes the native heuristic and adds a unique source comment, ensuring a fresh plugin build. Warmup runs and restoration of the original source are excluded. The report contains every measured sample, including slower runs.

| Example | Relive range | Classic range |
| --- | ---: | ---: |
| PicoRV32, C++ | 1,171–2,369 ms | 1,718–4,252 ms |
| Jerry, C++ | 1,446–1,545 ms | 2,588–3,037 ms |
| Jerry, Rust | 1,155–1,495 ms | 2,418–3,179 ms |

With only five samples, the nearest-rank p95 is the maximum observation. This small sample does not establish stable tail latency. Desktop activity, compiler page faults, swap pressure and software rendering contribute to variation. The measurements are not taken on an idle, isolated benchmark machine.

## What the clock includes

The start is the source file's modification timestamp. The end is the server's receipt of an acknowledgement after the browser draws the matching result and waits two animation frames. Mesh rendering waits for GPU completion before acknowledging. The metric includes watcher debounce, compilation, native execution, result serialization, HTTP delivery, rendering and the acknowledgement round trip. It is a conservative browser-draw measurement, not a physical screen scanout measurement.

Both modes use the same watcher, source semantics, optimized compiler flags, raw input, warmed browser and prebuilt libigl engine. Relive forks from a prepared host. Classic recompiles the plugin and starts a fresh host that parses and prepares the raw input again. OS file caches remain warm. Synthesis, data downloads and first-time compilation of libigl are excluded from both modes. Classic also retains the browser UI, so it does not charge a full frontend restart.

The standalone native kernel is much faster than the complete edit loop. Do not quote its time as save-to-visible latency. Per-sample compilation, preparation, worker and algorithm times are in [benchmark.json](benchmark.json).

## Memory

Observed process high-water RSS values during this measurement:

| Example | Largest native worker | Largest prepared host |
| --- | ---: | ---: |
| PicoRV32, C++ | 71.3 MiB | 89.7 MiB |
| Jerry, C++ | 62.2 MiB | 79.4 MiB |
| Jerry, Rust | 62.3 MiB | 79.5 MiB |

These values come from Linux `wait4` / `getrusage`. They are **per-process RSS**, not whole-application memory. Shared copy-on-write pages appear in multiple processes' RSS, so adding the columns overcounts shared memory. Browser and compiler memory are separate and are not represented by this table.

The runtime serializes build/run work, limits workers to 768 MiB of virtual memory and compilers to 1536 MiB, and keeps at most one prepared process per dataset. These are limits, not observed consumption or a guarantee on total desktop memory. Normal setup uses the bundled input files to avoid the memory cost of WebAssembly synthesis.

## Toolchains and reproduction

- GCC 15.2.0, `-std=c++17 -O2 -fPIC -shared`.
- Rust 1.99.1, `cdylib`, edition 2021, optimization level 2, panic abort.
- Python 3.14.4, pinned NumPy / SciPy packages.
- libigl v2.5.0, Eigen system headers, serial geometry execution.
- Exact Chromium version, Linux build, individual source hashes and metrics: [raw report](benchmark.json).

```bash
npm run dev
# In another terminal:
npx playwright install chromium
npm run benchmark
```

The script restores the working source after each example. Its output replaces `docs/benchmark.json`; update this Markdown table when publishing a new measurement.

## Validation

The local native suite passes 12 tests: output changes, balance, prepared-state reuse, deterministic replay, compile failure, native crash isolation, ABI rejection, native log isolation, C++/Rust mesh equivalence, fresh classic runs, parameter validation and corrupted snapshots.

Browser checks cover source edits, branch creation, compile-error recovery, both native demos, synchronized camera controls, wireframe, geometric error, export, cross-origin rejection, and widths 320/768/1024/1440. The tested 320px and 1440px netlist views and 1440px mesh view had no axe WCAG A/AA violations. Automated checks do not establish complete accessibility conformance.

An exported Rust mesh experiment was imported into a separate state directory and replayed successfully. Numerical geometry was checked against the exported result.
