import { parse, type Font, type PathCommand } from "opentype.js";
import { commandsToContours, type OrigContour } from "./geometry";

const MAX_CHARS = 48;

export async function loadTypeface(url: string): Promise<Font> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the typeface (${response.status}).`);
  return parse(await response.arrayBuffer());
}

export function textToContours(font: Font, text: string, tracking = 0): OrigContour[] {
  const cleaned = text.replace(/[\r\n\t]+/g, " ").slice(0, MAX_CHARS);
  if (!cleaned.trim()) return [];
  const size = font.unitsPerEm;
  const extra = tracking * size;
  const glyphs = font.stringToGlyphs(cleaned);
  const commands: PathCommand[] = [];
  let x = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    if (!glyph) continue;
    const path = glyph.getPath(x, 0, size);
    commands.push(...(path.commands as PathCommand[]));
    const next = glyphs[i + 1];
    if (!next) continue;
    x += (glyph.advanceWidth ?? 0) + font.getKerningValue(glyph, next) + extra;
  }
  return commandsToContours(commands);
}
