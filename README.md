# Outline

A small type editor. The word starts as **Anna He** in LT Superior Semibold. Hover it to reveal vector points, drag one point, or drag a box around several and move them together.

The panel sits in the bottom-right corner, only as tall as its controls. A chevron hides it, and a small button in that corner brings it back. [DialKit](https://www.dialkit.dev/) holds the text, the typeface menu (LT Superior Semibold, then Inter Semibold), letter spacing, the point-count dial, a grid toggle, export SVG, and reset. Grid size and snap appear only while the grid is on. Snap pulls a drag onto the nearest grid intersection. The grid covers the whole screen. Scroll or pinch to zoom, then press **Fit to screen** to place the word in the middle of the window. The point dial starts sparse: 1 is the fewest anchors, and 8 is every anchor on the typeface. Export SVG downloads the outlines cropped to the letters. The point dial only changes how many anchors appear on hover. A sun/moon icon in the panel’s top-right switches light and dark. The title is Inter Medium at 16px. Changing the text, typeface, or letter spacing clears any drags.

The palette is a light grey system — warm off-white field, white panel, pale letterforms — with Figma-blue anchors (`#0D99FF`).

## Run

```bash
npm install
npm run dev
```

The dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Product notes

See [PRD.md](PRD.md) for the interaction spec this screen implements.
