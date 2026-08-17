/**
 * SigilMark — plays an org's mark image alive: particles gather / a network
 * forms / it materialises / it wipes in, then the real logo settles. The
 * animation geometry is sampled from the image's own pixels, so it works on any
 * mark. This is the in-app engine port of the "Sigil Forge" prototype (a bounded
 * subset of styles for the boot splash; the full studio comes later).
 *
 * Self-contained: builds/animates SVG imperatively in a useEffect and cancels
 * every timer/frame on cleanup (StrictMode-safe). Falls back to a simple fade if
 * the image can't be pixel-sampled (e.g. a cross-origin URL that taints canvas).
 */

import { useEffect, useRef } from 'react';
import type { BrandmarkArchetype } from '../../shared/brandmark';

const NS = 'http://www.w3.org/2000/svg';

interface Props {
  src: string;
  archetype: BrandmarkArchetype;
  speed?: number;
  density?: number;
  /** Hex; blank/omitted uses the live theme accent. */
  accent?: string;
  /** Change this number to replay the animation. */
  playKey?: number;
  onDone?: () => void;
  className?: string;
}

interface Node { x: number; y: number; sx: number; sy: number; el: SVGCircleElement; }

export default function SigilMark({ src, archetype, speed = 1, density = 140, accent, playKey = 0, onDone, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const linksG = root.querySelector('.sm-links') as SVGGElement;
    const nodesG = root.querySelector('.sm-nodes') as SVGGElement;
    const img = root.querySelector('.sm-img') as SVGImageElement;

    const themeAccent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
    const color = (accent && accent.trim()) || themeAccent || '#8b5cf6';
    const s = 1 / (speed || 1);
    let timers: number[] = [];
    let raf = 0;
    let dead = false;
    const T = (fn: () => void, ms: number) => { const id = window.setTimeout(fn, ms); timers.push(id); return id; };
    const cleanup = () => { dead = true; timers.forEach((t) => clearTimeout(t)); if (raf) cancelAnimationFrame(raf); };

    // reset
    nodesG.innerHTML = ''; linksG.innerHTML = '';
    img.style.transition = 'none'; img.style.opacity = '0'; img.style.clipPath = ''; img.style.transform = '';
    root.classList.remove('sm-lit');
    if (!src) return cleanup;
    img.setAttribute('href', src);
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);

    const done = () => { if (!dead && onDone) onDone(); };
    const reveal = () => {
      if (dead) return;
      root.classList.add('sm-lit');
      img.style.transition = `opacity ${0.6 * s}s ease`;
      img.style.opacity = '1';
      T(done, 700 * s);
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { img.style.opacity = '1'; root.classList.add('sm-lit'); T(done, 300); return cleanup; }

    // Wipe reveals the image directly via an animated CSS clip — no pixel sampling.
    if (archetype === 'wipe') {
      img.style.opacity = '1'; img.style.clipPath = 'inset(0 100% 0 0)';
      requestAnimationFrame(() => { if (dead) return; img.style.transition = `clip-path ${1.0 * s}s ease`; img.style.clipPath = 'inset(0 0 0 0)'; });
      root.classList.add('sm-lit');
      T(done, 1150 * s);
      return cleanup;
    }

    const circle = (x: number, y: number, r: number): SVGCircleElement => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', String(r)); c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y));
      c.setAttribute('fill', color); c.setAttribute('opacity', '0');
      c.style.filter = `drop-shadow(0 0 1.1px ${color})`;
      return c;
    };
    const fadeNodes = (nodes: Node[]) => T(() => nodes.forEach((n) => { n.el.style.transition = 'opacity .6s'; n.el.setAttribute('opacity', '0'); }), 220 * s);

    // Load the image, sample opaque pixels for particle targets (centred in a 0..100 box).
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (dead) return;
      let pts: { x: number; y: number }[] = [];
      try {
        const MAX = 200, k = MAX / Math.max(image.width, image.height);
        const cw = Math.max(1, Math.round(image.width * k)), ch = Math.max(1, Math.round(image.height * k));
        const cnv = document.createElement('canvas'); cnv.width = cw; cnv.height = ch;
        const cx = cnv.getContext('2d')!; cx.drawImage(image, 0, 0, cw, ch);
        const d = cx.getImageData(0, 0, cw, ch).data;
        const scale = Math.min(100 / cw, 100 / ch), ox = (100 - cw * scale) / 2, oy = (100 - ch * scale) / 2;
        const want = density, MAXTRIES = want * 80;
        for (let tries = 0; pts.length < want && tries < MAXTRIES; tries++) {
          const px = (Math.random() * cw) | 0, py = (Math.random() * ch) | 0;
          if ((d[(py * cw + px) * 4 + 3] ?? 0) > 70) pts.push({ x: ox + px * scale, y: oy + py * scale });
        }
      } catch { pts = []; }
      if (!pts.length) { reveal(); return; } // tainted/failed sampling → just fade the logo in

      const nodes: Node[] = pts.map((p) => {
        const sx = Math.random() * 100, sy = Math.random() * 100;
        const el = circle(sx, sy, archetype === 'constellation' ? 1.0 : 0.8);
        nodesG.appendChild(el);
        return { x: p.x, y: p.y, sx, sy, el };
      });
      nodes.forEach((n, i) => T(() => { n.el.style.transition = 'opacity .4s'; n.el.setAttribute('opacity', '0.85'); }, Math.min(500, i * 4) * s));

      if (archetype === 'dissolve') {
        nodes.forEach((n) => { n.el.setAttribute('cx', String(n.x)); n.el.setAttribute('cy', String(n.y)); T(() => { n.el.style.transition = 'opacity .3s'; n.el.setAttribute('opacity', (0.3 + Math.random() * 0.6).toFixed(2)); }, Math.random() * 720 * s); });
        T(() => { reveal(); fadeNodes(nodes); }, 1000 * s);
        return;
      }

      // assemble + constellation: scatter → gather
      let t0 = 0; const dur = 1100 * s;
      const travel = (ts: number) => {
        if (dead) return;
        if (!t0) t0 = ts;
        const t = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - t, 3);
        nodes.forEach((n) => { n.el.setAttribute('cx', String(n.sx + (n.x - n.sx) * e)); n.el.setAttribute('cy', String(n.sy + (n.y - n.sy) * e)); });
        if (t < 1) raf = requestAnimationFrame(travel); else settle();
      };
      const settle = () => {
        if (dead) return;
        if (archetype === 'constellation') {
          nodes.forEach((n) => n.el.setAttribute('r', '1.1'));
          for (let i = 0; i < nodes.length; i++) {
            const a = nodes[i]!;
            let bd = 1e9, q: Node | null = null;
            for (let j = 0; j < nodes.length; j++) { if (j === i) continue; const nb = nodes[j]!; const dx = nb.x - a.x, dy = nb.y - a.y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; q = nb; } }
            if (q) { const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', String(a.x)); l.setAttribute('y1', String(a.y)); l.setAttribute('x2', String(q.x)); l.setAttribute('y2', String(q.y)); l.setAttribute('stroke', color); l.setAttribute('stroke-width', '0.4'); l.setAttribute('stroke-opacity', '0.5'); linksG.appendChild(l); }
          }
          T(() => { reveal(); fadeNodes(nodes); }, 260 * s);
        } else {
          reveal(); fadeNodes(nodes);
        }
      };
      T(() => { t0 = 0; raf = requestAnimationFrame(travel); }, 500 * s);
    };
    image.onerror = () => { if (!dead) reveal(); };
    image.src = src;

    return cleanup;
  }, [src, archetype, speed, density, accent, playKey, onDone]);

  return (
    <div className={`sigilmark${className ? ' ' + className : ''}`} ref={rootRef}>
      <svg className="sm-stage" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g className="sm-links" />
        <g className="sm-nodes" />
        <image className="sm-img" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
      </svg>
    </div>
  );
}
