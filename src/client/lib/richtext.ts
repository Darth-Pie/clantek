/**
 * Sanitization for news post HTML.
 *
 * Posts are authored in a WYSIWYG editor (TipTap) that emits HTML, and that
 * HTML is stored in news.body. Stored markup is NEVER trusted: it's sanitized
 * here both before it's saved and again every time it's rendered, so a payload
 * that somehow reached the database (e.g. a hand-crafted API call) still can't
 * execute when displayed.
 *
 * The allow-list matches what the editor can actually produce — nothing more.
 */

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3',
  'strong', 'b', 'em', 'i', 's', 'u', 'code', 'pre',
  'blockquote',
  'ul', 'ol', 'li',
  'a',
];

const ALLOWED_ATTR = ['href', 'target', 'rel'];

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Only http(s) and mailto links; blocks javascript: and data: URIs.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });
}

/**
 * A plain-text snippet for feed cards when a post has no explicit excerpt.
 * Strips all markup and collapses whitespace, then truncates on a word boundary.
 */
export function excerptFromHtml(html: string, max = 180): string {
  const text = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, text.lastIndexOf(' ', max)).trimEnd() + '…';
}
