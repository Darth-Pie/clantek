/**
 * The public "what the mustr bot can and can't do" trust page at /bot.
 *
 * First-party, self-contained HTML. Unlike /product and /setup it is NOT
 * host-gated: it's accurate for every install and is meant to be linkable by a
 * buyer as their Discord app's Privacy Policy URL, so wary members can read
 * exactly what the bot does. The permission list is generated from the single
 * shared source of truth (shared/botPermissions) so it can never drift from the
 * real invite link. Themed from the operator's accent, like the other pages.
 */

import { BOT_PERMISSIONS } from '../../shared/botPermissions';

export function botTrustHtml(accent = '#a56bf0'): string {
  const permRows = BOT_PERMISSIONS.map(
    (p) => `<tr><td><b>${p.name}</b></td><td>${p.why}</td></tr>`,
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>mustr — what the bot can &amp; can't do</title>
<meta name="description" content="Exactly what the mustr Discord bot can and can't do: a short, least-privilege permission list, why it can never read your messages, and where your data lives." />
<style>
  :root{
    --bg:#0b0e14; --panel:#121722; --panel2:#0f1420; --text:#e6e9ef; --muted:#9aa4b2;
    --border:#232b3a; --accent:${accent}; --accent2:color-mix(in srgb, ${accent} 72%, #000); --good:#22c55e; --bad:#ef4444; --radius:14px; --hero-accent:${accent};
  }
  @media (prefers-color-scheme: light){
    :root{ --bg:#f6f8fc; --panel:#ffffff; --panel2:#f0f3f9; --text:#12161f; --muted:#5a6473; --border:#e2e8f2; }
  }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--text);
    font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
  a{ color:var(--accent); }
  .wrap{ max-width:820px; margin:0 auto; padding:0 1.1rem 4rem; }
  header.top{ position:sticky; top:0; z-index:5; background:color-mix(in srgb,var(--bg) 88%,transparent);
    backdrop-filter:blur(8px); border-bottom:1px solid var(--border); }
  header.top .row{ max-width:820px; margin:0 auto; padding:.7rem 1.1rem; display:flex; align-items:center; justify-content:space-between; }
  .brand{ font-weight:800; letter-spacing:.02em; color:var(--text); text-decoration:none; font-size:1.15rem; }
  .brand span{ color:var(--accent); }
  .backlink{ color:var(--muted); text-decoration:none; font-size:.9rem; }
  .backlink:hover{ color:var(--text); }

  .hero-wrap{ max-width:820px; margin:0 auto; padding:1.6rem 1.1rem 0; }
  .hero-panel{ position:relative; overflow:hidden; border-radius:22px;
    padding:clamp(2.4rem,6vw,4rem) clamp(1.5rem,5vw,3.4rem); text-align:center; color:#f5f7fb;
    background:
      radial-gradient(1000px 460px at 82% -12%, color-mix(in srgb,var(--hero-accent) 30%, transparent), transparent 60%),
      linear-gradient(160deg,#0c1020 0%,#0a0d18 60%,#080a12 100%);
    border:1px solid color-mix(in srgb,#fff 8%,transparent);
    box-shadow:0 30px 80px -40px color-mix(in srgb,var(--hero-accent) 60%,transparent); }
  .hero-eyebrow{ display:inline-block; letter-spacing:.14em; text-transform:uppercase; font-size:.72rem;
    font-weight:700; color:var(--hero-accent); margin-bottom:1rem; }
  .hero-headline{ margin:0 auto .8rem; max-width:22ch; font-weight:800; line-height:1.08;
    font-size:clamp(1.9rem,5vw,3rem); color:#fff; }
  .hero-headline .glow{ color:var(--hero-accent); }
  .hero-subhead{ margin:0 auto; max-width:58ch; color:#aeb7c8; font-size:clamp(1rem,2.2vw,1.14rem); }

  h2{ font-size:1.55rem; margin:2.8rem 0 .5rem; display:flex; align-items:center; gap:.6rem; }
  h2::before{ content:""; width:.55rem; height:1.5rem; border-radius:3px; background:linear-gradient(180deg,var(--accent),var(--accent2)); flex:none; }
  .lede{ color:var(--muted); font-size:1.05rem; max-width:70ch; margin:.2rem 0 1rem; }
  .muted{ color:var(--muted); }

  table{ width:100%; border-collapse:collapse; margin:.6rem 0; font-size:.97rem; }
  th,td{ text-align:left; padding:.7rem .8rem; border-bottom:1px solid var(--border); vertical-align:top; }
  th{ color:var(--muted); font-size:.8rem; text-transform:uppercase; letter-spacing:.04em; }
  td:first-child{ white-space:nowrap; }
  .table-wrap{ overflow-x:auto; border:1px solid var(--border); border-radius:12px; }
  .table-wrap table{ margin:0; } .table-wrap td:last-child, .table-wrap th:last-child{ padding-right:1rem; }

  .cards{ display:grid; gap:1rem; grid-template-columns:1fr 1fr; margin-top:1rem; }
  @media (max-width:640px){ .cards{ grid-template-columns:1fr; } }
  .card{ background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:1.2rem 1.3rem; }
  .card h3{ margin:0 0 .4rem; font-size:1.06rem; display:flex; align-items:center; gap:.5rem; }
  .card p{ margin:0; color:var(--muted); font-size:.95rem; }
  .no::before{ content:"✕"; color:var(--bad); font-weight:800; }
  .yes::before{ content:"✓"; color:var(--good); font-weight:800; }

  ul.plain{ list-style:none; margin:.6rem 0; padding:0; }
  ul.plain li{ position:relative; padding:.4rem 0 .4rem 1.7rem; color:var(--text); }
  ul.plain li::before{ content:"✓"; position:absolute; left:0; color:var(--good); font-weight:800; }

  .callout{ background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 10%,transparent),transparent);
    border:1px solid color-mix(in srgb,var(--accent) 30%,transparent); border-radius:var(--radius); padding:1.2rem 1.3rem; margin-top:1.2rem; }
  .callout p{ margin:.3rem 0; }

  footer.foot{ border-top:1px solid var(--border); margin-top:2.5rem; }
  footer.foot .row{ max-width:820px; margin:0 auto; padding:1.2rem 1.1rem; display:flex; gap:1rem; flex-wrap:wrap; color:var(--muted); font-size:.9rem; }
  footer.foot a{ color:var(--muted); }
</style>
</head>
<body>
<header class="top"><div class="row">
  <a class="brand" href="/"><span>m</span>ustr</a>
  <a class="backlink" href="/">&larr; Back to the site</a>
</div></header>

<div class="hero-wrap">
  <section class="hero-panel">
    <div class="hero-eyebrow">Trust &amp; safety</div>
    <h1 class="hero-headline">What the bot <span class="glow">can — and can't — do.</span></h1>
    <p class="hero-subhead">Adding a bot to your server is a fair thing to be cautious about. Here's the whole,
      honest picture — no fine print.</p>
  </section>
</div>

<div class="wrap">

  <h2>The only permissions it asks for</h2>
  <p class="lede">When someone invites mustr, Discord shows them a consent screen. This is the entire list it will
    show — a short, boring set of exactly what the features need. <strong>Never Administrator.</strong></p>
  <div class="table-wrap"><table>
    <thead><tr><th>Permission</th><th>Why mustr asks for it</th></tr></thead>
    <tbody>${permRows}</tbody>
  </table></div>

  <h2>What it never does</h2>
  <div class="cards">
    <div class="card"><h3 class="no">Read your messages</h3><p>mustr never requests the Message Content permission and never connects to Discord's live message stream. It literally cannot see what you type.</p></div>
    <div class="card"><h3 class="no">Get Administrator</h3><p>No admin, no "Manage Server," no "Manage Channels." Only the six permissions above.</p></div>
    <div class="card"><h3 class="no">Kick or ban anyone</h3><p>It has no moderation powers in Discord at all. Removing someone is always a human's call, in Discord.</p></div>
    <div class="card"><h3 class="no">Send your data anywhere</h3><p>Everything lives in the server owner's own Cloudflare account. There is no mustr company server collecting it.</p></div>
  </div>

  <h2>Why that's provable, not just a promise</h2>
  <ul class="plain">
    <li><strong>It runs "request &amp; response," not "always listening."</strong> mustr is a Cloudflare Worker that only wakes up to answer a button press or a scheduled post — it holds no live connection to your server's chat.</li>
    <li><strong>Every request is cryptographically verified.</strong> The bot acts only on messages Discord has signed; a forged request is rejected.</li>
    <li><strong>It's self-hosted.</strong> Each community runs its own copy, with its own bot, on its own account. Your members' data never touches anyone else's install.</li>
    <li><strong>The permission list is generated from the code itself</strong> — the same source that builds the invite link builds this page, so they can't disagree.</li>
  </ul>

  <div class="callout">
    <h2 style="margin-top:0">"But it doesn't have the blue ✓ — is it sketchy?"</h2>
    <p>Discord's verified checkmark is for bots that live in <strong>75+ servers</strong>. mustr is deliberately the
      opposite: one small bot per community, in a single server it was invited to. That means it will never qualify for
      the badge — not because it's untrustworthy, but because it isn't a big shared bot slurping data from thousands of
      servers. The short permission list above is the real thing to check, and you can see all of it before you click.</p>
  </div>

</div>

<footer class="foot"><div class="row">
  <a href="/">Home</a>
  <span style="margin-left:auto">© ${new Date().getFullYear()} mustr</span>
</div></footer>
</body>
</html>`;
}
