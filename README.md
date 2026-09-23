# Outline

A small type editor. The word starts as **Anna He** in LT Superior Semibold. Hover it to reveal vector points, drag one point, or drag a box around several and move them together.

The panel sits in the bottom-right corner, only as tall as its controls. [DialKit](https://www.dialkit.dev/) holds the text, the typeface menu (LT Superior Semibold, then Inter Semibold), letter spacing, the point-count dial, a grid toggle, export SVG, and reset. Grid size appears only while the grid is on, and the grid covers the whole screen. Scroll or pinch to zoom. Export SVG downloads the outlines cropped to the letters. The point dial only changes how many anchors appear on hover. A sun/moon icon in the panel’s top-right corner switches light and dark. Changing the text, typeface, or letter spacing clears any drags.

The palette is a light grey system — warm off-white field, white panel, pale letterforms — with Figma-blue anchors (`#0D99FF`).

## Run

```bash
npm install
npm run dev
```

The dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Product notes

See [PRD.md](PRD.md) for the interaction spec this screen implements.
