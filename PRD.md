# Outline

## Problem

Reshaping a word should feel like editing vectors in Figma: points on the outline, a drag, a new silhouette. The surrounding UI stays out of the way.

## Product

One screen. A word centred on the viewport. A compact control panel sits in the bottom-right corner, only as tall as its contents. A chevron hides the panel, leaving a small button to bring it back.

The word starts as **Anna He**.

## Interaction

1. Hover the stage. Vector points fade in on the letter outlines.
2. Drag one point, or drag a box across several points and then drag the selection. Selected anchors move together, and the curves on either side stay attached.
3. Leave the stage. The points fade out, unless a selection is still active. The edited shape stays.
4. Change the text, the typeface, or the letter spacing. The outlines rebuild, the word stays centred, and every drag is discarded.
5. Reset points. The current word returns to the typeface. The point count stays where the dial left it.
6. Vector points. A dial from 1 to 8. 1 is sparse. 8 is the old minimum: every anchor on the typeface, and no denser. The dial only changes how many points appear on hover. It does not move or reshape the letters.
7. Grid. Off by default. Turn it on and a stepped cell-size dial appears, plus a snap toggle. Turn it off and both hide. The grid covers the whole screen, behind the panel, and zooms with the canvas. With snap on, the nearer edge of the selection lands on a grid line. The centre of the selection is not what snaps. The rest of the selection keeps its shape.
8. Zoom and pan. A mouse wheel or a pinch zooms. A trackpad swipe, a middle-mouse drag, or the arrow keys move the canvas. **Fit to screen** clears the zoom and pan and places the word in the middle of the current viewport.
9. Hide panel. The chevron beside the theme icon removes the card. A small button in the same corner shows it again.
10. Export SVG. Downloads the current outlines, cropped to the letterforms.
11. Dark mode. A sun/moon icon in the top-right of the panel. Light is the default grey system. Dark inverts the field, panel, and letterforms. Points stay blue.

The typeface starts as Serif · LT Superior. Sans · Inter is the second menu option.

Points are hidden until hover (or the first touch). The point under the pointer fills blue. The others are white with a blue ring, like Figma anchors.

## Controls

The panel is DialKit, inline.

| Control | Behavior |
| --- | --- |
| Text | The word on the stage. Editing it resets drags. |
| Font | Serif · LT Superior Semibold by default. Sans · Inter Semibold is the other option. Switching resets drags. |
| Letter spacing | Tracking in ems, from −0.2 to 0.6. Changing it resets drags and recentres the word. |
| Vector points | 1 is the fewest points. 8 shows every typeface anchor, which used to be the minimum. Does not move the letters. |
| Grid | Shows or hides a grid across the whole screen. |
| Grid size | Visible only while the grid is on. Cell size in pixels, stepped. |
| Snap | Visible only while the grid is on. Off by default. The nearer edge of a drag lands on a grid line. |
| Export SVG | Downloads an SVG fitted to the current outlines. |
| Reset points | Restores the current word’s outlines. |
| Fit to screen | Centres the word in the current window. |
| Theme icon | Top-right of the panel. Sun for light, moon for dark. |
| Chevron | Hides the panel. A corner button shows it again. |

## Visual system

- Field: `#F3F3F1`
- Panel: white, 1px `#E6E6E3` border, 16px radius
- Letterforms: pale grey, Inter Semibold or LT Superior Semibold
- Panel title: Inter Medium, 16px, “Text Outline”. Body: “Hover to drag points.”
- Anchors: `#0D99FF`
- Dark field: `#141414`, letterforms `#4A4A4A`

## Out of scope

Multi-line text, visible Bézier handles, animation, accounts, and saving. Export SVG is the file output.
