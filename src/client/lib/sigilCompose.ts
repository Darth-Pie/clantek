/**
 * Compose a monogram/emblem mark from a recipe onto a hi-res canvas → a PNG data
 * URL (plus its raw pixels, for particle sampling). Shared by the live animation
 * engine (SigilStage) and the save-time rasterizer, so there's one monogram
 * renderer, not two. Browser-only (uses <canvas>).
 */

import type { SigilRecipe } from '../../shared/sigil';

function starPts(cx: number, cy: number, ro: number, ri: number, n: number): [number, number][] {
  const a: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? ri : ro;
    a.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  return a;
}

function drawEmblem(g: CanvasRenderingContext2D, name: string, color: string, alpha: number): void {
  g.save(); g.globalAlpha = alpha; g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
  const poly = (pts: number[][]) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0]!, p[1]!) : g.moveTo(p[0]!, p[1]!))); g.closePath(); g.fill(); };
  if (name === 'star') poly(starPts(50, 50, 30, 13, 5));
  else if (name === 'swords') { g.translate(50, 50); [45, -45].forEach((deg) => { g.save(); g.rotate((deg * Math.PI) / 180); g.fillRect(-4, -32, 8, 64); g.beginPath(); g.moveTo(-9, 32); g.lineTo(9, 32); g.lineTo(0, 42); g.closePath(); g.fill(); g.restore(); }); }
  else if (name === 'bolt') poly([[56, 14], [30, 54], [46, 54], [40, 86], [72, 44], [54, 44]]);
  else if (name === 'ring') { g.beginPath(); g.arc(50, 50, 28, 0, 7); g.stroke(); g.beginPath(); g.arc(50, 50, 16, 0, 7); g.stroke(); }
  else if (name === 'crown') { g.beginPath(); g.moveTo(22, 66); g.lineTo(18, 34); g.lineTo(34, 50); g.lineTo(50, 26); g.lineTo(66, 50); g.lineTo(82, 34); g.lineTo(78, 66); g.closePath(); g.fill(); g.fillRect(22, 67, 56, 8); }
  else if (name === 'flame') { g.beginPath(); g.moveTo(50, 20); g.bezierCurveTo(66, 40, 64, 54, 57, 64); g.bezierCurveTo(69, 60, 64, 76, 50, 82); g.bezierCurveTo(36, 76, 31, 60, 43, 64); g.bezierCurveTo(36, 54, 34, 40, 50, 20); g.closePath(); g.fill(); }
  else if (name === 'rocket') { g.beginPath(); g.moveTo(50, 20); g.bezierCurveTo(63, 32, 63, 54, 58, 66); g.lineTo(42, 66); g.bezierCurveTo(37, 54, 37, 32, 50, 20); g.closePath(); g.fill(); g.beginPath(); g.moveTo(42, 58); g.lineTo(31, 74); g.lineTo(43, 67); g.closePath(); g.fill(); g.beginPath(); g.moveTo(58, 58); g.lineTo(69, 74); g.lineTo(57, 67); g.closePath(); g.fill(); }
  else if (name === 'gem') { g.beginPath(); g.moveTo(50, 24); g.lineTo(72, 44); g.lineTo(50, 78); g.lineTo(28, 44); g.closePath(); g.fill(); }
  g.restore();
}

export interface ComposedMark { url: string; data: Uint8ClampedArray | null; w: number; h: number }

/** Render the recipe's compose fields to a 600×600 canvas → PNG data URL + pixels. */
export function composeMark(recipe: SigilRecipe): ComposedMark {
  const S = 100, HR = 6;
  const cnv = document.createElement('canvas'); cnv.width = S * HR; cnv.height = S * HR;
  const g = cnv.getContext('2d')!; g.scale(HR, HR); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const col = recipe.accent, ini = (recipe.initials || '').toUpperCase().slice(0, 3);
  const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
  const { frame, emblem, pos } = recipe;
  if (frame !== 'none') {
    g.save(); g.beginPath();
    if (frame === 'circle') g.arc(50, 50, 42, 0, 7);
    else if (frame === 'shield') { g.moveTo(50, 12); g.lineTo(84, 24); g.lineTo(84, 52); g.quadraticCurveTo(84, 78, 50, 92); g.quadraticCurveTo(16, 78, 16, 52); g.lineTo(16, 24); g.closePath(); }
    else if (frame === 'hex') { ([[50, 8], [86, 29], [86, 71], [50, 92], [14, 71], [14, 29]] as number[][]).forEach((p, i) => (i ? g.lineTo(p[0]!, p[1]!) : g.moveTo(p[0]!, p[1]!))); g.closePath(); }
    else if (frame === 'diamond') { g.moveTo(50, 6); g.lineTo(92, 50); g.lineTo(50, 94); g.lineTo(8, 50); g.closePath(); }
    else if (frame === 'rounded') { if (g.roundRect) g.roundRect(12, 12, 76, 76, 16); else g.rect(12, 12, 76, 76); }
    else if (frame === 'banner') { g.moveTo(22, 10); g.lineTo(78, 10); g.lineTo(78, 84); g.lineTo(50, 72); g.lineTo(22, 84); g.closePath(); }
    g.globalAlpha = 0.14; g.fillStyle = col; g.fill(); g.globalAlpha = 1; g.lineWidth = 4.5; g.strokeStyle = col; g.stroke(); g.restore();
  }
  const hasEm = emblem !== 'none', hasIni = !!ini;
  if (hasEm) {
    if (!hasIni || pos === 'behind') drawEmblem(g, emblem, col, hasIni ? 0.5 : 0.95);
    else { g.save(); const ey = pos === 'top' ? 32 : 74; g.translate(50, ey); g.scale(0.46, 0.46); g.translate(-50, -50); drawEmblem(g, emblem, col, 0.95); g.restore(); }
  }
  if (hasIni) {
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const maxW = frame === 'none' ? 94 : 78; let fs = 58; g.font = '800 ' + fs + 'px ' + FONT;
    const tw = g.measureText(ini).width; if (tw > maxW) { fs = Math.max(13, (fs * maxW) / tw); g.font = '800 ' + fs + 'px ' + FONT; }
    const ty = hasEm && pos === 'top' ? 64 : hasEm && pos === 'bottom' ? 40 : 55;
    g.fillText(ini, 50, ty);
  }
  let data: Uint8ClampedArray | null = null;
  try { data = g.getImageData(0, 0, S * HR, S * HR).data; } catch { data = null; }
  return { url: cnv.toDataURL('image/png'), data, w: S * HR, h: S * HR };
}
