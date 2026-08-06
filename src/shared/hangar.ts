/**
 * Star Citizen hangar — the shared model for the SC module.
 *
 * A member imports their hangar from the RSI website (a private, login-only
 * page with no official API) via a bookmarklet that scrapes the fully-loaded
 * item list and copies it to the clipboard; they paste it into their profile.
 * This file is the one authority on the item shape, the category filters, and
 * the sanitiser applied on the way in — so a hand-edited or malformed paste can
 * never reach storage or the renderer unchecked.
 */

export interface HangarItem {
  id: string;
  name: string;
  /** RSI's own item type slug: ship, skin, equipment, loot, pledge, coupon, component, decoration. */
  type: string;
  value: string;
  currency: string;
  availability: string;
  created: string;
  /** RSI media URL — absolute https, or a same-origin "/media/…" path. */
  image: string;
}

export interface HangarCategory {
  key: string;
  label: string;
  test: (i: HangarItem) => boolean;
}

/**
 * The filter buttons, mirroring RSI's own hangar categories. `type` is reliable
 * for the broad buckets (ships/paints/equipment). RSI does NOT expose the finer
 * Standalone/Game/Combo split per item — it's a server-side filter there — so
 * those key off the pledge-name prefix RSI usually applies (see the SC memory).
 */
export const HANGAR_CATEGORIES: HangarCategory[] = [
  { key: 'all', label: 'All items', test: () => true },
  { key: 'allships', label: 'All ships', test: (i) => i.type === 'ship' },
  { key: 'standalone', label: 'Standalone ships', test: (i) => i.type === 'ship' && /standalone ship/i.test(i.name) },
  { key: 'game', label: 'Game packages', test: (i) => i.type === 'ship' && /\b(package|starter|game package)\b/i.test(i.name) },
  { key: 'combo', label: 'Combo packs', test: (i) => i.type === 'ship' && /combo/i.test(i.name) },
  { key: 'paints', label: 'Paints', test: (i) => i.type === 'skin' },
];

/**
 * Item types we never surface. RSI's hangar is mostly noise for a showcase —
 * store credits, ship equipment, loot, hull components, decorations and coupons
 * clutter the view — so we keep only the interesting pledges (ships, paints,
 * packages, and anything not on this list). Kept here so the filter is one
 * authority the view can trust.
 */
export const HANGAR_HIDDEN_TYPES = new Set(['coupon', 'decoration', 'equipment', 'loot', 'component']);

/** Whether an item is one we display (not a hidden RSI clutter type). */
export function isDisplayableHangarItem(i: HangarItem): boolean {
  return !HANGAR_HIDDEN_TYPES.has((i.type || '').toLowerCase());
}

/** A hangar reduced to the items worth showing (drops the hidden types). */
export function visibleHangarItems(items: HangarItem[]): HangarItem[] {
  return items.filter(isDisplayableHangarItem);
}

const RSI_ORIGIN = 'https://robertsspaceindustries.com';

/** Absolute, safe image URL for an item, or '' if it isn't http(s)/same-origin. */
export function hangarImageUrl(i: HangarItem): string {
  const s = i.image || '';
  if (s.startsWith('/') && !s.startsWith('//')) return RSI_ORIGIN + s;
  return /^https?:\/\//i.test(s) ? s : '';
}

/** Numeric value for sorting — strips $, thousands commas and " USD". */
export function hangarValueNum(i: HangarItem): number {
  const n = parseFloat(String(i.value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : -1;
}

const MAX_ITEMS = 3000;
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * Structurally sanitise an untrusted hangar paste into storable items. Every
 * field is coerced to a bounded string; images are kept only when http(s) or a
 * same-origin "/media/…" path (so a stored image URL can't smuggle a
 * javascript:/data: payload into an <img src>). The noisy `nameableShips` field
 * from the scrape is intentionally dropped.
 */
export function sanitizeHangar(raw: unknown): HangarItem[] {
  const arr = Array.isArray(raw) ? raw : [];
  const items: HangarItem[] = [];
  for (const r of arr.slice(0, MAX_ITEMS)) {
    const o = (r ?? {}) as Record<string, unknown>;
    const image = str(o.image, 400);
    const safeImage = (image.startsWith('/') && !image.startsWith('//')) || /^https?:\/\//i.test(image) ? image : '';
    items.push({
      id: str(o.id, 40),
      name: str(o.name, 200),
      type: str(o.type, 40),
      value: str(o.value, 40),
      currency: str(o.currency, 40),
      availability: str(o.availability, 60),
      created: str(o.created, 40),
      image: safeImage,
    });
  }
  return items;
}

/**
 * The bookmarklet a member runs on their RSI hangar. It scrapes the whole item
 * list and copies it to the clipboard. Kept here (String.raw so the regex
 * backslashes survive) so the profile import UI can show it verbatim.
 */
export const SC_HANGAR_BOOKMARKLET = String.raw`javascript:(()=>{const q=(e,s)=>e.querySelector(s),v=(e,s)=>{const n=q(e,s);return n?n.value:null},pj=(e,s)=>{const n=q(e,s);if(!n)return null;try{return JSON.parse((n.textContent||'').trim())}catch(_){return null}},bg=e=>{const n=q(e,'.image'),m=n&&((n.getAttribute('style')||'').match(/url\(['"]?([^'")]+)/));return m?m[1]:null},cr=e=>{const m=(e.innerText||'').match(/Created:\s*([A-Za-z0-9, ]+)/);return m?m[1].trim():null};const items=[...document.querySelectorAll('ul.list-items.js-inventory > li')].map(li=>{const t=(q(li,'h3')?.textContent||'').replace(/\s+/g,' ').trim();return{id:v(li,'.js-pledge-id'),name:v(li,'.js-pledge-name'),type:t.includes(' - ')?t.split(' - ')[0].trim():null,value:v(li,'.js-pledge-value'),currency:v(li,'.js-pledge-currency'),availability:(q(li,'.availability')?.textContent||'').trim()||null,created:cr(li),image:bg(li)}});if(!items.length){alert('No hangar items found. Open your RSI hangar (robertsspaceindustries.com/en/account/pledges), let it load, then click again.');return;}navigator.clipboard.writeText(JSON.stringify(items)).then(()=>alert('Copied '+items.length+' hangar items. Paste them into your profile on the site.'),()=>{const ta=document.createElement('textarea');ta.value=JSON.stringify(items);document.body.appendChild(ta);ta.select();alert('Auto-copy was blocked — select-all + copy the box that appeared, then paste into the site.')});})();`;
