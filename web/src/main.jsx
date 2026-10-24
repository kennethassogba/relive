import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Tabs from "@radix-ui/react-tabs";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Cpu,
  Box,
  Play,
  GitBranch,
  Code2,
  PanelLeft,
  PanelRight,
  ChevronDown,
  ChevronUp,
  Link2,
  RotateCcw,
  X,
  Loader2,
  Check,
  ScanLine,
  Activity,
  Workflow,
} from "lucide-react";
import { ms } from "./api";
import { useWorkspace } from "./useWorkspace";
import { CodeDock } from "./CodeDock";
import { Inspector } from "./Inspector";
import { Experiments } from "./Experiments";
import { MeshViewport, NetlistViewport } from "./Viewport";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "./style.css";
const phases = {
  idle: "Ready",
  queued: "Queued",
  compiling: "Compiling",
  preparing: "Preparing input",
  running: "Running",
  ready: "Watching files",
  error: "Build failed",
};
function App() {
  const w = useWorkspace();
  const [navigation, setNavigation] = useState(() => innerWidth >= 1000),
    [inspector, setInspector] = useState(() => innerWidth >= 1000),
    [dock, setDock] = useState(false),
    [tab, setTab] = useState("code");
  const [wireframe, setWireframe] = useState(false),
    [errorMap, setErrorMap] = useState(false),
    [cuts, setCuts] = useState(false),
    [inspection, setInspection] = useState(""),
    [reset, setReset] = useState(0);
  const [dialog, setDialog] = useState(false),
    [name, setName] = useState("");
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!w.busy) w.run();
      }
      if (e.key === "Escape" && innerWidth < 1000) {
        setNavigation(false);
        setInspector(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [w.busy, w.run]);
  useEffect(() => {
    const q = matchMedia("(min-width:1000px)");
    const resize = () => {
      setNavigation(q.matches);
      setInspector(q.matches);
    };
    q.addEventListener("change", resize);
    return () => q.removeEventListener("change", resize);
  }, []);
  const openCode = () => {
    setTab("code");
    setDock(true);
  };
  const branch = () => {
    setName("experiment-" + (w.runs.length + 1));
    setDialog(true);
  };
  const resetView = () => {
    Object.assign(w.camera.current, { yaw: 0.25, pitch: 0.08, distance: 1.55 });
    setReset((v) => v + 1);
  };
  const current = w.current,
    scene = w.scene;
  const timings = current
    ? [
        [
          "Compile" + (current.cache_hit ? " (cached)" : ""),
          current.compile_ms,
        ],
        ["Prepared host access", current.prepare_ms],
        ["Native worker + serialization", current.worker_ms],
        ["Save → result ready", current.ready_ms],
        ["Save → browser draw", current.paint_ms],
      ]
    : [];
  return (
    <div className="workbench">
      <header className="command-bar">
        <a href="/" className="brand" aria-label="Relive home">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 5h7a6 6 0 0 1 0 12H6m0-12v14m0-8h6m1 6 5 3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>Relive</span>
        </a>
        <span className="header-divider" />
        <h1>{w.dataset === "netlist" ? "PicoRV32" : "Jerry the ogre"}</h1>
        <span className="project-kind">
          {w.dataset === "netlist" ? "Partitioning" : "Simplification"}
        </span>
        <div className="command-spacer" />
        <button className="branch-control" onClick={branch} disabled={!current}>
          <GitBranch size={14} />
          <span>{w.state?.branches[w.project]?.name || "main"}</span>
          <ChevronDown size={13} />
        </button>
        <button className="primary" onClick={() => w.run()} disabled={w.busy}>
          {w.busy ? <Loader2 className="spin" size={14} /> : <Play size={14} />}
          Run<kbd>⌃ ↵</kbd>
        </button>
      </header>
      <div className="project-bar">
        <button
          className="icon-button"
          aria-label="Toggle experiments"
          aria-expanded={navigation}
          onClick={() => {
            setNavigation(!navigation);
            if (innerWidth < 1000) setInspector(false);
          }}
        >
          <PanelLeft size={16} />
        </button>
        <nav aria-label="Examples">
          <button
            className={w.dataset === "netlist" ? "active" : ""}
            aria-label="PicoRV32 Netlist partitioning"
            onClick={() => {
              w.changeProject("netlist");
              setInspection("");
            }}
          >
            <Cpu size={15} />
            PicoRV32
          </button>
          <button
            className={w.dataset === "mesh" ? "active" : ""}
            aria-label="Jerry the ogre Mesh simplification"
            onClick={() => {
              w.changeProject("mesh-cpp");
              setInspection("");
            }}
          >
            <Box size={15} />
            Jerry
          </button>
        </nav>
        <div className="command-spacer" />
        <button onClick={openCode} aria-label="Code">
          <Code2 size={15} />
          <span>Code</span>
        </button>
        <button
          className="icon-button"
          aria-label="Toggle inspector"
          aria-expanded={inspector}
          onClick={() => {
            setInspector(!inspector);
            if (innerWidth < 1000) setNavigation(false);
          }}
        >
          <PanelRight size={16} />
        </button>
      </div>
      <div
        className={
          "workspace " +
          (navigation ? "with-navigation " : "") +
          (inspector ? "with-inspector" : "")
        }
      >
        {(navigation || inspector) && (
          <button
            className="panel-scrim"
            aria-label="Close side panels"
            onClick={() => {
              setNavigation(false);
              setInspector(false);
            }}
          />
        )}
        {navigation && (
          <aside className="experiment-navigator" aria-label="Experiments">
            <Experiments w={w} onBranch={branch} onCode={openCode} />
          </aside>
        )}
        <main className="working-area">
          <section className="result-area" aria-label="Result comparison">
            <div className="canvas-toolbar">
              <span className="comparison-title">Compare</span>
              <div className="command-spacer" />
              {w.dataset === "mesh" ? (
                <>
                  <button
                    aria-pressed={wireframe}
                    onClick={() => setWireframe(!wireframe)}
                  >
                    <ScanLine size={14} />
                    <span>Wireframe</span>
                  </button>
                  <button
                    aria-pressed={errorMap}
                    onClick={() => setErrorMap(!errorMap)}
                  >
                    <Activity size={14} />
                    <span>Error map</span>
                  </button>
                </>
              ) : (
                <button aria-pressed={cuts} onClick={() => setCuts(!cuts)}>
                  <Workflow size={14} />
                  <span>Cut connections</span>
                </button>
              )}
              <span className="sync-label">
                <Link2 size={13} />
                {w.dataset === "mesh" ? "Synced" : "Locked"}
              </span>
              <button
                className="icon-button"
                aria-label="Reset view"
                title="Reset view"
                onClick={resetView}
              >
                <RotateCcw size={14} />
              </button>
            </div>
            {(w.error || w.failure) && (
              <div className="build-error" role="alert">
                <span>
                  {w.error
                    ? "Action failed"
                    : "Build failed. Last result retained."}
                </span>
                <button
                  onClick={() => {
                    setTab("console");
                    setDock(true);
                  }}
                >
                  View console
                </button>
                {w.error && (
                  <button
                    className="icon-button"
                    aria-label="Dismiss error"
                    onClick={() => w.setError("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            <div className="viewport-labels">
              <div>
                <span className="view-tag">A</span>
                <span>
                  {w.reference?.branch || "Prepared input"}
                  <small>
                    {w.reference?.source_sha256.slice(0, 7) ||
                      (w.dataset === "mesh"
                        ? "39,856 triangles"
                        : "8,477 cells")}
                  </small>
                </span>
                {w.reference && (
                  <button
                    className="icon-button"
                    aria-label="Clear reference"
                    onClick={() => w.setPinned(null)}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div>
                <span className="view-tag b">B</span>
                <span>
                  {current?.branch || "Result"}
                  <small>
                    {current?.source_sha256.slice(0, 7) || "No run yet"}
                  </small>
                </span>
                {w.selected && (
                  <button
                    className="link-button live-control"
                    onClick={() => w.setSelected(null)}
                  >
                    Latest
                  </button>
                )}
              </div>
            </div>
            <div className="viewports">
              {scene ? (
                w.dataset === "mesh" ? (
                  <MeshViewport
                    {...scene}
                    camera={w.camera}
                    wireframe={wireframe}
                    errorMap={errorMap}
                    resetCamera={reset}
                    runId={scene.id}
                    onRendered={w.rendered}
                  />
                ) : (
                  <NetlistViewport
                    {...scene}
                    showCuts={cuts}
                    resetCamera={reset}
                    runId={scene.id}
                    onRendered={w.rendered}
                    onInspect={setInspection}
                  />
                )
              ) : (
                <div className="empty-canvas">
                  <strong>
                    {w.dataset === "mesh"
                      ? "Jerry the ogre"
                      : "PicoRV32 netlist"}
                  </strong>
                  <p>
                    {w.busy
                      ? phases[w.phase]
                      : "Prepare the input to start comparing native algorithms."}
                  </p>
                  <button disabled={w.busy} onClick={() => w.run()}>
                    <Play size={14} />
                    Prepare & run
                  </button>
                </div>
              )}
              <div className="split-line" />
            </div>
            <div className="canvas-footnote">
              {w.dataset === "netlist" ? (
                <div className="legend">
                  {Array.from(
                    { length: current?.params.parts || 4 },
                    (_, i) => (
                      <span key={i}>
                        <i
                          style={{
                            background: [
                              "#3478e5",
                              "#e88b43",
                              "#9b70d4",
                              "#df6d95",
                              "#5eafd5",
                              "#ac743e",
                              "#355290",
                              "#dd4b4b",
                            ][i % 8],
                          }}
                        />
                        P{i}
                      </span>
                    ),
                  )}
                </div>
              ) : errorMap ? (
                <span className="error-scale">
                  0%
                  <i />
                  ≥1% of diagonal
                </span>
              ) : (
                <span>Drag to orbit · Scroll to zoom</span>
              )}
              <span className="canvas-detail">
                {inspection ||
                  (w.dataset === "netlist"
                    ? "Scroll to zoom · drag to pan · click a cell"
                    : "Shared camera · CC0 source")}
              </span>
            </div>
          </section>
          <Tabs.Root
            className={"bottom-dock " + (dock ? "is-open" : "")}
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              setDock(true);
            }}
          >
            <div className="dock-toolbar">
              <Tabs.List aria-label="Workspace panels">
                <Tabs.Trigger value="code">Code</Tabs.Trigger>
                <Tabs.Trigger value="timing">Timing</Tabs.Trigger>
                <Tabs.Trigger value="console">
                  Console{w.failure && <span className="error-count">1</span>}
                </Tabs.Trigger>
              </Tabs.List>
              <div className="command-spacer" />
              {w.dataset === "mesh" && (
                <select
                  aria-label="Native language"
                  value={w.project}
                  onChange={(e) => w.changeProject(e.target.value)}
                >
                  <option value="mesh-cpp">C++</option>
                  <option value="mesh-rust">Rust</option>
                </select>
              )}
              <button
                className="icon-button"
                aria-label={
                  dock ? "Collapse bottom panel" : "Expand bottom panel"
                }
                onClick={() => setDock(!dock)}
              >
                {dock ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>
            <Tabs.Content forceMount value="code" className="dock-content">
              <CodeDock
                project={w.project}
                onError={w.setError}
                onSaved={() => {
                  w.setSelected(null);
                  w.refresh();
                }}
                refreshKey={current?.id}
              />
            </Tabs.Content>
            <Tabs.Content
              forceMount
              value="timing"
              className="dock-content timing-content"
            >
              <table>
                <tbody>
                  {timings.map(([label, value]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{ms(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div>
                <p>
                  Browser draw includes native compilation, execution, transfer
                  and two animation frames. Classic cycles reload and prepare
                  the same input.
                </p>
                <button disabled={w.busy} onClick={() => w.run(true)}>
                  <RotateCcw size={14} />
                  Measure a classic cycle
                </button>
              </div>
            </Tabs.Content>
            <Tabs.Content
              forceMount
              value="console"
              className="dock-content console-content"
            >
              <pre>
                {w.error ||
                  w.failure?.error ||
                  "No build errors. Watching native source files."}
              </pre>
            </Tabs.Content>
          </Tabs.Root>
        </main>
        {inspector && (
          <aside className="inspector" aria-label="Result inspector">
            <Inspector w={w} />
          </aside>
        )}
      </div>
      <footer className="status-bar">
        <span role="status">
          {w.busy ? (
            <Loader2 size={12} className="spin" />
          ) : (
            <span className={"status-dot " + (!w.online ? "offline" : "")} />
          )}{" "}
          {w.online ? phases[w.phase] : "Reconnecting"}
        </span>
        <span className="retained-status">
          {current ? (
            <>
              <Check size={12} />
              Input retained
            </>
          ) : (
            "Local runtime"
          )}
        </span>
        <div className="command-spacer" />
        <span>
          {current?.paint_ms != null
            ? `${ms(current.paint_ms)} save → draw`
            : "Save → draw: awaiting run"}
        </span>
        <span className="language-status">
          {w.project === "mesh-rust" ? "Rust" : "C++"}
        </span>
      </footer>
      <Dialog.Root open={dialog} onOpenChange={setDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="branch-dialog">
            <Dialog.Title>Branch from this experiment</Dialog.Title>
            <Dialog.Description>
              Reuse the prepared input and parameters. Your working source stays
              in your editor.
            </Dialog.Description>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await w.branch(name);
                setDialog(false);
              }}
            >
              <label>
                Branch name
                <input
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button className="primary" type="submit">
                Create branch
              </button>
            </form>
            <Dialog.Close
              className="dialog-close icon-button"
              aria-label="Close branch dialog"
            >
              <X size={17} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
