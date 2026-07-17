// Screenshot + canvas-markering (PLAN.md §7.1, §8.3).
// Viewport-only capture (chrome.tabs.captureVisibleTab), tekenen gebeurt op
// een canvas in de side panel — niet in het content script (§8.3: het
// content script levert alleen rauwe rects, de side panel tekent nadat de
// mens de voorstellen heeft bevestigd/gecorrigeerd).

import type { Marking, Rect } from "../shared/types";

/** Klein, vast kandidaten-palet (§7.1) — kleuren die zelden als hoofdkleur in
 * een zorg-UI voorkomen, onderling goed te onderscheiden. */
const MARKER_COLOR_CANDIDATES = [
  "#e6007e", // magenta
  "#00b0b9", // cyaan
  "#ff8c00", // oranje
  "#7b2ff7", // paars
  "#00c853", // fel groen
] as const;

export async function captureVisibleTab(windowId?: number): Promise<Blob> {
  const dataUrl = await chrome.tabs.captureVisibleTab(
    windowId as number,
    { format: "png" },
  );
  const response = await fetch(dataUrl);
  return response.blob();
}

async function loadImage(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
  );
}

/** Bepaalt de dominante kleur van een screenshot door een grid van pixels te
 * samplen, en kiest daaruit de best contrasterende kandidaat (§7.1: geen
 * bevestigingsstap, de extensie kiest zelf, vastgezet per sessie). */
export async function chooseMarkerColor(screenshot: Blob): Promise<string> {
  const image = await loadImage(screenshot);
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return MARKER_COLOR_CANDIDATES[0];
  ctx.drawImage(image, 0, 0);

  const sampleSize = 20;
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const stepX = Math.max(1, Math.floor(image.width / sampleSize));
  const stepY = Math.max(1, Math.floor(image.height / sampleSize));
  for (let y = 0; y < image.height; y += stepY) {
    for (let x = 0; x < image.width; x += stepX) {
      const idx = (y * image.width + x) * 4;
      r += data[idx];
      g += data[idx + 1];
      b += data[idx + 2];
      count += 1;
    }
  }
  const dominant: [number, number, number] = [r / count, g / count, b / count];

  let best: string = MARKER_COLOR_CANDIDATES[0];
  let bestDistance = -1;
  for (const candidate of MARKER_COLOR_CANDIDATES) {
    const distance = colorDistance(dominant, hexToRgb(candidate));
    if (distance > bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

export interface NumberedMarking extends Marking {
  legendLabel: string;
}

/** Tekent genummerde kaderranden (geen vlakvulling) + volgnummer-badges op
 * een kopie van de screenshot (§7.1: "Visuele markering op het beeld"). */
export async function drawMarkings(
  screenshot: Blob,
  markings: NumberedMarking[],
  color: string,
): Promise<Blob> {
  const image = await loadImage(screenshot);
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kon canvas-context niet aanmaken.");

  ctx.drawImage(image, 0, 0);

  for (const marking of markings) {
    drawRect(ctx, marking.rect, color);
    drawBadge(ctx, marking.rect, marking.sequenceNumber, color);
  }

  return canvas.convertToBlob({ type: "image/png" });
}

function drawRect(ctx: OffscreenCanvasRenderingContext2D, rect: Rect, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

function drawBadge(
  ctx: OffscreenCanvasRenderingContext2D,
  rect: Rect,
  sequenceNumber: number,
  color: string,
) {
  const label = String(sequenceNumber);
  const badgeSize = 20;
  const badgeX = rect.x;
  const badgeY = Math.max(0, rect.y - badgeSize);

  ctx.fillStyle = color;
  ctx.fillRect(badgeX, badgeY, badgeSize, badgeSize);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 1);
}
