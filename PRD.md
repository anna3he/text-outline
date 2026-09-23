# Outline

## Problem

Reshaping a word should feel like editing vectors in Figma: points on the outline, a drag, a new silhouette. The surrounding UI stays out of the way.

## Product

One screen. A word in the middle, a narrow control panel on the side.

The word starts as **Anna He**.

## Interaction

1. Hover the stage. Vector points fade in on the letter outlines.
2. Drag a point. That anchor moves, and the curves on either side follow so the stroke stays smooth.
3. Leave the stage. The points fade out. The edited shape stays.
4. Change the text. The outlines rebuild from the new word and every drag is discarded.
5. Reset points. The current word returns to the typeface, at the current point density.
6. Vector points. A dial from 1 to 8. Fewer points keeps the original anchors. More points samples along each curve. Existing drags are kept as closely as the new sampling allows.
7. Dark mode. A light/dark icon toggle. Light is the default grey system. Dark inverts the field, panel, and letterforms. Points stay blue.

Points are hidden until hover (or the first touch). The point under the pointer fills blue. The others are white with a blue ring, like Figma anchors.

## Controls

The panel is DialKit, inline.

| Control | Behavior |
| --- | --- |
| Text | The word on the stage. Editing it resets drags. |
| Vector points | Density dial, 1–8. |
| Dark mode | Sun / moon toggle. |
| Reset points | Restores the current word’s outlines. |

## Visual system

- Field: `#F3F3F1`
- Panel: white, 1px `#E6E6E3` border, 16px radius
- Letterforms: pale grey, light Inter
- Panel title: Instrument Serif
- Anchors: `#0D99FF`
- Dark field: `#141414`, letterforms `#4A4A4A`

## Out of scope

Export, multi-line text, visible Bézier handles, animation, accounts, and saving.
