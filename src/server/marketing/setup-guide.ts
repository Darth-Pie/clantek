/**
 * The public "How to set up mustr" walkthrough at mustr.gg/setup.
 *
 * First-party, self-contained HTML (its own inline CSS), host-gated to mustr.gg
 * exactly like /product — a buyer's own deployment never routes /setup here (see
 * index.ts). Content mirrors docs/buyer-setup-guide.md in the site's dry voice.
 * Deliberately ELI5: it assumes no coding, leans on the setup wizard to hand the
 * buyer exact URLs, and stays registrar-agnostic. Two steps (deploy + custom
 * domain) depend on the not-yet-finalised delivery mechanism, so they're phrased
 * as honest pre-launch "join the Discord and I'll get you deployed" callouts
 * rather than broken placeholders. The hero mirrors the home/about/product hero.
 */

export function setupGuideHtml(accent = '#a56bf0'): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>mustr — Setup guide (no jargon)</title>
<meta name="description" content="The plain-English walkthrough for getting your own copy of mustr running on Cloudflare's free tier — no coding, no terminal. About 45 minutes and a domain name." />
<style>
  :root{
    --bg:#0b0e14; --panel:#121722; --panel2:#0f1420; --text:#e6e9ef; --muted:#9aa4b2;
    --border:#232b3a; --accent:${accent}; --accent2:color-mix(in srgb, ${accent} 72%, #000); --good:#22c55e; --warn:#f59e0b; --bad:#ef4444; --radius:14px; --hero-accent:${accent};
  }
  @media (prefers-color-scheme: light){
    :root{ --bg:#f6f8fc; --panel:#ffffff; --panel2:#f0f3f9; --text:#12161f; --muted:#5a6473; --border:#e2e8f2; }
  }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--text);
    font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
  a{ color:var(--accent); }
  .wrap{ max-width:860px; margin:0 auto; padding:0 1.1rem 4rem; }
  header.top{ position:sticky; top:0; z-index:5; background:color-mix(in srgb,var(--bg) 88%,transparent);
    backdrop-filter:blur(8px); border-bottom:1px solid var(--border); }
  header.top .row{ max-width:860px; margin:0 auto; padding:.7rem 1.1rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .brand{ font-weight:800; letter-spacing:.02em; color:var(--text); text-decoration:none; font-size:1.15rem; }
  .brand span{ color:var(--accent); }
  .top-links{ display:flex; gap:1.1rem; align-items:center; font-size:.9rem; }
  .top-links a{ color:var(--muted); text-decoration:none; }
  .top-links a:hover{ color:var(--text); }

  /* Hero (mirrors the home + /about + /product hero) */
  .hero-wrap{ max-width:860px; margin:0 auto; padding:1.6rem 1.1rem 0; }
  .hero-panel{
    position:relative; overflow:hidden; border-radius:22px;
    padding:clamp(2.6rem,6vw,4.4rem) clamp(1.5rem,5vw,4rem); text-align:center; color:#f5f7fb;
    background:
      radial-gradient(1200px 500px at 80% -10%, color-mix(in srgb,var(--hero-accent) 30%, transparent), transparent 60%),
      radial-gradient(900px 400px at 0% 110%, color-mix(in srgb,var(--accent2) 24%, transparent), transparent 55%),
      linear-gradient(160deg,#0c1020 0%,#0a0d18 60%,#080a12 100%);
    border:1px solid color-mix(in srgb,#fff 8%,transparent);
    box-shadow:0 30px 80px -40px color-mix(in srgb,var(--hero-accent) 60%,transparent);
  }
  .hero-eyebrow{ display:inline-block; letter-spacing:.14em; text-transform:uppercase; font-size:.72rem;
    font-weight:700; color:var(--hero-accent); margin-bottom:1rem; }
  .hero-headline{ margin:0 auto .9rem; max-width:20ch; font-weight:800; line-height:1.06;
    font-size:clamp(2rem,5.2vw,3.2rem); color:#fff; }
  .hero-headline .glow{ color:var(--hero-accent); }
  .hero-subhead{ margin:0 auto; max-width:60ch; color:#aeb7c8; font-size:clamp(1rem,2.2vw,1.14rem); line-height:1.6; }
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

  h2{ font-size:1.6rem; margin:3rem 0 .5rem; display:flex; align-items:center; gap:.6rem; scroll-margin-top:4.5rem; }
  h2::before{ content:""; width:.55rem; height:1.5rem; border-radius:3px; background:linear-gradient(180deg,var(--accent),var(--accent2)); flex:none; }
  .section-lede{ color:var(--muted); font-size:1.04rem; max-width:70ch; margin:.2rem 0 1.2rem; }
  .muted{ color:var(--muted); } .small{ font-size:.9rem; }
  p{ max-width:72ch; }

  /* Intro / honest-gate card */
  .card{ background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:1.5rem; margin-top:1rem; }
  .card.accent{ background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 12%,transparent),transparent); border-color:color-mix(in srgb,var(--accent) 34%,transparent); }
  .card h3{ margin:.1rem 0 .5rem; font-size:1.2rem; }
  .card p{ margin:.5rem 0; }

  /* Checklist */
  .checklist{ list-style:none; margin:.8rem 0 0; padding:0; }
  .checklist li{ position:relative; padding:.35rem 0 .35rem 2rem; color:var(--text); }
  .checklist li::before{ content:"□"; position:absolute; left:0; top:.3rem; color:var(--accent); font-size:1.15rem; font-weight:800; }

  /* The picture (numbered pills) */
  .picture{ display:grid; gap:.8rem; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); margin-top:1rem; }
  .pic{ background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:1.1rem 1.2rem; }
  .pic .n{ display:inline-flex; align-items:center; justify-content:center; width:1.6rem; height:1.6rem; border-radius:8px;
    background:color-mix(in srgb,var(--accent) 20%,transparent); color:var(--accent); font-weight:800; font-size:.9rem; margin-bottom:.5rem; }
  .pic b{ display:block; margin-bottom:.2rem; }
  .pic p{ margin:0; color:var(--muted); font-size:.92rem; }

  /* Steps */
  .step{ display:flex; gap:1.1rem; margin-top:1.6rem; }
  .step-num{ flex:none; width:2.6rem; height:2.6rem; border-radius:50%; display:flex; align-items:center; justify-content:center;
    font-weight:800; font-size:1.15rem; color:#0a0d18; background:linear-gradient(180deg,var(--accent),var(--accent2));
    box-shadow:0 8px 22px -8px color-mix(in srgb,var(--accent) 70%,transparent); }
  .step-body{ flex:1 1 auto; min-width:0; padding-top:.15rem; }
  .step-body h3{ margin:.2rem 0 .5rem; font-size:1.2rem; }
  .step-body ol, .step-body ul{ margin:.6rem 0; padding-left:1.3rem; }
  .step-body li{ margin:.35rem 0; }
  .step-body p{ margin:.5rem 0; }

  /* Callouts */
  .note{ border:1px solid var(--border); border-left:4px solid var(--accent); background:var(--panel2);
    border-radius:10px; padding:.9rem 1.1rem; margin:.9rem 0; font-size:.96rem; }
  .note .lbl{ font-weight:800; letter-spacing:.02em; }
  .note.tip{ border-left-color:var(--good); }
  .note.warn{ border-left-color:var(--warn); }
  .note.warn .lbl{ color:var(--warn); }
  .note.tip .lbl{ color:var(--good); }
  .note code, .step-body code, td code{ background:color-mix(in srgb,var(--accent) 16%,transparent);
    padding:.08em .4em; border-radius:5px; font-size:.9em; }
  .note a.dbtn{ display:inline-block; margin-top:.5rem; font-weight:700; }

  /* Tables */
  table{ width:100%; border-collapse:collapse; margin:.9rem 0; font-size:.94rem; }
  th,td{ text-align:left; padding:.6rem .7rem; border-bottom:1px solid var(--border); vertical-align:top; }
  th{ color:var(--muted); font-weight:700; font-size:.82rem; text-transform:uppercase; letter-spacing:.04em; }
  .table-wrap{ overflow-x:auto; }

  /* Glossary */
  .glossary{ display:grid; gap:.7rem; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); margin-top:1rem; }
  .gterm{ background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:.9rem 1.1rem; }
  .gterm b{ color:var(--text); } .gterm span{ color:var(--muted); font-size:.92rem; }

  /* Trouble list */
  .trouble{ list-style:none; margin:1rem 0 0; padding:0; }
  .trouble li{ background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:.9rem 1.1rem; margin:.6rem 0; }
  .trouble b{ display:block; margin-bottom:.2rem; }
  .trouble span{ color:var(--muted); font-size:.94rem; }

  .cta-band{ text-align:center; border:1px solid var(--border); border-radius:18px; padding:2rem 1.4rem; margin-top:2rem;
    background:radial-gradient(700px 300px at 50% -30%, color-mix(in srgb,var(--accent) 18%,transparent), transparent 70%), var(--panel); }
  .cta-band h2{ justify-content:center; border:0; } .cta-band h2::before{ display:none; }
  .cta-btn{ display:inline-flex; align-items:center; gap:.5rem; padding:.9rem 1.9rem; border-radius:12px; font-weight:700; font-size:1.05rem; text-decoration:none;
    background:var(--accent); color:#0a0d18; margin-top:.6rem; box-shadow:0 10px 30px color-mix(in srgb,var(--accent) 40%,transparent); }

  footer.foot{ border-top:1px solid var(--border); margin-top:2.5rem; }
  footer.foot .row{ max-width:860px; margin:0 auto; padding:1.2rem 1.1rem; display:flex; gap:1rem; flex-wrap:wrap; color:var(--muted); font-size:.9rem; }
  footer.foot a{ color:var(--muted); }
  @media (prefers-reduced-motion: reduce){ .hero-btn:hover{ transform:none; } }
</style>
</head>
<body>
<header class="top"><div class="row">
  <a class="brand" href="/"><span>m</span>ustr</a>
  <div class="top-links">
    <a href="/product">Product</a>
    <a href="/about">Cost &amp; legal</a>
    <a href="/">Live site &rarr;</a>
  </div>
</div></header>

<div class="hero-wrap">
  <section class="hero-panel">
    <div class="hero-eyebrow">Setup guide</div>
    <h1 class="hero-headline">Setting up mustr, <span class="glow">minus the jargon.</span></h1>
    <p class="hero-subhead">The whole walkthrough, assuming you've never written code or opened a "terminal." If you can
      run a Discord server and follow numbered steps, you can do this. Read it once before you touch anything.</p>
    <div class="hero-cta">
      <a class="hero-btn hero-btn-primary" href="#steps">Start the walkthrough</a>
      <a class="hero-btn hero-btn-secondary" href="/product">What is mustr? &rarr;</a>
    </div>
    <div class="hero-chips">
      <span class="hero-chip"><b>~45 min,</b><span class="u">once</span></span>
      <span class="hero-chip"><b>No coding</b></span>
      <span class="hero-chip"><b>~$10/yr</b><span class="u">domain — the only cost</span></span>
      <span class="hero-chip"><b>~$0</b><span class="u">to host</span></span>
    </div>
  </section>
</div>

<div class="wrap">

  <h2 id="fit">First: is this actually for you?</h2>
  <p class="section-lede">Let's save us both some time. mustr is self-hosted — a nerdy way of saying <em>you</em> run it,
    on <em>your</em> account, and nobody sends you a bill or a support email. Including me. That's the deal, and it's a
    good one, but it means the setup is on you.</p>
  <div class="card accent">
    <h3>The honest bar</h3>
    <ul class="checklist">
      <li>You'll spend <b>about 45 minutes</b>, once.</li>
      <li>You'll buy a <b>domain name</b> — roughly <b>$10–15 a year</b>, the only guaranteed cost (any credit or debit card works).</li>
      <li>You'll do a lot of <b>clicking buttons and pasting values I hand you</b>. No coding.</li>
      <li>If a step doesn't work, you'll <b>re-read the step</b> — there's no me to message. I've tried to make that rare. I'm also an optimist.</li>
    </ul>
    <p class="small">If that sounds fine, you're exactly who this is for. If "buy a domain and paste some settings"
      already sounds like a bad afternoon, mustr honestly might not be your fit — and that's okay. No hard feelings.</p>
  </div>

  <h2 id="need">What you'll need before you start</h2>
  <p class="section-lede">Grab these first so you're not stopping halfway.</p>
  <ul class="checklist">
    <li>A <b>Discord server</b> you own or admin — the one mustr will be the website for.</li>
    <li>A <b>Cloudflare account</b> (free — we make it in Step 2 if you don't have one).</li>
    <li>A <b>credit or debit card</b> to buy the domain name.</li>
    <li><b>45 minutes</b> and a cup of something.</li>
  </ul>
  <p class="small muted">Notably <b>not</b> on the list: a server to rent, a monthly subscription, or any software to
    install on your computer. mustr lives entirely on Cloudflare's free tier. Want the receipts on "it's free"? That's
    what the <a href="/about">cost &amp; legal breakdown</a> is for.</p>

  <h2 id="picture">The 30-second picture</h2>
  <p class="section-lede">You'll end up with four things talking to each other. You don't need to understand them deeply
    — just know the names so the steps make sense.</p>
  <div class="picture">
    <div class="pic"><span class="n">1</span><b>A domain</b><p>Your address on the internet, like <code>yourclan.gg</code>. You rent it yearly from a registrar.</p></div>
    <div class="pic"><span class="n">2</span><b>Cloudflare</b><p>The free service that actually runs mustr and holds your data. The landlord and the building.</p></div>
    <div class="pic"><span class="n">3</span><b>A Discord app</b><p>A little robot ID so mustr can read your server's roles and post events. Not your server — an ID card mustr wears.</p></div>
    <div class="pic"><span class="n">4</span><b>mustr itself</b><p>The website, running on Cloudflare, wearing that ID card, reachable at your domain.</p></div>
  </div>
  <p class="small muted">Order: domain → Cloudflare → Discord ID → put mustr on Cloudflare → hand it the ID → point the
    domain at it → flip it on with the setup wizard. Every value you copy, I'll tell you where it goes — and the wizard
    at the end literally prints the URLs you need.</p>

  <h2 id="steps">The walkthrough</h2>

  <div class="step">
    <div class="step-num">1</div>
    <div class="step-body">
      <h3>Get a domain name</h3>
      <p>A domain is the <code>something.gg</code> people type to reach you. You <b>rent</b> it, yearly, from a company
        called a <em>registrar</em>.</p>
      <ol>
        <li>Buy a domain from a registrar. <b>Any reputable one works.</b> If you'd like a suggestion, I used
          <a href="https://porkbun.com" target="_blank" rel="noopener noreferrer">Porkbun</a> for mustr.gg and it was
          painless — no upsells, honest pricing. To be clear: I'm not affiliated with them, I earn nothing if you use
          them, and I can't help you with anything on their end. It's just where I had a good experience.</li>
        <li>Choose a name that's short and yours. <code>.gg</code> is popular with gaming groups; a plain <code>.com</code> is never wrong.</li>
        <li>Pay for it. You do <b>not</b> need the add-ons they'll upsell — no "web hosting," no "site builder," no "email hosting." mustr is your hosting.</li>
      </ol>
      <div class="note warn"><span class="lbl">Resist the checkout upsell.</span> You'll be tempted to buy hosting or a
        site builder. Don't. You already have all of that coming, for free.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num">2</div>
    <div class="step-body">
      <h3>Make a Cloudflare account and add your domain</h3>
      <p>Cloudflare is the free service that runs mustr. Already have an account? Skip to sub-step 2.</p>
      <ol>
        <li><b>Sign up</b> for a free Cloudflare account and confirm your email.</li>
        <li>Find <b>"Add a domain"</b> (sometimes "Add a site") and type the domain you just bought.</li>
        <li>Cloudflare gives you <b>two "nameservers"</b> — they look like <code>something.ns.cloudflare.com</code>. Copy them.</li>
        <li>Go <b>back to your registrar</b>, find the <b>"Nameservers"</b> setting (often under DNS), and replace what's there with Cloudflare's two.</li>
        <li>Return to Cloudflare and let it check. This handoff takes anywhere from a few minutes to a few hours — normal, and out of everyone's hands. It'll email you when it's ready.</li>
      </ol>
      <div class="note"><span class="lbl">Plain English:</span> you just told the internet "Cloudflare is in charge of my domain now." That's all nameservers do.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num">3</div>
    <div class="step-body">
      <h3>Create your Discord application (mustr's ID card)</h3>
      <p>The fiddliest part — go slow. You're making a robot identity mustr wears to talk to your server. <b>Keep a
        notepad open</b>; you'll paste these values in Step 5.</p>
      <ol>
        <li>In Discord's <b>Developer Portal</b>, click <b>"New Application."</b> Name it anything (your clan + "site" is fine).</li>
        <li>On the main page, copy two values to your notepad: <b>Application ID</b> (a.k.a. Client ID) and <b>Public Key</b>.</li>
        <li>Open <b>"OAuth2"</b> and copy the <b>Client Secret</b> (you may have to "Reset Secret" to reveal one). Treat it like a password.</li>
        <li>Open <b>"Bot,"</b> add a bot if prompted, then <b>"Reset Token"</b> and copy the <b>Bot Token</b>. Also a password.</li>
        <li>Still in <b>Bot</b>, turn <b>ON</b> the <b>"Server Members Intent"</b> toggle. mustr needs it to see who's in your server. Leave the others off.</li>
        <li>Get your <b>Server ID</b>: in Discord (not the portal), enable Developer Mode (User Settings → Advanced), then right-click your server icon → <b>"Copy Server ID."</b></li>
      </ol>
      <p>By the end your notepad has <b>five things</b>: Application ID, Public Key, Client Secret, Bot Token, Server ID.
        Don't invite the bot yet — it has nothing to join until mustr is running.</p>
      <div class="note tip"><span class="lbl">Two URLs you'll need soon.</span> The portal also wants a "redirect URL" and
        an "interactions endpoint URL." <b>Don't guess them.</b> The setup wizard (Step 7) shows you the exact ones and
        where they go. We'll come back here then.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num">4</div>
    <div class="step-body">
      <h3>Put mustr on Cloudflare</h3>
      <p>This is the one step that depends on how you got your copy of mustr — and for the 2026 launch I'm finalizing the
        smoothest version of it (aiming for a near one-click "Deploy to Cloudflare").</p>
      <div class="note warn"><span class="lbl">For now, this one's hands-on with me.</span> Until the one-click deploy is
        locked, hop into the Discord and I'll walk you through putting mustr on your Cloudflare — it's a short, guided set
        of clicks, no terminal. When it's done you'll have mustr running at a temporary Cloudflare address (something like
        <code>mustr.your-name.workers.dev</code>) that we make pretty in Step 6.
        <a class="dbtn" href="https://discord.gg/abtYKysKw" target="_blank" rel="noopener noreferrer">Join the Discord &rarr;</a></div>
    </div>
  </div>

  <div class="step">
    <div class="step-num">5</div>
    <div class="step-body">
      <h3>Hand mustr its settings</h3>
      <p>Give mustr the five values from Step 3, plus one you invent here. These are labeled boxes — "secrets" and
        "variables" — inside your mustr app's settings on Cloudflare. Paste each value into the matching box:</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Box name</th><th>What you paste</th></tr></thead>
        <tbody>
          <tr><td><code>DISCORD_CLIENT_ID</code></td><td>Application ID</td></tr>
          <tr><td><code>DISCORD_PUBLIC_KEY</code></td><td>Public Key</td></tr>
          <tr><td><code>DISCORD_CLIENT_SECRET</code></td><td>Client Secret</td></tr>
          <tr><td><code>DISCORD_BOT_TOKEN</code></td><td>Bot Token</td></tr>
          <tr><td><code>DISCORD_GUILD_ID</code></td><td>Server ID</td></tr>
          <tr><td><code>SITE_URL</code></td><td>your domain, like <code>https://yourclan.gg</code></td></tr>
          <tr><td><code>SITE_NAME</code></td><td>your clan / community name</td></tr>
          <tr><td><code>SETUP_TOKEN</code></td><td><b>A password you invent</b> — long, random, just for you. It unlocks the one-time setup wizard. Keep it for Step 7.</td></tr>
        </tbody>
      </table></div>
      <div class="note"><span class="lbl">Why the SETUP_TOKEN?</span> So that on the day your site first goes live, a random
        passer-by can't beat you to the "I'm the owner" button. You type it once, claim ownership, and never need it again.</div>
    </div>
  </div>

  <div class="step">
    <div class="step-num">6</div>
    <div class="step-body">
      <h3>Point your domain at mustr</h3>
      <p>Right now mustr answers at that temporary <code>…workers.dev</code> address. This step attaches <b>your</b>
        domain so people reach it at <code>yourclan.gg</code> instead.</p>
      <div class="note warn"><span class="lbl">Pairs with Step 4 — I'll do this with you.</span> In Cloudflare it's a
        "custom domain" setting on your app: a couple of clicks, no DNS knowledge needed (Cloudflare already runs your
        domain from Step 2). We'll finish it together in the Discord until the deploy flow is one-click.
        <a class="dbtn" href="https://discord.gg/abtYKysKw" target="_blank" rel="noopener noreferrer">Join the Discord &rarr;</a></div>
      <p>When it's done, open your domain in a browser. You should see mustr's <b>setup wizard</b> waiting. On to the fun part.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-num">7</div>
    <div class="step-body">
      <h3>Turn it on: the setup wizard</h3>
      <p>Where it all comes together — and mustr does the hand-holding from here.</p>
      <ol>
        <li>Visit your domain. You'll get a <b>"Let's set up mustr"</b> screen.</li>
        <li><b>Unlock:</b> paste the <code>SETUP_TOKEN</code> you invented in Step 5. This proves you're the owner. (It also quietly builds your database the first time — nothing for you to do.)</li>
        <li><b>Identity:</b> confirm your site name and Discord details. This screen <b>shows you the redirect URL and
          interactions URL</b> — that loose end from Step 3. Copy each, paste them where the screen tells you in the
          Developer Portal (it names the exact field), then come back. Use the <b>"Check my Discord settings"</b> button —
          green means good; if not, it tells you which value is off.</li>
        <li><b>Claim ownership:</b> click <b>"Sign in with Discord."</b> Because you're holding the keys, mustr makes
          <em>you</em> the top-rank owner with full control. Then the wizard locks itself forever — there's no take-backs
          button, so it's just you now.</li>
      </ol>
      <p>That's it. You're the owner of a live mustr site.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-num">8</div>
    <div class="step-body">
      <h3>Your first hour as an owner</h3>
      <p>You're in. A sane order to get your community actually using it:</p>
      <ol>
        <li><b>Invite the bot to your server.</b> <em>Now</em> it has somewhere to go — Settings &rarr; Identity &amp; Discord gives you a ready-made invite that asks for <strong>only</strong> the handful of permissions mustr actually uses (never Administrator). Got members wary of bots? Point them at <a href="/bot">the plain-English rundown</a> of exactly what it can and can't do.</li>
        <li><b>Set your look:</b> Admin → Theme &amp; Branding. Logo, colors. Ten minutes here makes it feel like <em>yours</em>, not mine.</li>
        <li><b>Build your ranks</b> to match how your group works: Admin → Ranks &amp; Roles. Line them up with your Discord roles so the two-way sync has something to sync.</li>
        <li><b>Make your home page:</b> Admin → Pages. Drag the blocks, write a welcome.</li>
        <li><b>Tell your members to sign in</b> with Discord. If they're in your server, they're in. No new passwords for anyone.</li>
      </ol>
    </div>
  </div>

  <h2 id="clean-break">And now, the clean break</h2>
  <p class="section-lede">The unusual part, and I want to be straight about it.</p>
  <div class="card accent">
    <p><b>After this, you own it outright and I'm out of the picture.</b> No subscription, no license server phoning home,
      no account with me, no support desk. Your mustr runs on your Cloudflare, with your data, under your control. If
      Cloudflare's free tier keeps doing what it's done for years, it keeps costing you nothing but the domain renewal.</p>
    <p>That independence is the whole point — nobody can rug-pull a site that only depends on <em>your</em> accounts. The
      flip side is the one from the top: when something confuses you, the answer is this guide and your own tinkering,
      not a ticket to me.</p>
    <p class="muted">I built it to not need me. Go run your clan.</p>
  </div>

  <h2 id="glossary">Quick glossary</h2>
  <p class="section-lede">For when a word looks scary.</p>
  <div class="glossary">
    <div class="gterm"><b>Domain / registrar</b> — <span>your web address, and the company you rent it from.</span></div>
    <div class="gterm"><b>Cloudflare</b> — <span>the free service that runs mustr and stores your data.</span></div>
    <div class="gterm"><b>Worker</b> — <span>Cloudflare's name for a running app. mustr <em>is</em> a Worker.</span></div>
    <div class="gterm"><b>D1 / R2</b> — <span>Cloudflare's free database and file storage. Your roster lives in D1; images in R2. You never touch these directly.</span></div>
    <div class="gterm"><b>Nameservers</b> — <span>the setting that says "Cloudflare is in charge of my domain."</span></div>
    <div class="gterm"><b>Discord app / bot</b> — <span>the ID card mustr wears to talk to your server.</span></div>
    <div class="gterm"><b>Client Secret / Bot Token</b> — <span>passwords for that ID card. Guard them.</span></div>
    <div class="gterm"><b>SETUP_TOKEN</b> — <span>a one-time password <em>you</em> invent to claim ownership on day one.</span></div>
    <div class="gterm"><b>Secrets / variables</b> — <span>labeled boxes on Cloudflare where you paste those values.</span></div>
  </div>

  <h2 id="trouble">If something's stuck</h2>
  <ul class="trouble">
    <li><b>My domain doesn't load mustr yet.</b><span>Step 2's nameserver handoff can take a few hours. If Cloudflare hasn't emailed you that it's active, it's still cooking.</span></li>
    <li><b>The wizard says my Discord settings are wrong.</b><span>You almost certainly pasted one of the five values into the wrong box, or missed the redirect/interactions URLs in Step 7. Re-check against your notepad.</span></li>
    <li><b>I can't sign in / it says I'm not in the server.</b><span>Sign in with the Discord account that's actually a member of the server you set as <code>DISCORD_GUILD_ID</code>.</span></li>
    <li><b>The bot isn't responding to buttons.</b><span>Make sure you pasted the interactions URL the wizard gave you into the Developer Portal, and that the bot is invited (Step 8).</span></li>
    <li><b>"Server Members Intent" nag.</b><span>Go back to Step 3, sub-step 5, and flip that toggle on.</span></li>
  </ul>

  <div class="cta-band">
    <h2>Stuck, or ready to get deployed?</h2>
    <p class="section-lede" style="margin-inline:auto">Hop in the Discord — for the 2026 launch I'm getting people set up personally.</p>
    <a class="cta-btn" href="https://discord.gg/abtYKysKw" target="_blank" rel="noopener noreferrer">Join the Discord</a>
  </div>
</div>

<footer class="foot"><div class="row">
  <a href="/">Home</a>
  <a href="/product">Product</a>
  <a href="/about">Cost &amp; legal</a>
  <a href="/legal">Legal</a>
  <span style="margin-left:auto">© ${new Date().getFullYear()} mustr</span>
</div></footer>
</body>
</html>`;
}
