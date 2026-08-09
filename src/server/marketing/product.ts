/**
 * The public product / go-to-sale landing served at mustr.gg/product.
 *
 * This is the pitch to *prospective buyers* — other org leaders who might deploy
 * their own mustr instance. It is deliberately mustr.gg-ONLY: a buyer's own
 * install must never show a "buy mustr" page to its members, so the route in
 * index.ts host-gates this to mustr.gg (falling through to the app elsewhere).
 * Self-contained HTML with its own inline CSS, matching the /about page's hero
 * look so the marketing surface feels like one product.
 *
 * Honesty rules: every feature listed here is actually shipped. Pricing is stated
 * softly and non-committally (one-time, possibly free, amount unset) — do not
 * invent a number. The contact CTA is a placeholder for the operator to wire.
 */

export function productPageHtml(accent = '#a56bf0'): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>mustr — Community management for gaming orgs</title>
<meta name="description" content="mustr is a self-hosted community site for gaming orgs — roster, ranks, events that sync with Discord, training, and more. New in 2026, built by a gamer who's been at this since 2003. Runs on Cloudflare's free tier for about nothing." />
<style>
  :root{
    --bg:#0b0e14; --panel:#121722; --panel2:#0f1420; --text:#e6e9ef; --muted:#9aa4b2;
    --border:#232b3a; --accent:${accent}; --accent2:color-mix(in srgb, ${accent} 72%, #000); --good:#22c55e; --radius:14px; --hero-accent:${accent};
  }
  @media (prefers-color-scheme: light){
    :root{ --bg:#f6f8fc; --panel:#ffffff; --panel2:#f0f3f9; --text:#12161f; --muted:#5a6473; --border:#e2e8f2; }
  }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--text);
    font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
  a{ color:var(--accent); }
  .wrap{ max-width:980px; margin:0 auto; padding:0 1.1rem 4rem; }
  header.top{ position:sticky; top:0; z-index:5; background:color-mix(in srgb,var(--bg) 88%,transparent);
    backdrop-filter:blur(8px); border-bottom:1px solid var(--border); }
  header.top .row{ max-width:980px; margin:0 auto; padding:.7rem 1.1rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .brand{ font-weight:800; letter-spacing:.02em; color:var(--text); text-decoration:none; font-size:1.15rem; }
  .brand span{ color:var(--accent); }
  .top-links{ display:flex; gap:1.1rem; align-items:center; font-size:.9rem; }
  .top-links a{ color:var(--muted); text-decoration:none; }
  .top-links a:hover{ color:var(--text); }

  /* Hero (mirrors the home + /about hero) */
  .hero-wrap{ max-width:980px; margin:0 auto; padding:1.6rem 1.1rem 0; }
  .hero-panel{
    position:relative; overflow:hidden; border-radius:22px;
    padding:clamp(2.8rem,6vw,5rem) clamp(1.5rem,5vw,4rem); text-align:center; color:#f5f7fb;
    background:
      radial-gradient(1200px 500px at 80% -10%, color-mix(in srgb,var(--hero-accent) 30%, transparent), transparent 60%),
      radial-gradient(900px 400px at 0% 110%, color-mix(in srgb,var(--accent2) 24%, transparent), transparent 55%),
      linear-gradient(160deg,#0c1020 0%,#0a0d18 60%,#080a12 100%);
    border:1px solid color-mix(in srgb,#fff 8%,transparent);
    box-shadow:0 30px 80px -40px color-mix(in srgb,var(--hero-accent) 60%,transparent);
  }
  .hero-eyebrow{ display:inline-block; letter-spacing:.14em; text-transform:uppercase; font-size:.72rem;
    font-weight:700; color:var(--hero-accent); margin-bottom:1rem; }
  .hero-headline{ margin:0 auto .9rem; max-width:18ch; font-weight:800; line-height:1.05;
    font-size:clamp(2.1rem,5.6vw,3.6rem); color:#fff; }
  .hero-headline .glow{ color:var(--hero-accent); }
  .hero-subhead{ margin:0 auto; max-width:60ch; color:#aeb7c8; font-size:clamp(1rem,2.2vw,1.18rem); line-height:1.6; }
  .hero-cta{ display:flex; flex-wrap:wrap; gap:.9rem; justify-content:center; margin:2rem 0 1.6rem; }
  .hero-btn{ display:inline-flex; align-items:center; gap:.55rem; padding:.85rem 1.7rem; border-radius:12px;
    font-size:1.02rem; font-weight:700; text-decoration:none; transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
  .hero-btn:hover{ transform:translateY(-2px); }
  .hero-btn-primary{ background:var(--hero-accent); color:#0a0d18; box-shadow:0 10px 30px color-mix(in srgb,var(--hero-accent) 45%,transparent); }
  .hero-btn-primary:hover{ box-shadow:0 14px 38px color-mix(in srgb,var(--hero-accent) 60%,transparent); }
  .hero-btn-secondary{ background:transparent; color:#f5f7fb; border:1.5px solid color-mix(in srgb,#fff 28%,transparent); }
  .hero-btn-secondary:hover{ border-color:var(--hero-accent); color:#fff; }
  .hero-chips{ display:flex; flex-wrap:wrap; gap:.6rem; justify-content:center; }
  .hero-chip{ display:inline-flex; align-items:baseline; gap:.4rem; padding:.5rem 1rem; border-radius:999px;
    font-size:.9rem; color:#dfe6f5; background:color-mix(in srgb,#fff 6%,transparent); border:1px solid color-mix(in srgb,#fff 12%,transparent); }
  .hero-chip b{ color:#fff; font-weight:800; }
  .hero-chip .u{ color:var(--hero-accent); font-weight:700; }

  h2{ font-size:1.7rem; margin:3rem 0 .5rem; display:flex; align-items:center; gap:.6rem; scroll-margin-top:4.5rem; }
  h2::before{ content:""; width:.55rem; height:1.5rem; border-radius:3px; background:linear-gradient(180deg,var(--accent),var(--accent2)); flex:none; }
  .section-lede{ color:var(--muted); font-size:1.06rem; max-width:70ch; margin:.2rem 0 1.2rem; }
  .muted{ color:var(--muted); } .small{ font-size:.9rem; }

  /* Feature grid */
  .features{ display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); margin-top:1rem; }
  .feature{ background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:1.3rem; transition:transform .15s ease, border-color .15s ease; }
  .feature:hover{ transform:translateY(-3px); border-color:color-mix(in srgb,var(--accent) 45%,transparent); }
  .feature .ic{ font-size:1.7rem; line-height:1; display:block; margin-bottom:.6rem; }
  .feature h3{ margin:0 0 .3rem; font-size:1.08rem; }
  .feature p{ margin:0; color:var(--muted); font-size:.94rem; line-height:1.55; }

  /* Split callout cards */
  .split{ display:grid; gap:1.2rem; grid-template-columns:1fr 1fr; margin-top:1rem; }
  @media (max-width:680px){ .split{ grid-template-columns:1fr; } }
  .card{ background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:1.5rem; }
  .card.accent{ background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 12%,transparent),transparent); border-color:color-mix(in srgb,var(--accent) 34%,transparent); }
  .card h3{ margin:.1rem 0 .5rem; font-size:1.2rem; }
  .card p{ margin:.4rem 0; color:var(--muted); }
  .big-num{ font-size:2.4rem; font-weight:800; color:var(--accent); line-height:1; }

  /* Heritage timeline */
  .timeline{ display:flex; gap:1rem; flex-wrap:wrap; margin-top:1rem; }
  .tl{ flex:1 1 220px; background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:1.2rem; position:relative; }
  .tl .yr{ font-size:1.5rem; font-weight:800; color:var(--accent); }
  .tl h4{ margin:.3rem 0 .3rem; }
  .tl p{ margin:0; color:var(--muted); font-size:.93rem; }

  /* Pricing */
  .pricing{ margin-top:1rem; }
  .price-card{ background:var(--panel); border:1px solid var(--border); border-radius:18px; padding:1.8rem; text-align:center; max-width:520px; margin:0 auto;
    background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 10%,transparent),transparent); border-color:color-mix(in srgb,var(--accent) 34%,transparent); }
  .price-tag{ font-size:2rem; font-weight:800; margin:.2rem 0; }
  .price-sub{ color:var(--muted); }
  .price-list{ list-style:none; margin:1.2rem auto 0; padding:0; max-width:360px; text-align:left; }
  .price-list li{ margin:.5rem 0; padding-left:1.6rem; position:relative; }
  .price-list li::before{ content:"✓"; position:absolute; left:0; color:var(--good); font-weight:800; }

  .cta-band{ text-align:center; background:var(--panel); border:1px solid var(--border); border-radius:18px; padding:2.2rem 1.4rem; margin-top:1.4rem;
    background:
      radial-gradient(700px 300px at 50% -30%, color-mix(in srgb,var(--accent) 18%,transparent), transparent 70%), var(--panel); }
  .cta-band h2{ justify-content:center; border:0; }
  .cta-band h2::before{ display:none; }
  .cta-btn{ display:inline-flex; align-items:center; gap:.5rem; padding:.9rem 1.9rem; border-radius:12px; font-weight:700; font-size:1.05rem; text-decoration:none;
    background:var(--accent); color:#0a0d18; margin-top:.6rem; box-shadow:0 10px 30px color-mix(in srgb,var(--accent) 40%,transparent); }
  .cta-note{ color:var(--muted); font-size:.86rem; margin-top:1rem; }

  footer.foot{ border-top:1px solid var(--border); margin-top:2.5rem; }
  footer.foot .row{ max-width:980px; margin:0 auto; padding:1.2rem 1.1rem; display:flex; gap:1rem; flex-wrap:wrap; color:var(--muted); font-size:.9rem; }
  footer.foot a{ color:var(--muted); }
  @media (prefers-reduced-motion: reduce){ .hero-btn:hover,.feature:hover{ transform:none; } }
</style>
</head>
<body>
<header class="top"><div class="row">
  <a class="brand" href="/"><span>m</span>ustr</a>
  <div class="top-links">
    <a href="#features">Features</a>
    <a href="#pricing">Pricing</a>
    <a href="/setup">Setup guide</a>
    <a href="/about">Cost &amp; legal</a>
    <a href="/">Live site &rarr;</a>
  </div>
</div></header>

<div class="hero-wrap">
  <section class="hero-panel">
    <div class="hero-eyebrow">Community tools for gaming orgs</div>
    <h1 class="hero-headline">Run your gaming org without the <span class="glow">spreadsheet gymnastics.</span></h1>
    <p class="hero-subhead">Roster, ranks, events that actually sync with Discord, training, galleries — the stuff
      you're probably holding together with pinned messages and a shared spreadsheet right now. You're looking at
      a live one, in fact.</p>
    <div class="hero-cta">
      <a class="hero-btn hero-btn-primary" href="#get">Get mustr</a>
      <a class="hero-btn hero-btn-secondary" href="/">Poke around the live site &rarr;</a>
    </div>
    <div class="hero-chips">
      <span class="hero-chip"><b>New in 2026</b></span>
      <span class="hero-chip"><b>Built by a gamer</b><span class="u">old enough to remember LAN parties</span></span>
      <span class="hero-chip"><b>~$0</b><span class="u">to host</span></span>
      <span class="hero-chip"><b>No subscription</b></span>
      <span class="hero-chip"><b>Your data,</b><span class="u">your server</span></span>
    </div>
  </section>
</div>

<div class="wrap">
  <p class="section-lede" style="margin-top:1.8rem">
    It keeps a gaming org organized — members, ranks, roles, events, training, history — in one place that talks
    to Discord and runs on hosting that costs about nothing. Everything below is switched on right here, so this
    isn't a mockup you have to imagine; it's the actual thing.
  </p>

  <h2 id="features">The stuff it does</h2>
  <p class="section-lede">One place, instead of a bot for this, a spreadsheet for that, and a forum thread nobody reads.</p>
  <div class="features">
    <div class="feature"><span class="ic">🪖</span><h3>Roster, ranks &amp; roles</h3><p>A member roster with a rank ladder, roles, medals, and war records — and it keeps the matching Discord roles in sync so you're not doing it by hand at 1am.</p></div>
    <div class="feature"><span class="ic">📅</span><h3>Events, wired to Discord</h3><p>Sign-up slots (Tank/Healer/DPS, whatever), capacities, banners, recurrence. RSVPs on the site and in Discord update the same sheet — no more counting reacts.</p></div>
    <div class="feature"><span class="ic">🎓</span><h3>Training</h3><p>Embed Google Slides, mark courses required per rank, and see who's actually done them versus who says they have.</p></div>
    <div class="feature"><span class="ic">🖼️</span><h3>Gallery &amp; media</h3><p>Image galleries with a lightbox, plus embedded YouTube/Twitch — video you don't pay to host.</p></div>
    <div class="feature"><span class="ic">📰</span><h3>News &amp; announcements</h3><p>Post to the site and push to Discord, public or members-only per post.</p></div>
    <div class="feature"><span class="ic">🕸️</span><h3>Org chart</h3><p>A leadership chart, so new folks can figure out who to bug about what.</p></div>
    <div class="feature"><span class="ic">🤝</span><h3>Apply-to-join &amp; bans</h3><p>People apply by signing in with Discord; you approve or ban with a real ban list, and anyone who joins your server gets onboarded automatically.</p></div>
    <div class="feature"><span class="ic">🧩</span><h3>Build your own pages</h3><p>Arrange the home page and add pages from blocks — no code. A dozen themes plus your own logo and colors, so it doesn't have to look like mine.</p></div>
    <div class="feature"><span class="ic">📜</span><h3>Audit log</h3><p>Every promotion, demotion, and medal logged with a reason — for the inevitable "wait, who did that?"</p></div>
    <div class="feature"><span class="ic">🔗</span><h3>Discord, properly wired in</h3><p>Login, slash commands, role sync, event sign-ups — the site and your server stay in step instead of drifting apart.</p></div>
    <div class="feature"><span class="ic">📱</span><h3>Works on phones</h3><p>Installs like an app, and there's a proper API with tokens if someone wants to build their own client.</p></div>
    <div class="feature"><span class="ic">🚀</span><h3>Game modules</h3><p>Optional per-game extras you can switch on — first up is a Star Citizen hangar import — with room for more.</p></div>
  </div>

  <h2 id="cost">It costs about nothing to run</h2>
  <div class="split">
    <div class="card accent">
      <div class="big-num">~$0<span style="font-size:1rem;color:var(--muted)"> /month to host</span></div>
      <p>It runs inside Cloudflare's free tier. The only thing you're guaranteed to pay for is a domain name from a
        registrar. I'm not saying that to sound clever — I just didn't want a hosting bill either.</p>
      <p><a href="/about">The honest cost &amp; legal breakdown, with a live estimator &rarr;</a></p>
    </div>
    <div class="card">
      <h3>It's yours</h3>
      <p>Self-hosted — your instance, your database, your Discord app. Nobody's holding your community's data hostage,
        and there's no monthly bill I can quietly raise on you later.</p>
      <p class="small">Uploaded images are the one thing that grows over time; the free ceiling is 10&nbsp;GB, which is
        a lot of screenshots.</p>
    </div>
  </div>

  <h2 id="story">Yes, I've been doing this a while</h2>
  <p class="section-lede">mustr is new. The person who made it, less so.</p>
  <div class="timeline">
    <div class="tl"><div class="yr">2003</div><h4>ClanTek</h4><p>It started as ClanTek, a clan site I built back when "responsive design" meant the server responded at all.</p></div>
    <div class="tl"><div class="yr">20+ years</div><h4>A lot of gaming later</h4><p>Two decades of running and building for gaming communities — mostly learning which features people actually use and which just get in the way.</p></div>
    <div class="tl"><div class="yr">2026</div><h4>mustr</h4><p>A full rebuild for the modern web: Discord-native, self-hosted, installable. Same idea, far fewer &lt;font&gt; tags.</p></div>
  </div>

  <h2 id="pricing">Pricing</h2>
  <p class="section-lede">Buy it once. No subscription — honestly, I'd only forget to cancel it too.</p>
  <div class="pricing">
    <div class="price-card">
      <div class="hero-eyebrow" style="color:var(--accent)">One-time</div>
      <div class="price-tag">Pay once. That's the whole model.</div>
      <p class="price-sub">Still settling on the number for the 2026 launch.</p>
      <ul class="price-list">
        <li>Pay once — no recurring anything</li>
        <li>Your own self-hosted instance, not a seat on mine</li>
        <li>Every feature included — I didn't wall things off to sell them back to you</li>
        <li>~$0/month to run, on Cloudflare's free tier</li>
      </ul>
    </div>
  </div>

  <div class="cta-band" id="get">
    <h2>Want it for your org?</h2>
    <p class="section-lede" style="margin-inline:auto">Read the step-by-step <a href="/setup">setup guide</a>, or hop in the Discord and I'll help you get set up.</p>
    <a class="cta-btn" href="https://discord.gg/abtYKysKw" target="_blank" rel="noopener noreferrer">Join the Discord</a>
    <p class="cta-note">You're already on a live one — click around the <a href="/">site</a> and kick the tires. New here? Start with the <a href="/setup">setup guide</a>.</p>
  </div>
</div>

<footer class="foot"><div class="row">
  <a href="/">Home</a>
  <a href="/about">Cost &amp; legal</a>
  <a href="/legal">Legal</a>
  <span style="margin-left:auto">© ${new Date().getFullYear()} mustr</span>
</div></footer>
</body>
</html>`;
}
