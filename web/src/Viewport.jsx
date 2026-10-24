import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const palette = [
  "#3478e5",
  "#e88b43",
  "#9b70d4",
  "#df6d95",
  "#5eafd5",
  "#ac743e",
  "#355290",
  "#dd4b4b",
];
const colors = palette.map((c) => new THREE.Color(c));

function geometry(positions, faces, errors) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(faces);
  g.computeVertexNormals();
  if (errors) {
    const rgb = [];
    // Fixed scale across experiments: 0..1% of input bounding-box diagonal.
    for (const d of errors) {
      const t = Math.min(1, d / 0.01);
      const c = new THREE.Color("#3279d8").lerp(new THREE.Color("#f07636"), t);
      rgb.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
  }
  return g;
}

export function MeshViewport({
  prepared,
  left,
  right,
  wireframe,
  errorMap,
  camera,
  onRendered,
  runId,
  resetCamera,
}) {
  const container = useRef();
  const engine = useRef();
  const callback = useRef(onRendered);
  callback.current = onRendered;
  useEffect(() => {
    const el = container.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "low-power",
      });
    } catch {
      el.innerHTML =
        '<p class="viewport-error">WebGL is unavailable. Metrics and experiment exports remain available.</p>';
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0xffffff);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Synchronized 3D comparison. Drag to orbit; scroll to zoom.",
    );
    const view = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    const scenes = [new THREE.Scene(), new THREE.Scene()];
    scenes.forEach((scene) => {
      scene.add(new THREE.HemisphereLight(0xffffff, 0x97a0b4, 2.4));
      const sun = new THREE.DirectionalLight(0xffffff, 3.4);
      sun.position.set(2, 3, 4);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xd9e9ff, 1.2);
      fill.position.set(-3, 0, -2);
      scene.add(fill);
    });
    const state = { renderer, view, scenes, groups: [], el };
    const render = () => {
      const width = el.clientWidth,
        height = el.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      renderer.setScissorTest(true);
      const { yaw, pitch } = camera.current;
      const distance =
        camera.current.distance * Math.max(1, 0.72 / (width / 2 / height));
      view.position.set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      );
      view.lookAt(0, 0, 0);
      const half = Math.floor(width / 2);
      view.aspect = half / height;
      view.updateProjectionMatrix();
      scenes.forEach((scene, i) => {
        renderer.setViewport(i * half, 0, i ? width - half : half, height);
        renderer.setScissor(i * half, 0, i ? width - half : half, height);
        renderer.render(scene, view);
      });
    };
    state.render = render;
    engine.current = state;
    const resize = new ResizeObserver(render);
    resize.observe(el);
    let last;
    const down = (e) => {
      last = [e.clientX, e.clientY];
      el.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!last) return;
      camera.current.yaw -= (e.clientX - last[0]) * 0.008;
      camera.current.pitch = Math.max(
        -1.3,
        Math.min(1.3, camera.current.pitch + (e.clientY - last[1]) * 0.008),
      );
      last = [e.clientX, e.clientY];
      render();
    };
    const up = () => {
      last = null;
    };
    const wheel = (e) => {
      e.preventDefault();
      camera.current.distance = Math.max(
        0.7,
        Math.min(4, camera.current.distance * Math.exp(e.deltaY * 0.001)),
      );
      render();
    };
    const key = (e) => {
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "-",
          "0",
        ].includes(e.key)
      ) {
        e.preventDefault();
        if (e.key === "0")
          Object.assign(camera.current, {
            yaw: 0.25,
            pitch: 0.08,
            distance: 1.55,
          });
        else if (e.key === "+" || e.key === "-")
          camera.current.distance = Math.max(
            0.7,
            Math.min(4, camera.current.distance * (e.key === "+" ? 0.9 : 1.1)),
          );
        else if (e.key === "ArrowLeft" || e.key === "ArrowRight")
          camera.current.yaw += e.key === "ArrowLeft" ? 0.1 : -0.1;
        else
          camera.current.pitch = Math.max(
            -1.3,
            Math.min(
              1.3,
              camera.current.pitch + (e.key === "ArrowUp" ? 0.1 : -0.1),
            ),
          );
        render();
      }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("keydown", key);
    return () => {
      resize.disconnect();
      [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "wheel",
        "keydown",
      ].forEach((n, i) =>
        el.removeEventListener(n, [down, move, up, up, wheel, key][i]),
      );
      state.groups.forEach((g) => {
        g.geometry.dispose();
        g.material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, [camera]);
  useEffect(() => {
    const e = engine.current;
    if (!e || !prepared) return;
    e.groups.forEach((g, i) => {
      e.scenes[i].remove(g);
      g.geometry.dispose();
      g.material.dispose();
    });
    e.groups = [left, right].map((result, i) => {
      const data = errorMap ? prepared : result || prepared;
      const errors = errorMap
        ? result?.errors || Array(prepared.positions.length / 3).fill(0)
        : null;
      const g = geometry(data.positions, data.faces, errors);
      const material = new THREE.MeshStandardMaterial({
        color: errors ? 0xffffff : 0x9faec3,
        roughness: 0.88,
        metalness: 0,
        vertexColors: !!errors,
        wireframe,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(g, material);
      e.scenes[i].add(mesh);
      return mesh;
    });
    e.render();
    // Complete GPU work before scheduling the paint acknowledgement. This is a
    // conservative browser draw measurement, not a display scanout timestamp.
    e.renderer.getContext().finish();
    let second;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => callback.current?.(runId));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [prepared, left, right, wireframe, errorMap, runId]);
  useEffect(() => {
    engine.current?.render();
  }, [resetCamera]);
  return (
    <div
      className="mesh-canvas"
      ref={container}
      tabIndex={0}
      role="img"
      aria-label="3D comparison. Arrow keys rotate, plus and minus zoom, zero resets."
    />
  );
}

export function NetlistViewport({
  prepared,
  left,
  right,
  showCuts,
  onRendered,
  runId,
  onInspect,
  resetCamera,
}) {
  const ref = useRef(),
    view = useRef({ zoom: 1, x: 0, y: 0 }),
    paint = useRef();
  const callback = useRef(onRendered);
  callback.current = onRendered;
  useEffect(() => {
    view.current = { zoom: 1, x: 0, y: 0 };
    paint.current?.();
  }, [resetCamera, prepared]);
  useEffect(() => {
    const canvas = ref.current,
      el = canvas.parentElement;
    if (!prepared) return;
    const point = (p, i, w, h) => {
      const scale =
        Math.max(1, Math.min(w / 2 - 40, h - 48)) * view.current.zoom;
      return [
        w / 4 + (i * w) / 2 + p[0] * scale + view.current.x,
        h / 2 + p[1] * scale + view.current.y,
      ];
    };
    const draw = () => {
      const w = el.clientWidth,
        h = el.clientHeight,
        dpr = Math.min(devicePixelRatio, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      [left, right].forEach((r, i) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect((i * w) / 2, 0, w / 2, h);
        ctx.clip();
        const parts = r?.partitions || prepared.positions.map(() => 0);
        if (showCuts) {
          ctx.beginPath();
          ctx.strokeStyle = "rgba(184,88,36,.16)";
          ctx.lineWidth = 0.65;
          for (const [a, b] of prepared.links) {
            if (parts[a] === parts[b]) continue;
            ctx.moveTo(...point(prepared.positions[a], i, w, h));
            ctx.lineTo(...point(prepared.positions[b], i, w, h));
          }
          ctx.stroke();
        }
        const dot = Math.max(
          1.2,
          Math.min(
            7,
            ((Math.min(w / 2 - 40, h - 48) * view.current.zoom) /
              Math.sqrt(parts.length)) *
              0.44,
          ),
        );
        prepared.positions.forEach((p, j) => {
          const xy = point(p, i, w, h);
          ctx.fillStyle = r ? palette[parts[j] % palette.length] : "#98a5b7";
          ctx.fillRect(xy[0] - dot / 2, xy[1] - dot / 2, dot, dot);
        });
        ctx.restore();
      });
    };
    paint.current = draw;
    const wheel = (e) => {
      e.preventDefault();
      view.current.zoom = Math.max(
        0.7,
        Math.min(12, view.current.zoom * Math.exp(-e.deltaY * 0.002)),
      );
      draw();
    };
    let last,
      start,
      moved = false;
    const down = (e) => {
      last = [e.clientX, e.clientY];
      start = last;
      moved = false;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!last) return;
      if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4)
        moved = true;
      view.current.x += e.clientX - last[0];
      view.current.y += e.clientY - last[1];
      last = [e.clientX, e.clientY];
      draw();
    };
    const up = (e) => {
      last = null;
      if (moved) return;
      const rect = canvas.getBoundingClientRect(),
        x = e.clientX - rect.left,
        y = e.clientY - rect.top,
        side = x > rect.width / 2 ? 1 : 0;
      let nearest = 0,
        best = Infinity;
      prepared.positions.forEach((p, i) => {
        const xy = point(p, side, rect.width, rect.height),
          d = Math.hypot(x - xy[0], y - xy[1]);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      const r = side ? right : left;
      onInspect(
        `${prepared.meta.cells[nearest]} · ${r ? "partition " + r.partitions[nearest] : "input cell"}`,
      );
    };
    const key = (e) => {
      if (
        ![
          "+",
          "-",
          "0",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
        ].includes(e.key)
      )
        return;
      e.preventDefault();
      if (e.key === "0") view.current = { zoom: 1, x: 0, y: 0 };
      else if (e.key === "+" || e.key === "-")
        view.current.zoom = Math.max(
          0.7,
          Math.min(12, view.current.zoom * (e.key === "+" ? 1.2 : 1 / 1.2)),
        );
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight")
        view.current.x += e.key === "ArrowLeft" ? -20 : 20;
      else view.current.y += e.key === "ArrowUp" ? -20 : 20;
      draw();
    };
    const events = {
      wheel,
      pointerdown: down,
      pointermove: move,
      pointerup: up,
      pointercancel: () => {
        last = null;
      },
      keydown: key,
    };
    Object.entries(events).forEach(([n, f]) =>
      canvas.addEventListener(n, f, { passive: false }),
    );
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    draw();
    let second;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => callback.current?.(runId));
    });
    return () => {
      observer.disconnect();
      Object.entries(events).forEach(([n, f]) =>
        canvas.removeEventListener(n, f),
      );
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [prepared, left, right, showCuts, runId, onInspect]);
  return (
    <canvas
      ref={ref}
      className="netlist-canvas"
      tabIndex={0}
      aria-label="Netlist comparison. Colors encode partitions. Drag to pan, plus and minus zoom, zero resets."
      role="img"
    />
  );
}
