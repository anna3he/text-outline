# Outline

A small type editor. The word starts as **Anna He** in Inter Semibold. Hover it to reveal vector points, drag one point, or drag a box around several and move them together.

The word is centred in the canvas. The panel sits at the bottom on every screen size, only as tall as its controls. [DialKit](https://www.dialkit.dev/) holds the text, a typeface menu (Inter Semibold or LT Superior Semibold), letter spacing, the point-count dial, a grid toggle, copy SVG, and reset. Grid size appears only while the grid is on. Scroll or pinch to zoom, then press **Fit to screen** to centre the word again. The point dial only changes how many anchors appear on hover. A sun/moon icon in the panel’s top-right corner switches light and dark. Changing the text, typeface, or letter spacing clears any drags.

The palette is a light grey system — warm off-white field, white panel, pale letterforms — with Figma-blue anchors (`#0D99FF`).

## Run

```bash
npm install
npm run dev
```

The dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Product notes

See [PRD.md](PRD.md) for the interaction spec this screen implements.
