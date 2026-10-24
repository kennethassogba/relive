---
name: Relive
description: A light workbench for comparing native C++ and Rust experiments.
colors:
  accent: "#245fca"
  accent-hover: "#194eac"
  selection: "#edf3ff"
  white: "#ffffff"
  foreground: "#22262b"
  muted: "#626872"
  line: "#e5e7eb"
  control-border: "#d8dce2"
  hover: "#f1f3f6"
  source-surface: "#fafbfc"
  active-line: "#f5f8fd"
  error: "#a13d2c"
  error-surface: "#fff7f4"
  error-text: "#9b3525"
  mesh: "#9faec3"
  input-cell: "#98a5b7"
  error-low: "#3279d8"
  error-high: "#f07636"
  partition-0: "#3478e5"
  partition-1: "#e88b43"
  partition-2: "#9b70d4"
  partition-3: "#df6d95"
  partition-4: "#5eafd5"
  partition-5: "#ac743e"
  partition-6: "#355290"
  partition-7: "#dd4b4b"
typography:
  title:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 500
  brand:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-0.5px"
  body:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  panel-heading:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  control:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "13px"
    lineHeight: "1.7"
rounded:
  seam: "0px"
  control: "4px"
  dialog: "6px"
spacing:
  compact: "4px"
  small: "8px"
  medium: "12px"
  panel: "16px"
  large: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
  button-pressed:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.accent}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "6px 8px"
  navigation:
    textColor: "{colors.muted}"
    rounded: "{rounded.seam}"
    padding: "0 12px"
  history-row:
    backgroundColor: "{colors.selection}"
    rounded: "{rounded.control}"
  view-tag:
    textColor: "#525b69"
    rounded: "{rounded.control}"
    size: "24px"
  source-toolbar:
    backgroundColor: "{colors.source-surface}"
    height: "40px"
    padding: "0 12px"
---

# Design System: Relive

## Overview

**Creative North Star: "The specimen bench"**

The specimen bench is a light native workbench: the actual output occupies the center, experiment history sits on the left, and the selected result is explained on the right. Code, timings and compiler diagnostics share a lower dock. This direction was implemented under the user's delegated brief; it is not recorded as an approved visual comp.

White surfaces, compact sans-serif labels and straight panel seams keep attention on the data. Color marks actions, selection and measured output. Native meshes and netlists are the imagery; promotional illustration and ornamental cards have no role here.

**Key Characteristics:**
- A/B output remains central and registered.
- History, inspector and code occupy stable work areas.
- White surfaces and blue interaction states; no green or lime.
- Rendering responds to data, resize and interaction rather than a continuous animation loop.

This record is extracted from `web/src/style.css`, `main.jsx`, `CodeDock.jsx`, `Viewport.jsx`, `Experiments.jsx`, `Inspector.jsx` and `useWorkspace.js`. The earlier directional draft is reconciled here with the implementation. Existing review captures are under `.impeccable/review/`: desktop, mobile, code, netlist, mobile-320 and user-2407. Their presence is evidence of recorded views, not user approval. This documentation pass does not rerun browser, build or native runtime checks.

## Colors

Blue provides the interaction accent against white surfaces and dark text. The frontmatter is the normative color record.

### Primary

- **Action blue:** primary Run button, focus outlines, selected controls, B values and links.
- **Selection blue:** pale selection background for history rows and pressed view controls.

### Secondary

- **Data colors:** the eight partition tokens distinguish netlist partitions; they repeat in the legend. The mesh token gives both specimens the same matte material. Input cells use a separate neutral blue-gray.
- **Error scale:** blue to orange maps mesh error against a shared input-diagonal scale. It is quantitative, not decorative.
- **Failure red:** error count and offline indicator; the error banner adds a pale red surface and darker red text. Failures also have text.

### Neutral

- **White:** page, panels, both canvases and editor.
- **Foreground / muted:** primary labels versus explanatory text and metadata.
- **Line / control border:** panel seams versus field boundaries.
- **Hover / source surface / active line:** restrained local state changes, not a page wash.

**The Registered Comparison Rule.** A and B share geometry framing, lighting and camera or pan/zoom transform. Mesh error uses the same range from zero to one percent of the input bounding-box diagonal.

## Typography

Inter is locally imported at weights 400, 500 and 600, with Arial and sans-serif fallbacks. Code uses the platform monospace stack. Paths and input identities also use monospace; metrics use tabular numbers.

The title role is used in the branch dialog. The brand role is confined to the command bar. Body text, compact controls, panel headings and secondary labels follow the frontmatter roles. Main command-bar context is body-sized at weight 500. Explanatory copy uses line-height 1.6; the editor uses its separate code line-height.

There is no display typography. Existing isolated 11px mobile status/source labels and shortcut/error badges are implementation exceptions, not a new reusable text role.

## Layout

The shell fills `100dvh`, has a 460px minimum height and clips overflow. Desktop uses a 52px command bar, 43px example bar, flexible workspace and at least 29px status bar. The center can shrink independently of the side panels. History is 218px and the inspector 280px by default; each scrolls independently as needed. Panel boundaries are straight one-pixel seams.

At 1600px and above, history/inspector widths become 240/300px. At 1200px and below they become 190/250px and secondary canvas/header details disappear. Below 1000px, history and inspector become 260/280px overlay panels with a scrim. Opening one closes the other; Escape and the scrim dismiss them.

At 600px and below, the command bar is 54px and the example bar is 46px. Buttons have minimum 44px dimensions, icon buttons are 44px wide, and fields/selects have a 44px minimum height. Dense secondary metadata is hidden. A/B remain side by side. Layout spacing uses the recorded compact scale alongside component-specific gaps.

The dock starts collapsed at 41px (46px on mobile). Open, it uses 34vh with a 190px minimum and 48% maximum; mobile uses 38vh and a 50% maximum. Code stays mounted behind the collapsed or inactive dock, preserving editor state. The source toolbar is 46px on mobile. The native language selector remains in the dock toolbar.

## Elevation & Depth

Working surfaces are flat and separated by borders. Elevation appears only where a panel or dialog overlays the workspace. Mobile side panels use `0 8px 30px #10182818`; the centered branch dialog uses `0 12px 60px #10182825`. Scrims use translucent dark ink. These exact extension tokens live in `.impeccable/design.json`.

**The Flat Work Surface Rule.** Do not add shadows around the canvas, metrics table, editor or history rows. Reserve depth for overlays.

## Shapes

Controls, selected history rows and A/B labels use the control radius. The branch dialog uses the dialog radius. Navigation and panel seams are square. There is no card grid. Small circular status marks and the compact error count are state indicators, not a general container style.

## Components

### Buttons and fields

Run is the filled blue primary action; toolbar controls are transparent and acquire a neutral hover background. Pressed visualization toggles use selection blue and `aria-pressed`. Disabled controls use opacity 0.45. Base desktop controls are at least 32px high; the mobile rule overrides them to 44px. Inputs have a visible border, white fill and explicit labels.

Focus-visible controls use a two-pixel accent outline inset by two pixels. Lucide and inline SVG supply icons; icon-only actions have accessible labels. Reduced-motion mode disables animation and smooth scrolling; the working spinner otherwise rotates once per second.

### Navigation and history

Example navigation and Radix dock tabs use an accent underline for the active view. History rows show branch name, source hash and timing or failure text. A separate A button pins a compatible prepared-input result as reference. It appears on hover/focus on desktop and remains visible below 1000px. The history panel includes an explicit return to latest action.

### A/B canvas

Both views are drawn in one shared rendering surface. Meshes share a perspective camera and lighting; the netlist shares pan and zoom. Data, view options, resize and input events trigger rendering. Pixel ratio is capped at two. There is no continuous animation loop.

Canvas keyboard controls support arrow keys, plus/minus and zero reset. The focusable canvases expose descriptive names. A/B labels, a partition legend or error scale, and the inspector's real table supplement the visual output. The table uses row and column headers. The mesh WebGL fallback explains that metrics and exports remain available.

### Inspector

Flat sections expose comparison metrics, parameters, prepared-input identity and selected-experiment actions. Numeric values align right; labels align left. Parameter fields have visible labels. A and B columns retain their identity without relying on color alone.

### Code and diagnostics

CodeMirror provides C++/Rust syntax, line numbers, active-line highlighting, selection, undo history, bracket matching and a labeled editing area. The source toolbar says **Working file**, **Unsaved changes** or **Saved to disk**. It names the working path independently of the selected historical result. Save checks the base source hash; save errors go to the console. Saving clears historical selection so the new run can become visible. Ctrl/Cmd+S saves from the editor; Ctrl/Cmd+Enter runs from the workbench.

Build failures retain the last valid output and expose an alert with a console action. The status region reports runtime phase or reconnection. Timing values are measurements; unavailable values are not replaced with invented numbers.

### Branch dialog

Radix provides dialog behavior with a named title, description, labeled name field and explicit close action. The dialog is centered, limited to 440px, and leaves 16px at either narrow-screen edge.

## Do's and Don'ts

### Do:
- Do preserve the same camera or transform across A/B views and the fixed mesh error scale.
- Do use real native results, source paths, hashes and measured values.
- Do keep controls at least 44px high and 44px wide at the mobile breakpoint; inputs and selects are at least 44px high.
- Do preserve keyboard access, explicit control names and textual errors.
- Do keep the last valid result visible when a build fails.

### Don't:
- Don't introduce green or lime, serif headlines, beige page washes, glossy illustrations or ornamental cards.
- Don't use display headlines, eyebrows or promotional copy inside the workbench.
- Don't use color alone to communicate the current experiment or a failure.
- Don't add a continuous render loop for an otherwise idle view.
- Don't present historical source as the working file or assume saving keeps the historical run selected.
