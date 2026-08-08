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

export function productPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>mustr — Community management for gaming orgs</title>
<meta name="description" content="mustr is a modern, self-hosted community platform for gaming orgs — roster, ranks, events with two-way Discord sync, training, and more. Founded 2026, built on two decades of ClanTek. Runs on Cloudflare's free tier." />
<style>
  :root{
    --bg:#0b0e14; --panel:#121722; --panel2:#0f1420; --text:#e6e9ef; --muted:#9aa4b2;
    --border:#232b3a; --accent:#6ea8fe; --accent2:#8b5cf6; --good:#22c55e; --radius:14px; --hero-accent:#6ea8fe;
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
  <a class="brand" href="/">mu<span>str</span></a>
  <div class="top-links">
    <a href="#features">Features</a>
    <a href="#pricing">Pricing</a>
    <a href="/about">Cost &amp; legal</a>
    <a href="/">Live site &rarr;</a>
  </div>
</div></header>

<div class="hero-wrap">
  <section class="hero-panel">
    <div class="hero-eyebrow">Community management for gaming orgs</div>
    <h1 class="hero-headline">Run your org like it's <span class="glow">2026.</span></h1>
    <p class="hero-subhead">mustr is a modern, self-hosted platform for gaming communities — roster &amp; ranks,
      events that sync both ways with Discord, training, galleries, and more. You're looking at a live one right now.</p>
    <div class="hero-cta">
      <a class="hero-btn hero-btn-primary" href="#get">Get mustr</a>
      <a class="hero-btn hero-btn-secondary" href="/">Explore the live demo &rarr;</a>
    </div>
    <div class="hero-chips">
      <span class="hero-chip"><b>Founded 2026</b></span>
      <span class="hero-chip"><b>20+ yrs</b><span class="u">of ClanTek heritage</span></span>
      <span class="hero-chip"><b>$0</b><span class="u">hosting</span></span>
      <span class="hero-chip"><b>No subscriptions</b></span>
      <span class="hero-chip"><b>Your data,</b><span class="u">your server</span></span>
    </div>
  </section>
</div>

<div class="wrap">
  <p class="section-lede" style="margin-top:1.8rem">
    mustr gives a gaming org everything it needs to organize itself — members, ranks, roles, events, training,
    and history — in one place that plugs straight into Discord and runs on infrastructure that costs nothing to
    keep online. Every feature below is live in this very site.
  </p>

  <h2 id="features">Everything your community needs</h2>
  <p class="section-lede">One platform instead of a patchwork of bots, spreadsheets, and forum threads.</p>
  <div class="features">
    <div class="feature"><span class="ic">🪖</span><h3>Roster, ranks &amp; roles</h3><p>A full member roster with a rank ladder, assignable roles, medals, and war records — all reflected back into Discord roles automatically.</p></div>
    <div class="feature"><span class="ic">📅</span><h3>Events with Discord sync</h3><p>Schedule events with sign-up slots (Tank/Healer/DPS, etc.), capacities, banners, and recurrence. RSVPs on the site and in Discord update the same live sign-up sheet.</p></div>
    <div class="feature"><span class="ic">🎓</span><h3>Training repository</h3><p>Embed Google Slides courses, mark them required for specific ranks, and track completion per member — self-attested or officer-verified.</p></div>
    <div class="feature"><span class="ic">🖼️</span><h3>Gallery &amp; media</h3><p>Image galleries with a built-in lightbox, plus embedded YouTube/Twitch video that costs you nothing to host.</p></div>
    <div class="feature"><span class="ic">📰</span><h3>News &amp; announcements</h3><p>Post updates to the site and push them to Discord, with public or members-only visibility per post.</p></div>
    <div class="feature"><span class="ic">🕸️</span><h3>Org chart</h3><p>A visual leadership chart that shows your command structure at a glance.</p></div>
    <div class="feature"><span class="ic">🤝</span><h3>Apply-to-join &amp; bans</h3><p>Let prospects apply through Discord login, approve or ban with a real ban list, and auto-onboard members who join your server.</p></div>
    <div class="feature"><span class="ic">🧩</span><h3>Drag-and-drop pages</h3><p>Arrange your home page and build custom pages from modules — no code. 12 built-in themes, your own branding, logo, and favicon.</p></div>
    <div class="feature"><span class="ic">📜</span><h3>Audit log</h3><p>Every promotion, demotion, medal, and removal is logged with a mandatory reason — full accountability for your leadership.</p></div>
    <div class="feature"><span class="ic">🔗</span><h3>Deep Discord integration</h3><p>OAuth login, slash commands, automatic role sync, and event sign-up sheets — your site and your server stay in lockstep.</p></div>
    <div class="feature"><span class="ic">📱</span><h3>Mobile-ready &amp; installable</h3><p>Installs as an app (PWA) and ships a versioned JSON API with bearer tokens for building your own mobile clients.</p></div>
    <div class="feature"><span class="ic">🚀</span><h3>Game modules</h3><p>Toggleable per-game features — the first ships a Star Citizen hangar import — with a framework for more.</p></div>
  </div>

  <h2 id="cost">Built to cost you nothing to run</h2>
  <div class="split">
    <div class="card accent">
      <div class="big-num">$0<span style="font-size:1rem;color:var(--muted)"> /month hosting</span></div>
      <p>mustr runs entirely inside Cloudflare's free tier. The only guaranteed cost of running your instance is a
        domain name from a registrar of your choice.</p>
      <p><a href="/about">See the honest cost &amp; legal breakdown, with a live estimator &rarr;</a></p>
    </div>
    <div class="card">
      <h3>You own it</h3>
      <p>It's <strong>self-hosted</strong> — your instance, your database, your Discord app. No middleman holds your
        community's data, and there's no monthly bill that can be raised on you.</p>
      <p class="small">Storage for uploaded images is the one thing that grows over time; the free ceiling is 10&nbsp;GB
        (thousands of pictures).</p>
    </div>
  </div>

  <h2 id="story">Two decades in the making</h2>
  <p class="section-lede">mustr is new — but the idea behind it isn't.</p>
  <div class="timeline">
    <div class="tl"><div class="yr">2003</div><h4>ClanTek</h4><p>It started as ClanTek, a community-management project for gaming clans — built when running an org online meant forums and hand-kept rosters.</p></div>
    <div class="tl"><div class="yr">20+ years</div><h4>Hard-won lessons</h4><p>Two decades of what gaming communities actually need to stay organized — and what only gets in the way.</p></div>
    <div class="tl"><div class="yr">2026</div><h4>mustr</h4><p>A ground-up rebuild for the modern web: Discord-native, self-hosted, installable, and free to run — the same idea, done right.</p></div>
  </div>

  <h2 id="pricing">Pricing</h2>
  <p class="section-lede">Simple and honest: no subscriptions, no per-seat fees, no upsells.</p>
  <div class="pricing">
    <div class="price-card">
      <div class="hero-eyebrow" style="color:var(--accent)">One-time</div>
      <div class="price-tag">A single purchase &mdash; that's it</div>
      <p class="price-sub">Final pricing is being set for the 2026 launch.</p>
      <ul class="price-list">
        <li>One-time cost &mdash; never a recurring charge</li>
        <li>Your own self-hosted instance</li>
        <li>Every feature included &mdash; no paywalled modules</li>
        <li>$0/month to run on Cloudflare's free tier</li>
      </ul>
    </div>
  </div>

  <div class="cta-band" id="get">
    <h2>Interested in mustr for your org?</h2>
    <p class="section-lede" style="margin-inline:auto">Get in touch and we'll help you get your community set up.</p>
    <!-- TODO(operator): set this href to your real contact — a Discord invite or mailto. -->
    <a class="cta-btn" href="#get">Get in touch</a>
    <p class="cta-note">You're already exploring a live mustr instance — poke around the
      <a href="/">site</a> to see it in action.</p>
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
