# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers iterating on native C++ and Rust algorithms in their usual editor.

## Product Purpose

Keep prepared data available between source edits, compile the real native implementation, inspect its output and compare reproducible experiments from the same starting point.

## Operating Context

Local Linux workstation. The user's machine has 8 GB RAM and limited spare RAM/swap. Compiles, native work and browser verification must remain serial. The public repository supplies reproducible demos, data attribution, measured latency and posts to share the work.

## Capabilities and Constraints

PicoRV32 netlist partitioning in C++; libigl mesh simplification with a C++ or Rust criterion. Prepared snapshots, branches, run archives, code restoration, replay and export are implemented. The server is local. A public page can present recorded results but cannot claim remote live compilation. Memory limits and measurements are documented.

## Brand Commitments

White backgrounds, clear sans-serif typography, restrained light interfaces. No green/lime palettes, serif headlines, beige page washes, glossy illustrations, ornamental cards or generic promotional copy. The user explicitly rejected the first generic dashboard and requested a rebuild from the ground up informed by strong developer-interface standards. The original brief delegates architecture and execution choices.

## Evidence on Hand

Native data and source manifests in assets/. Twelve passing local runtime tests; successful browser interaction and accessibility checks on the original interface. Raw latency samples in docs/benchmark.json. The redesign must rerun browser checks and refresh captures and latency measurements because the rendered surface changes.

## Product Principles

- Code changes alter actual native results.
- Prepared inputs are immutable and reusable.
- Comparing experiments must expose the input identity and measured differences.
- Errors preserve the last valid result.
- Interface controls serve ongoing work, not product promotion.
