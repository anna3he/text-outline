# Outline

A small type editor. The word starts as **Anna He** in Inter Semibold. Hover it to reveal vector points, drag one point, or drag a box around several and move them together.

The panel sits on the right and is only as tall as its controls. [DialKit](https://www.dialkit.dev/) holds the text, a typeface menu (Inter Semibold or LT Superior Semibold), the point-density dial, and reset. A sun/moon icon in the panel’s top-right corner switches light and dark. Changing the text or typeface clears any drags.

The palette is a light grey system — warm off-white field, white panel, pale letterforms — with Figma-blue anchors (`#0D99FF`).

## Run

```bash
npm install
npm run dev
```

The dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Product notes

See [PRD.md](PRD.md) for the interaction spec this screen implements.
