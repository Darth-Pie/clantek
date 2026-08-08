/**
 * The public "About / honest hosting" marketing page served at mustr.gg/about.
 *
 * First-party, self-contained HTML (its own inline CSS + a small inline JS
 * calculator). It is NOT part of the sellable product surface — it's mustr.gg
 * marketing, the same way the /legal page is mustr.gg-only. A buyer's deployment
 * simply doesn't route /about to this (see index.ts). Figures are verified against
 * Cloudflare's published pricing/terms (2026-08-08); sources are linked in-page.
 *
 * Keep it honest: every number here is defensible and the assumptions are shown.
 */

export function aboutPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>mustr — Honest hosting &amp; costs</title>
<meta name="description" content="How mustr runs on Cloudflare's free tier, what could ever cost money, and the terms-of-service facts — with a live estimator." />
<style>
  :root{
    --bg:#0b0e14; --panel:#121722; --panel2:#0f1420; --text:#e6e9ef; --muted:#9aa4b2;
    --border:#232b3a; --accent:#6ea8fe; --accent2:#8b5cf6; --good:#22c55e; --warn:#f59e0b; --bad:#ef4444;
    --radius:14px;
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
  header.top .row{ max-width:860px; margin:0 auto; padding:.7rem 1.1rem; display:flex; align-items:center; justify-content:space-between; }
  .brand{ font-weight:800; letter-spacing:.02em; color:var(--text); text-decoration:none; font-size:1.15rem; }
  .brand span{ color:var(--accent); }
  .backlink{ color:var(--muted); text-decoration:none; font-size:.9rem; }
  .hero{ padding:3rem 0 1.5rem; }
  .eyebrow{ text-transform:uppercase; letter-spacing:.12em; font-size:.72rem; color:var(--accent); font-weight:700; }
  h1{ font-size:2.1rem; line-height:1.15; margin:.5rem 0 .6rem; }
  h2{ font-size:1.4rem; margin:2.4rem 0 .8rem; }
  h3{ margin:1.4rem 0 .4rem; }
  .lede{ font-size:1.12rem; color:var(--muted); }
  .card{ background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); padding:1.4rem; margin:1.2rem 0; }
  .callout{ background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 12%,transparent),transparent);
    border:1px solid color-mix(in srgb,var(--accent) 35%,transparent); }
  .muted{ color:var(--muted); }
  .small{ font-size:.85rem; }
  table{ width:100%; border-collapse:collapse; margin:.5rem 0; font-size:.93rem; }
  th,td{ text-align:left; padding:.55rem .5rem; border-bottom:1px solid var(--border); vertical-align:top; }
  th{ color:var(--muted); font-weight:600; }
  code{ background:var(--panel2); padding:.08rem .35rem; border-radius:6px; font-size:.9em; }
  /* Calculator */
  .calc{ display:grid; gap:1rem; }
  .calc-inputs{ display:grid; gap:1rem; grid-template-columns:1fr 1fr; }
  @media (max-width:560px){ .calc-inputs{ grid-template-columns:1fr; } }
  .field label{ display:block; font-weight:600; margin-bottom:.25rem; }
  .field .hint{ color:var(--muted); font-size:.8rem; margin-top:.2rem; }
  .field input[type=number]{ width:100%; padding:.6rem .7rem; border-radius:10px; border:1px solid var(--border);
    background:var(--panel2); color:var(--text); font-size:1rem; }
  .adv summary{ cursor:pointer; color:var(--muted); font-size:.85rem; }
  .adv input[type=number]{ max-width:8rem; }
  .result{ background:var(--panel2); border:1px solid var(--border); border-radius:12px; padding:1.1rem; }
  .verdict{ font-size:1.15rem; font-weight:700; margin-bottom:.8rem; display:flex; gap:.5rem; align-items:baseline; flex-wrap:wrap; }
  .verdict .price{ font-weight:800; }
  .ok{ color:var(--good); } .over{ color:var(--warn); }
  .meter{ margin:.7rem 0; }
  .meter .lab{ display:flex; justify-content:space-between; font-size:.85rem; margin-bottom:.25rem; }
  .bar{ height:10px; border-radius:999px; background:var(--border); overflow:hidden; }
  .bar > span{ display:block; height:100%; background:var(--good); border-radius:999px; transition:width .25s ease,background .25s ease; }
  ul.tight{ margin:.3rem 0 .3rem 1.1rem; padding:0; }
  ul.tight li{ margin:.25rem 0; }
  .src a{ display:block; margin:.25rem 0; }
  .disclaimer{ font-size:.82rem; color:var(--muted); border-top:1px solid var(--border); margin-top:2.5rem; padding-top:1.2rem; }
  footer.foot{ border-top:1px solid var(--border); margin-top:2rem; }
  footer.foot .row{ max-width:860px; margin:0 auto; padding:1.2rem 1.1rem; display:flex; gap:1rem; flex-wrap:wrap; color:var(--muted); font-size:.9rem; }
  footer.foot a{ color:var(--muted); }
</style>
</head>
<body>
<header class="top"><div class="row">
  <a class="brand" href="/">mu<span>str</span></a>
  <a class="backlink" href="/">&larr; Back to mustr</a>
</div></header>

<div class="wrap">
  <section class="hero">
    <div class="eyebrow">Honest hosting</div>
    <h1>mustr runs on Cloudflare's free tier — here's the real math.</h1>
    <p class="lede">No fine-print surprises. Below is exactly what mustr uses, what could ever cost you money,
      what Cloudflare's terms actually say, and a quick estimator for <em>your</em> community.</p>
  </section>

  <div class="card callout">
    <strong>The bottom line.</strong> A mustr instance fits comfortably inside Cloudflare's free allowances.
    The only guaranteed cost to run it is a <strong>domain name</strong> (bought from a registrar, not Cloudflare).
    You'd only ever pay Cloudflare if you <em>choose</em> the flat <strong>$5/month</strong> plan — and the single
    metric that even slowly creeps toward a limit is stored images, whose free ceiling is <strong>10&nbsp;GB</strong>
    (thousands of pictures).
  </div>

  <h2>Estimate your situation</h2>
  <div class="card">
    <div class="calc">
      <div class="calc-inputs">
        <div class="field">
          <label for="members">Members in your org</label>
          <input id="members" type="number" min="0" step="10" value="75" inputmode="numeric" />
          <div class="hint">Roster size — profiles, ranks, roles, medals.</div>
        </div>
        <div class="field">
          <label for="images">Uploaded images</label>
          <input id="images" type="number" min="0" step="25" value="300" inputmode="numeric" />
          <div class="hint">Avatars, medal &amp; rank art, event banners, gallery photos. (Videos are embedded from YouTube — they cost nothing.)</div>
        </div>
      </div>
      <details class="adv">
        <summary>Advanced assumptions</summary>
        <div style="margin-top:.6rem; display:flex; gap:1.4rem; flex-wrap:wrap;">
          <div class="field"><label for="avg">Avg image size (MB)</label>
            <input id="avg" type="number" min="0.05" max="1" step="0.05" value="0.4" />
            <div class="hint">mustr caps uploads at 1&nbsp;MB.</div></div>
          <div class="field"><label for="perMember">DB per member (KB)</label>
            <input id="perMember" type="number" min="1" step="1" value="15" />
            <div class="hint">A generous estimate.</div></div>
        </div>
      </details>

      <div class="result" id="result" aria-live="polite"><!-- filled by JS --></div>
      <p class="small muted">Estimates, not a quote — real usage varies. Requests and database reads scale with live
        traffic and stay far below the free limits for a single community; the numbers above focus on the two things
        that actually accumulate: stored images (R2) and database size (D1).</p>
    </div>
  </div>

  <h2>The free-tier ceilings</h2>
  <div class="card">
    <table>
      <thead><tr><th>Service</th><th>What mustr uses it for</th><th>Free allowance</th></tr></thead>
      <tbody>
        <tr><td><strong>Workers</strong></td><td>Every page &amp; API request; scheduled sync jobs</td><td>100,000 requests/day; static assets free &amp; unlimited</td></tr>
        <tr><td><strong>D1</strong> (database)</td><td>Roster, events, news, training, settings</td><td>5&nbsp;GB; 5,000,000 row-reads/day; 100,000 row-writes/day</td></tr>
        <tr><td><strong>R2</strong> (media)</td><td>Uploaded images</td><td>10&nbsp;GB storage; <strong>egress always free</strong></td></tr>
      </tbody>
    </table>
    <p class="small muted">Verified against Cloudflare's pricing pages on 2026-08-08 (linked below).</p>
  </div>

  <h2>What could actually make you pay</h2>
  <div class="card">
    <ul class="tight">
      <li><strong>Stored images pass 10&nbsp;GB</strong> — from years of accumulated uploads. Overage is
        <code>$0.015 / GB-month</code> (an 11th gigabyte ≈ 1.5¢/month). Bandwidth to view them is always free.</li>
      <li><strong>You choose the Workers Paid plan</strong> — a flat <code>$5/month</code>, entirely optional. It raises every
        limit enormously (10M requests/month, 25&nbsp;<em>billion</em> DB row-reads/month, and so on).</li>
      <li><strong>Extreme traffic</strong> — sustained &gt;100,000 requests/day (a very large or bot-hammered site) would
        exhaust the free Workers request budget.</li>
    </ul>
    <p class="muted">None of these are reachable by a normal community. The one unavoidable cost is a
      <strong>domain name</strong> from a registrar — price depends on the extension (a <code>.com</code> is typically ~$10/year;
      premium ones like <code>.gg</code> cost more). Pointing its DNS at Cloudflare is free.</p>
  </div>

  <h2>Is it legal? (What Cloudflare's terms actually say)</h2>
  <div class="card">
    <p>Yes — and Cloudflare rewrote the relevant rule in 2023 to make this kind of use plainly allowed.</p>
    <h3>The clause people remember — old "Section 2.8"</h3>
    <p>Cloudflare's agreement once limited the service to serving "HTML" and discouraged a "disproportionate" amount of
      images/audio/video. <strong>On May 16, 2023 Cloudflare removed that construct</strong> — in their words they "got rid of
      the antiquated HTML vs. non-HTML construct" and moved the limit to a <strong>CDN-only</strong> section. They stated
      customers "can serve video and other large files using the CDN so long as that content is hosted by a Cloudflare
      service like Stream, Images, or <strong>R2</strong>," and that "this restriction only applies to use of our CDN."</p>
    <h3>Why mustr is clearly within the rules</h3>
    <ul class="tight">
      <li><strong>Images live in R2</strong> — Cloudflare's own object-storage product, built to store and serve files.</li>
      <li><strong>The app runs on Workers</strong> — the intended way to run an application on Cloudflare.</li>
      <li><strong>No self-hosted video</strong> — the only remaining content limit (video must be on Stream) doesn't apply, because mustr embeds all video from YouTube and stores none.</li>
      <li><strong>The free tiers are official, documented offerings</strong> — using them, including for a business, is ordinary and expected.</li>
    </ul>
    <h3>One caveat: payments on a free-plan site</h3>
    <p>Cloudflare's terms restrict <strong>collecting credit-card information on a web property receiving Free Services</strong>.
      mustr collects no payment data, so an ordinary install is compliant. If you later add paid memberships, use a
      <strong>hosted checkout</strong> (Stripe, PayPal) where cards are entered on the processor's page — the standard, compliant
      approach — rather than collecting card details on the site itself.</p>
  </div>

  <h2>Sources</h2>
  <div class="card src">
    <a href="https://developers.cloudflare.com/workers/platform/pricing/" target="_blank" rel="noopener noreferrer">Cloudflare Workers pricing &amp; free limits &nearr;</a>
    <a href="https://developers.cloudflare.com/d1/platform/pricing/" target="_blank" rel="noopener noreferrer">Cloudflare D1 pricing &amp; free limits &nearr;</a>
    <a href="https://developers.cloudflare.com/r2/pricing/" target="_blank" rel="noopener noreferrer">Cloudflare R2 pricing (egress free) &nearr;</a>
    <a href="https://www.cloudflare.com/terms/" target="_blank" rel="noopener noreferrer">Cloudflare Self-Serve Subscription Agreement &nearr;</a>
    <a href="https://blog.cloudflare.com/updated-tos" target="_blank" rel="noopener noreferrer">Cloudflare blog: "Updated Terms of Service" (May 16, 2023) &nearr;</a>
  </div>

  <p class="disclaimer">This page analyzes Cloudflare's published pricing and Terms of Service as of 2026-08-08 and
    reflects Cloudflare's own public statements about permitted use. It is <strong>not legal advice</strong> and is not a
    guarantee — Cloudflare can change its terms, and only a licensed attorney can give a binding opinion. For a
    definitive assurance, have counsel review Cloudflare's Subscription Agreement, Service-Specific Terms, and
    Acceptable Use Policy. mustr is an independent product and is not affiliated with or endorsed by Cloudflare.</p>
</div>

<footer class="foot"><div class="row">
  <a href="/">Home</a>
  <a href="/legal">Legal</a>
  <a href="/third-party-notices.txt">Open-Source Licenses</a>
  <span style="margin-left:auto">© ${new Date().getFullYear()} mustr</span>
</div></footer>

<script>
(function(){
  var R2_FREE_GB = 10, D1_FREE_GB = 5, R2_OVERAGE = 0.015;
  var el = function(id){ return document.getElementById(id); };
  function num(id, def){ var v = parseFloat(el(id).value); return isFinite(v) && v >= 0 ? v : def; }
  function fmt(n){ return n >= 100 ? Math.round(n).toLocaleString() : (Math.round(n*10)/10).toLocaleString(); }
  function meter(label, used, limit, unit){
    var pct = limit > 0 ? Math.min(100, used/limit*100) : 0;
    var color = pct < 75 ? 'var(--good)' : pct < 100 ? 'var(--warn)' : 'var(--bad)';
    return '<div class="meter"><div class="lab"><span>'+label+'</span><span>'+fmt(used)+' '+unit+' of '+limit+' '+unit+
      ' ('+ (pct<1?pct.toFixed(1):Math.round(pct)) +'%)</span></div><div class="bar"><span style="width:'+
      Math.max(pct,1.5)+'%;background:'+color+'"></span></div></div>';
  }
  function render(){
    var members = num('members',0), images = num('images',0), avg = num('avg',0.4), perKB = num('perMember',15);
    var r2gb = images * avg / 1024;
    var d1gb = members * perKB / (1024*1024);
    var over = Math.max(0, r2gb - R2_FREE_GB);
    var cost = over * R2_OVERAGE;
    var v;
    if (over <= 0){
      v = '<div class="verdict ok">✅ Comfortably in the free tier — <span class="price">$0/month</span> to Cloudflare (plus your domain).</div>';
    } else {
      v = '<div class="verdict over">⚠️ You\\'d pass the 10&nbsp;GB media free tier — about <span class="price">$'+
        (cost<0.01?'0.01':cost.toFixed(2))+'/month</span> for the extra storage. Everything else stays free.</div>';
    }
    el('result').innerHTML = v +
      meter('Media storage (R2)', r2gb, R2_FREE_GB, 'GB') +
      meter('Database size (D1)', d1gb, D1_FREE_GB, 'GB') +
      '<p class="small muted" style="margin:.6rem 0 0">At '+fmt(images)+' images (~'+avg+'&nbsp;MB each) and '+
      fmt(members)+' members. Daily requests &amp; database reads for a community this size stay well under the free limits.</p>';
  }
  ['members','images','avg','perMember'].forEach(function(id){
    el(id).addEventListener('input', render);
  });
  render();
})();
</script>
</body>
</html>`;
}
