import React from "react";
import { Play, RotateCcw, Download, ArrowUpRight } from "lucide-react";
import { number, ms } from "./api";
const pct = (v) => (v == null ? "—" : (v * 100).toFixed(2) + "%");
export function Inspector({ w }) {
  const m = w.scene?.right.metrics,
    a = w.scene?.left?.metrics,
    meta = w.scene?.prepared.meta,
    p = w.params;
  const rows =
    w.dataset === "netlist"
      ? [
          ["Cut nets", a?.cut_nets, m?.cut_nets, number],
          ["Connectivity", a?.connectivity, m?.connectivity, number],
          ["Imbalance", a?.balance, m?.balance, pct],
          ["Native time", a?.algorithm_ms, m?.algorithm_ms, ms],
        ]
      : [
          ["Triangles", a?.triangles ?? meta?.triangles, m?.triangles, number],
          ["Vertices", a?.vertices ?? meta?.vertices, m?.vertices, number],
          ["RMS error", a?.rms_error ?? 0, m?.rms_error, pct],
          ["Native time", a?.algorithm_ms, m?.algorithm_ms, ms],
        ];
  return (
    <>
      <section className="inspector-section">
        <h2>Comparison</h2>
        <table className="metric-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">A</th>
              <th scope="col">B</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, x, y, format]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{format(x)}</td>
                <td>{format(y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="help">
          {w.dataset === "mesh"
            ? "Error: input vertices to output surface, relative to the input diagonal."
            : "Connectivity counts extra partitions per net. Lower is better."}
        </p>
      </section>
      <section className="inspector-section">
        <h2>Parameters</h2>
        <div className="fields">
          {w.dataset === "netlist" ? (
            <>
              <label>
                Partitions
                <select
                  value={p.parts || 4}
                  onChange={(e) =>
                    w.setParams({ ...p, parts: +e.target.value })
                  }
                >
                  {[2, 4, 8].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Refinement passes
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={p.passes || 12}
                  onChange={(e) =>
                    w.setParams({ ...p, passes: +e.target.value })
                  }
                />
              </label>
              <label>
                Seed
                <input
                  type="number"
                  min="0"
                  value={p.seed ?? 42}
                  onChange={(e) => w.setParams({ ...p, seed: +e.target.value })}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Keep triangles
                <output>{Math.round((p.ratio || 0.2) * 100)}%</output>
                <input
                  type="range"
                  min=".05"
                  max=".8"
                  step=".05"
                  value={p.ratio || 0.2}
                  onChange={(e) =>
                    w.setParams({ ...p, ratio: +e.target.value })
                  }
                />
              </label>
              <label>
                Feature weight
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={p.feature_weight ?? 40}
                  onChange={(e) =>
                    w.setParams({ ...p, feature_weight: +e.target.value })
                  }
                />
              </label>
            </>
          )}
        </div>
        <button
          className="link-button variant-button"
          disabled={!w.current || w.busy}
          onClick={w.variant}
        >
          {w.dataset === "netlist"
            ? "Try fanout weighting"
            : "Try feature protection"}
          <ArrowUpRight size={14} />
        </button>
      </section>
      <section className="inspector-section">
        <h2>Prepared input</h2>
        <dl className="input-facts">
          <div>
            <dt>{w.dataset === "mesh" ? "Faces" : "Cells"}</dt>
            <dd>
              {number(
                w.dataset === "mesh" ? meta?.triangles : meta?.cells?.length,
              )}
            </dd>
          </div>
          <div>
            <dt>Snapshot</dt>
            <dd>{w.current?.prepared_id.slice(0, 10) || "—"}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{meta ? `${(meta.bytes / 1048576).toFixed(1)} MB` : "—"}</dd>
          </div>
        </dl>
        <p className="help">
          {w.current
            ? "Retained between runs. Each experiment saves its source and parameters."
            : "Created on the first run."}
        </p>
      </section>
      {w.current && (
        <section className="inspector-section experiment-actions">
          <h2>Selected experiment</h2>
          <button onClick={w.replay} disabled={w.busy}>
            <Play size={14} />
            Replay
          </button>
          <button onClick={w.restore} disabled={w.busy}>
            <RotateCcw size={14} />
            Restore code
          </button>
          <a href={"/api/export/" + w.current.id} download>
            <Download size={14} />
            Export experiment
          </a>
        </section>
      )}
    </>
  );
}
