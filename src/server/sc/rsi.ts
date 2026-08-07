/**
 * RSI citizen-profile fetch + parse, for Star Citizen account verification.
 *
 * Star Citizen has no public API, but each account has a PUBLIC citizen profile
 * at robertsspaceindustries.com/citizens/<handle> that a Cloudflare Worker can
 * fetch server-side (confirmed: HTTP 200, no bot challenge). We read two things:
 *   - the Short Bio text (where a member pastes a one-time verification code)
 *   - the "Main organization" block (SID, name, rank, and whether it's redacted)
 *
 * There is no DOM parser in the Worker, so we regex the stable markers found on
 * the real page. Selectors (verified against a live profile):
 *   bio  : <div class="entry bio"> … <div class="value"> …text… </div>
 *   org  : <div class="main-org … visibility-V">  (V = public, else redacted)
 *          org name = the /orgs/<SID> link text; SID = the link href / SID field;
 *          rank     = the "Organization rank" entry's <strong>.
 * We never store RSI credentials and never log in on the member's behalf.
 */

const RSI_ORIGIN = 'https://robertsspaceindustries.com';
const HANDLE_RE = /^[a-z0-9_-]{1,50}$/i;

export interface CitizenProfile {
  /** Short Bio text, tags stripped and whitespace collapsed ('' if none). */
  bio: string;
  /** Main-org block present AND public (not redacted). */
  orgVisible: boolean;
  /** Parsed org fields — only meaningful when orgVisible. */
  orgSid: string | null;
  orgName: string | null;
  orgRank: string | null;
}

/** RSI handles are letters/numbers/underscore/hyphen — reject anything else. */
export function isValidHandle(h: string): boolean {
  return HANDLE_RE.test(h);
}

/** Fetch a public citizen profile. `ok` is a clean 200; `html` is the body. */
export async function fetchCitizen(
  handle: string,
): Promise<{ ok: boolean; status: number; html: string }> {
  const res = await fetch(`${RSI_ORIGIN}/citizens/${handle}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });
  const html = await res.text();
  return { ok: res.status === 200, status: res.status, html };
}

const stripTags = (s: string): string =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Parse the bio + main-org block out of a citizen-profile HTML page. */
export function parseCitizen(html: string): CitizenProfile {
  // Bio only renders when non-empty; absent → ''.
  const bioM = html.match(/class="entry bio"[\s\S]*?<div class="value">([\s\S]*?)<\/div>/i);
  const bio = bioM ? stripTags(bioM[1]!) : '';

  // main-org carries a visibility-<X> suffix: V = public, anything else redacted.
  const visM = html.match(/class="main-org[^"]*visibility-([A-Za-z])/i);
  const orgVisible = !!visM && visM[1]!.toUpperCase() === 'V';

  let orgSid: string | null = null;
  let orgName: string | null = null;
  let orgRank: string | null = null;
  if (orgVisible) {
    const sidM = html.match(/href="\/orgs\/([A-Za-z0-9]+)"/i);
    orgSid = sidM ? sidM[1]! : null;
    const nameM = html.match(/href="\/orgs\/[A-Za-z0-9]+"[^>]*>([^<]+)<\/a>/i);
    orgName = nameM ? nameM[1]!.trim() : null;
    const rankM = html.match(/Organization rank<\/span>\s*<strong[^>]*>([^<]+)<\/strong>/i);
    orgRank = rankM ? rankM[1]!.trim() : null;
  }

  return { bio, orgVisible, orgSid, orgName, orgRank };
}
