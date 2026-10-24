# A two-minute demonstration

Start `npm run dev`, open http://127.0.0.1:7331, and keep your editor beside it. All displayed geometry and partition assignments come from native runs.

## 0:00 · One input, two ideas

Open PicoRV32 and click **Prepare & run**. Point out the 8,477 cells and the prepared snapshot ID. In your editor, change `FANOUT_EXPONENT` from `0.0` to `1.0` in `examples/netlist/partition.cpp` and save.

The watcher compiles the file. The result updates without loading or preparing the netlist again. Pin the preceding experiment with its **A** button and enable **Cut connections**. Compare cut nets, connectivity and balance. The native time and full save-to-visible time measure different things.

## 0:35 · Give the bad idea its own branch

Select the earlier successful run. Click **Branch from here**, name it `another-idea`, and change the code again. The branch inherits the prepared input and parameters. Click **Replay** on the original experiment to reproduce its result without overwriting the working file.

If you want to show crash recovery, temporarily introduce a syntax error in the source and save. The build error appears while the previous visualization stays on screen. Fix the error to continue.

## 1:00 · The same loop in 3D

Select Jerry the ogre and run it. The original has 39,856 triangles; the default 20% target produces 7,970. Click **Try feature protection**. This edits the C++ cost function, creates a branch and pins the previous result.

Drag either view: both cameras move together. Toggle **Wireframe**, then **Error map**. The error maps share a fixed scale, and the reported error is sampled from input vertices to output triangles. A different criterion can improve one region and worsen another.

## 1:35 · Switch to Rust

Choose **Rust** in Run parameters. Open `examples/mesh/criterion.rs`, change `FEATURE_BIAS`, and save. The model stays prepared; rustc produces the new native library.

Finish with **Export experiment**, then show the measured medians in [benchmark.md](benchmark.md). The numbers are machine-specific; the raw samples are included. Avoid presenting one fastest run as a universal latency promise.

## Captures

- [Partition comparison](images/netlist-comparison.png)
- [Mesh comparison](images/mesh-comparison.png)
- [Wireframe](images/mesh-wireframe.png)
- [Geometric error](images/mesh-error.png)

The screenshots are recorded results. Interactive recompilation runs in the local application.
