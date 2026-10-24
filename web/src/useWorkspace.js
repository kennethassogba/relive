import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

const defaults = {
  netlist: { parts: 4, passes: 12, seed: 42, imbalance: 0.05 },
  mesh: { ratio: 0.2, feature_weight: 40 },
};
export function useWorkspace() {
  const [state, setState] = useState(null),
    [project, setProject] = useState(
      () => new URLSearchParams(location.search).get("project") || "netlist",
    );
  const [selected, setSelected] = useState(null),
    [pinned, setPinned] = useState(null),
    [scene, setScene] = useState(null);
  const [error, setError] = useState(""),
    [online, setOnline] = useState(true),
    [params, setParams] = useState(defaults.netlist);
  const cache = useRef(new Map()),
    inputs = useRef(new Map()),
    ack = useRef(new Set()),
    sessionStart = useRef(Date.now() * 1e6);
  const camera = useRef({ yaw: 0.25, pitch: 0.08, distance: 1.55 });
  const dataset =
    state?.projects[project]?.dataset ||
    (project.startsWith("mesh") ? "mesh" : "netlist");
  const refresh = useCallback(async () => {
    try {
      setState(await api("state"));
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const events = new EventSource("/api/events");
    events.onmessage = (e) => {
      if (e.data !== "ping") refresh();
    };
    events.onerror = () => setOnline(false);
    return () => events.close();
  }, [refresh]);
  useEffect(() => {
    if (state?.projects[project]) setParams(state.branches[project].params);
  }, [project, state?.projects[project]?.source]);
  const runs = (state?.runs || [])
    .filter((r) => r.project === project)
    .slice()
    .reverse();
  const current = selected
    ? runs.find((r) => r.id === selected)
    : runs.find((r) => r.status === "ready");
  const reference = pinned
    ? (state?.runs || []).find((r) => r.id === pinned)
    : null;
  const phase = state?.status[project]?.phase || "idle";
  const busy = ["queued", "compiling", "preparing", "running"].includes(phase);
  const failure = runs[0]?.status === "error" ? runs[0] : null;
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!current) {
        setScene(null);
        return;
      }
      try {
        async function result(id) {
          if (!cache.current.has(id)) {
            cache.current.set(id, await api("result/" + id));
            if (cache.current.size > 12)
              cache.current.delete(cache.current.keys().next().value);
          }
          return cache.current.get(id);
        }
        if (!inputs.current.has(current.prepared_id)) {
          inputs.current.set(
            current.prepared_id,
            await api("prepared/" + current.prepared_id),
          );
          if (inputs.current.size > 4)
            inputs.current.delete(inputs.current.keys().next().value);
        }
        const [right, left] = await Promise.all([
          result(current.id),
          reference ? result(reference.id) : null,
        ]);
        if (!cancelled)
          setScene({
            id: current.id,
            prepared: inputs.current.get(current.prepared_id),
            right,
            left,
          });
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [current?.id, reference?.id]);
  const rendered = useCallback(
    async (id) => {
      if (!id) return;
      document.documentElement.dataset.drawnRun = id;
      if (ack.current.has(id)) return;
      const run = state?.runs.find((r) => r.id === id);
      if (!run || run.started_ns < sessionStart.current || run.paint_ms != null)
        return;
      ack.current.add(id);
      document.documentElement.dataset.renderedRun = id;
      try {
        await api("paint", { id });
        refresh();
      } catch (e) {
        setError(e.message);
      }
    },
    [state, refresh],
  );
  function changeProject(p) {
    setProject(p);
    setSelected(null);
    setPinned(null);
    setScene(null);
    setError("");
    setParams(defaults[p.startsWith("mesh") ? "mesh" : "netlist"]);
    history.replaceState({}, "", "?project=" + p);
  }
  async function action(fn) {
    try {
      setError("");
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  const run = (fresh = false) =>
    action(async () => {
      setSelected(null);
      await api("run", { project, params, fresh });
    });
  const replay = () =>
    action(async () => {
      setSelected(null);
      await api("replay", { id: current.id });
    });
  const branch = (name) =>
    action(async () => {
      await api("branch", { id: current.id, name });
      setParams(current.params);
      setSelected(null);
    });
  const restore = () =>
    action(async () => {
      const f = await api("source/" + project);
      await api("restore", { id: current.id, base_sha256: f.sha256 });
      setSelected(null);
    });
  const variant = () =>
    action(async () => {
      const f = await api("source/" + project);
      const source =
        dataset === "netlist"
          ? f.source.replace(
              /FANOUT_EXPONENT = [\d.]+/,
              "FANOUT_EXPONENT = 1.0",
            )
          : f.source.replace(
              /FEATURE_BIAS(?:\: f64)? = [\d.]+/,
              project === "mesh-rust"
                ? "FEATURE_BIAS: f64 = 8.0"
                : "FEATURE_BIAS = 8.0",
            );
      if (source === f.source) return;
      if (current) {
        setPinned(current.id);
        await api("branch", {
          id: current.id,
          name: dataset === "netlist" ? "fanout-aware" : "preserve-features",
        });
      }
      setSelected(null);
      await api("save", { project, source, base_sha256: f.sha256 });
    });
  return {
    state,
    project,
    dataset,
    runs,
    current,
    reference,
    phase,
    busy,
    failure,
    scene,
    camera,
    params,
    setParams,
    error,
    setError,
    online,
    selected,
    setSelected,
    pinned,
    setPinned,
    refresh,
    rendered,
    changeProject,
    run,
    replay,
    branch,
    restore,
    variant,
  };
}
