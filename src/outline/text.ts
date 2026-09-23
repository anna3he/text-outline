import { parse, type Font, type PathCommand } from "opentype.js";
import { commandsToContours, type OrigContour } from "./geometry";

const MAX_CHARS = 48;

export async function loadTypeface(url: string): Promise<Font> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the typeface (${response.status}).`);
  return parse(await response.arrayBuffer());
}

export function textToContours(font: Font, text: string): OrigContour[] {
  const cleaned = text.replace(/[\r\n\t]+/g, " ").slice(0, MAX_CHARS);
  if (!cleaned.trim()) return [];
  const path = font.getPath(cleaned, 0, 0, font.unitsPerEm);
  return commandsToContours(path.commands as PathCommand[]);
}
