# Sources and attribution

Relive's own code is MIT licensed. Third-party code and data retain their own licenses.

| Component | Source / version | License / use |
| --- | --- | --- |
| PicoRV32 | [YosysHQ/picorv32](https://github.com/YosysHQ/picorv32), commit `ef203c2b0a3fb793280f5114941416c425c5b461` | ISC; Verilog and derived netlist. See `assets/PicoRV32-LICENSE`. |
| Jerry the Ogre | [Keenan Crane's model repository](https://www.cs.cmu.edu/~kmcrane/Projects/ModelRepository/), `ogre.zip`, `bs_rest.obj` | CC0 1.0, as stated on the author's model page. The original README is in `assets/Jerry-README.txt`. Only geometry is bundled. |
| libigl | [libigl/libigl](https://github.com/libigl/libigl), v2.5.0, commit `fdaac01bcc52888994f7afd029dcc045dd408484` | MPL-2.0; unmodified source downloaded with checksum verification. Decimation and closest-surface distance. See `third_party/libigl/LICENSE.MPL2`. |
| Eigen | [Eigen](https://libeigen.gitlab.io/), system headers | MPL-2.0; linear algebra. Version is supplied by the Linux package manager. |
| Yosys | [YosysHQ/yosys](https://github.com/YosysHQ/yosys), bundled netlist generated with Yosys 0.70 (`28ba3cb92`) through YoWASP | ISC; synthesis tool, not required for normal runtime. |
| YoWASP | [YoWASP/yosys](https://github.com/YoWASP/yosys), `yowasp-yosys==0.70.0.0.post1259` | ISC; optional reproduction of synthesis. |
| NumPy / SciPy | Exact versions in `requirements.txt` | BSD-3-Clause; prepared buffers, sparse connectivity ordering. |
| React / Three.js / Vite / Lucide | Exact dependency graph in `package-lock.json` | MIT / MIT / MIT / ISC; UI, renderer, build and icons. |
| Inter | [rsms/inter](https://github.com/rsms/inter), bundled through `@fontsource/inter` | SIL Open Font License 1.1; served locally. |
| Playwright / axe-core | Exact versions in `package-lock.json` | Apache-2.0 / MPL-2.0; development verification only. |

Input and archive SHA-256 hashes are in `assets/manifest.json`. The two `.gz` files are lossless compressed copies of the recorded OBJ and synthesized JSON. No generated image is used as a substitute for algorithm output.

The netlist view is a deterministic connectivity ordering, not a routed chip floorplan. The mesh is normalized by its bounding-box diagonal; error values are fractions of that diagonal. Jerry has open boundaries; the demo locks their vertices during simplification.
