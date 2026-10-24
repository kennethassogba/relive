import React, { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  syntaxHighlighting,
  HighlightStyle,
  bracketMatching,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { Save, RefreshCw, Check } from "lucide-react";
import { api } from "./api";

export function CodeDock({ project, onError, onSaved, refreshKey }) {
  const host = useRef(),
    editor = useRef(),
    file = useRef(),
    saveRef = useRef();
  const [path, setPath] = useState(""),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false);
  const theme = EditorView.theme({
    "&": { height: "100%", fontSize: "13px", backgroundColor: "#fff" },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
      lineHeight: "1.7",
    },
    ".cm-content": { padding: "12px 0" },
    ".cm-line": { padding: "0 20px" },
    ".cm-gutters": {
      backgroundColor: "#fff",
      border: "none",
      color: "#727782",
      padding: "0 8px",
    },
    ".cm-activeLine": { backgroundColor: "#f5f8fd" },
    ".cm-activeLineGutter": { backgroundColor: "#fff" },
    "&.cm-focused": { outline: "none" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#dce9ff",
    },
    ".cm-cursor": { borderLeftColor: "#245fca" },
  });
  async function load() {
    try {
      const f = await api("source/" + project);
      file.current = f;
      setPath(f.path);
      setDirty(false);
      setSaved(false);
      editor.current?.dispatch({
        changes: {
          from: 0,
          to: editor.current.state.doc.length,
          insert: f.source,
        },
      });
      setDirty(false);
    } catch (e) {
      onError(e.message);
    }
  }
  async function save() {
    if (!file.current || !editor.current) return;
    setSaving(true);
    try {
      const source = editor.current.state.doc.toString();
      const r = await api("save", {
        project,
        source,
        base_sha256: file.current.sha256,
      });
      file.current = { ...file.current, sha256: r.sha256, source };
      setDirty(false);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;
  useEffect(() => {
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: "",
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          syntaxHighlighting(
            HighlightStyle.define([
              { tag: tags.keyword, color: "#7a3fb0" },
              { tag: [tags.string, tags.number], color: "#a14725" },
              { tag: tags.comment, color: "#667080" },
              { tag: tags.typeName, color: "#245fca" },
              { tag: tags.function(tags.variableName), color: "#315f8c" },
            ]),
          ),
          theme,
          project === "mesh-rust" ? rust() : cpp(),
          EditorView.contentAttributes.of({
            "aria-label": "Native algorithm source",
          }),
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                saveRef.current();
                return true;
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setDirty(update.state.doc.toString() !== file.current?.source);
              setSaved(false);
            }
          }),
        ],
      }),
    });
    editor.current = view;
    load();
    return () => {
      view.destroy();
      editor.current = null;
    };
  }, [project]);
  useEffect(() => {
    if (editor.current && !dirty) load();
  }, [refreshKey]);
  return (
    <div className="source-dock">
      <div className="source-tools">
        <code>{path || "Loading source…"}</code>
        <span className="source-state">
          {dirty ? "Unsaved changes" : saved ? "Saved to disk" : "Working file"}
        </span>
        <button
          className="icon-button"
          onClick={load}
          aria-label="Reload source from disk"
          title="Reload from disk"
        >
          <RefreshCw size={15} />
        </button>
        <button className="save-button" disabled={saving} onClick={save}>
          {saved ? <Check size={14} /> : <Save size={14} />}Save & run{" "}
          <kbd>Ctrl S</kbd>
        </button>
      </div>
      <div className="code-editor" ref={host} />
    </div>
  );
}
