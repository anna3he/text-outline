# Outline

## Problem

Reshaping a word should feel like editing vectors in Figma: points on the outline, a drag, a new silhouette. The surrounding UI stays out of the way.

## Product

One screen. A word centred on the viewport. A compact control panel floats on the right and is only as tall as its contents. The panel does not shift the centre: the same gap is kept on the left, so the letters stay clear of the controls.

The word starts as **Anna He**.

## Interaction

1. Hover the stage. Vector points fade in on the letter outlines.
2. Drag one point, or drag a box across several points and then drag the selection. Selected anchors move together, and the curves on either side stay attached.
3. Leave the stage. The points fade out, unless a selection is still active. The edited shape stays.
4. Change the text, the typeface, or the letter spacing. The outlines rebuild, the word stays centred, and every drag is discarded.
5. Reset points. The current word returns to the typeface. The point count stays where the dial left it.
6. Vector points. A dial from 1 to 8. It only changes how many points appear on hover. It does not move or reshape the letters.
7. Grid. Off by default. Turn it on, then set the cell size with a stepped dial (the number can be typed). Lines pass through the centre of the screen.
8. Copy SVG. Writes the current outlines to the clipboard.
9. Dark mode. A sun/moon icon in the top-right corner of the panel. Light is the default grey system. Dark inverts the field, panel, and letterforms. Points stay blue.

Points are hidden until hover (or the first touch). The point under the pointer fills blue. The others are white with a blue ring, like Figma anchors.

## Controls

The panel is DialKit, inline.

| Control | Behavior |
| --- | --- |
| Text | The word on the stage. Editing it resets drags. |
| Font | Sans · Inter Semibold, or Serif · LT Superior Semibold. Switching resets drags. |
| Letter spacing | Tracking in ems, from −0.2 to 0.6. Changing it resets drags and recentres the word. |
| Vector points | How many points show on hover, 1–8. Does not move the letters. |
| Grid | Shows or hides a centred grid. |
| Grid size | Cell size in pixels, stepped. Type a number to set it exactly. |
| Copy SVG | Copies the current outlines as SVG. |
| Reset points | Restores the current word’s outlines. |
| Theme icon | Top-right of the panel. Sun for light, moon for dark. |

## Visual system

- Field: `#F3F3F1`
- Panel: white, 1px `#E6E6E3` border, 16px radius
- Letterforms: pale grey, Inter Semibold or LT Superior Semibold
- Panel title: Inter Semibold, 20px, “Text Outline”. Body: “Hover to drag points.”
- Anchors: `#0D99FF`
- Dark field: `#141414`, letterforms `#4A4A4A`

## Out of scope

Multi-line text, visible Bézier handles, animation, accounts, and saving. Copy SVG is the export.
