/**
 * mustr.gg-only wordmark decorator.
 *
 * CSS can't target a *word* — only elements — so wherever the word "mustr" appears
 * in page copy we wrap it in <span class="mustr-wm"><span class="mustr-wm-lead">m
 * </span>ustr</span>, and styles.css does the rest (lead letter in the accent
 * colour, the tail in the muted/secondary colour, both following the active theme).
 *
 * Scope + safety: runs ONLY on the mustr.gg host (never in a buyer's install) and
 * only when the admin toggle is on. It skips form fields, code, the rich-text
 * editor, the header brand, and the whole admin shell, so it never rewrites
 * editable text or high-churn React subtrees. It's idempotent (won't re-wrap what
 * it already wrapped) and is re-run on navigation.
 */

export function isMustrHost(): boolean {
  if (typeof location === 'undefined') return false;
  const h = location.hostname.toLowerCase();
  return h === 'mustr.gg' || h.endsWith('.mustr.gg') || h === 'localhost' || h.endsWith('.localhost') || h.startsWith('127.');
}

const SKIP_SELECTOR =
  '.mustr-wm, code, pre, script, style, textarea, input, select, button, a.brand, ' +
  '[contenteditable="true"], .ProseMirror, .no-wordmark, .admin-shell, .usage-bar';

const WORD = /\bmustr\b/gi;

/** Wrap every "mustr" occurrence under `root` (default: the main content + footer). */
export function decorateWordmark(root?: ParentNode): void {
  if (!isMustrHost()) return;
  const scopes: ParentNode[] = root
    ? [root]
    : ([document.querySelector('main'), document.querySelector('.site-footer')].filter(Boolean) as ParentNode[]);

  for (const scope of scopes) {
    const walker = document.createTreeWalker(scope as Node, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = (node as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
        WORD.lastIndex = 0;
        return WORD.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });

    const targets: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) targets.push(n as Text);

    for (const textNode of targets) {
      const text = textNode.nodeValue || '';
      const frag = document.createDocumentFragment();
      let last = 0;
      WORD.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = WORD.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const word = m[0]; // preserve original casing
        const wm = document.createElement('span');
        wm.className = 'mustr-wm';
        const lead = document.createElement('span');
        lead.className = 'mustr-wm-lead';
        lead.textContent = word.slice(0, 1);
        wm.appendChild(lead);
        wm.appendChild(document.createTextNode(word.slice(1)));
        frag.appendChild(wm);
        last = m.index + word.length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      try {
        textNode.parentNode?.replaceChild(frag, textNode);
      } catch {
        /* node moved/removed between walk and mutation — ignore */
      }
    }
  }
}

let cachedEnabled: boolean | null = null;

/** Fetch (once) whether the wordmark is enabled for this install. */
export async function wordmarkEnabled(): Promise<boolean> {
  if (!isMustrHost()) return false;
  if (cachedEnabled !== null) return cachedEnabled;
  try {
    const res = await fetch('/api/settings/wordmark', { credentials: 'same-origin' });
    const body = (await res.json()) as { wordmark?: { enabled?: boolean } };
    cachedEnabled = !!body.wordmark?.enabled;
  } catch {
    cachedEnabled = false;
  }
  return cachedEnabled;
}
