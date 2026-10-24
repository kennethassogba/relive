import React from "react";
import { GitBranch, Plus, FileCode2, Database } from "lucide-react";
import { ms } from "./api";
export function Experiments({ w, onBranch, onCode }) {
  return (
    <>
      <div className="panel-heading">
        <h2>Experiments</h2>
        <button
          className="icon-button"
          aria-label="Branch from here"
          title="Branch from here"
          disabled={!w.current}
          onClick={onBranch}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="snapshot-root">
        <Database size={14} />
        <span>
          {w.dataset === "mesh" ? "jerry.obj" : "picorv32.json"}
          <small>{w.current?.prepared_id.slice(0, 10) || "Unprepared"}</small>
        </span>
      </div>
      <div className="run-list">
        {w.selected && (
          <button className="back-live" onClick={() => w.setSelected(null)}>
            Return to latest
          </button>
        )}
        {w.runs.slice(0, 24).map((r) => (
          <div
            className={
              "run-row " + (w.current?.id === r.id ? "is-selected" : "")
            }
            key={r.id}
          >
            <button
              className="run-select"
              onClick={() =>
                r.status === "ready" ? w.setSelected(r.id) : w.setError(r.error)
              }
            >
              <GitBranch size={14} />
              <span>
                <strong>{r.branch}</strong>
                <small>
                  {r.source_sha256.slice(0, 7)} ·{" "}
                  {r.status === "error"
                    ? "Failed"
                    : ms(r.paint_ms ?? r.ready_ms)}
                </small>
              </span>
            </button>
            <button
              className={
                "reference-button " + (w.pinned === r.id ? "is-pinned" : "")
              }
              disabled={
                r.status !== "ready" || r.prepared_id !== w.current?.prepared_id
              }
              onClick={() => w.setPinned(w.pinned === r.id ? null : r.id)}
              aria-label={`Use experiment ${r.id.slice(-8)} as reference A`}
            >
              A
            </button>
          </div>
        ))}
        {!w.runs.length && (
          <p className="help empty-history">
            Your runs appear here, with their code and prepared input.
          </p>
        )}
      </div>
      <button className="source-link" onClick={onCode}>
        <FileCode2 size={15} />
        {w.dataset === "netlist"
          ? "partition.cpp"
          : w.project === "mesh-rust"
            ? "criterion.rs"
            : "criterion.cpp"}
      </button>
    </>
  );
}
