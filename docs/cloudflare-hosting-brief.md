# mustr on Cloudflare — Cost & Terms-of-Service Brief

*Prepared 2026-08-08. Figures verified against Cloudflare's official pricing and
terms pages on that date (sources at the end). This is an analysis of Cloudflare's
published terms, **not legal advice** — see the disclaimer at the end.*

---

## Bottom line

**A mustr instance runs entirely inside Cloudflare's free tiers, and doing so is
consistent with Cloudflare's current Terms of Service.** The only guaranteed cost
to a host is a **domain name** (bought from a registrar, not Cloudflare). Every
other component — the app, database, file storage, scheduled jobs — has a free
allowance far above what a single gaming community will use.

You would only ever pay Cloudflare if you **deliberately opt in** to the $5/month
Workers Paid plan, and the only usage metric that realistically creeps toward a
limit over time is **stored media (R2)** — and its free ceiling is 10 GB, which is
thousands of images.

---

## Part 1 — What it costs

### The free-tier ceilings (verified 2026-08-08)

| Service | What mustr uses it for | Free allowance | Realistic use (one community) |
|---|---|---|---|
| **Workers** (the app) | Every page + API request | **100,000 requests/day**; 10 ms CPU per request | A few thousand/day — ~1–3% of the limit |
| **Workers — Cron Triggers** | Role-sync + tenure sweeps | Included on Free (same request budget) | 2 schedules; negligible |
| **Workers — Static Assets** | The React app's JS/CSS | **Free and unlimited** | n/a |
| **Workers Logs** | Observability | **200,000 events/day** (3-day retention) | Well under |
| **D1** (database) | Roster, events, news, training, etc. | **5 GB** storage; **5,000,000 row-reads/day**; **100,000 row-writes/day** | Megabytes of data; thousands of reads/day |
| **R2** (media) | Uploaded images (avatars, medals, event/gallery pictures) | **10 GB** storage; **1M** writes/mo; **10M** reads/mo; **egress always free** | The one that grows over time — see below |

**Note on video:** mustr never stores or serves video. All video is **embedded
from YouTube/Twitch/Vimeo** (and Google Slides for training), so it costs you
nothing and never touches your storage or bandwidth. This also matters for the
terms — see Part 2.

### The one metric that grows: R2 storage

Everything except stored media resets daily or monthly and scales with *live
traffic*, which for a clan site stays tiny. **Stored images accumulate** and don't
shrink on their own. But the free ceiling is **10 GB** — at typical web-image
sizes that's **thousands** of uploads. A normal community would take years to
approach it, if ever.

### What would actually make you pay

You cross into paid territory only in these cases:

1. **R2 storage passes 10 GB** — from years of accumulated uploads. Overage is
   **$0.015 per GB-month** (an 11th gigabyte costs ~1.5¢/month). Egress stays free.
2. **You choose the Workers Paid plan ($5/month flat)** — not forced; you'd do
   this for the higher limits or paid-only features. It raises every limit
   dramatically: 10M requests/month, 30M CPU-ms/month, 25 **billion** D1
   row-reads/month, etc.
3. **Extreme, unlikely traffic** — sustained >100k requests/day (roughly a very
   large or bot-hammered site) would exhaust the Workers free request budget.

**None of these are reachable by a normal community.** For context, the paid
plan's overages are tiny: D1 is $0.001 per million extra row-reads; Workers is
$0.30 per extra million requests.

### The only unavoidable cost: a domain

Cloudflare hosting is free; a **domain name is not**. You register it through a
registrar (Cloudflare Registrar, Namecheap, etc.) and renew it yearly. Price
depends entirely on the TLD — a `.com` is typically ~$10/year, while premium TLDs
like `.gg` run higher (often ~$40–70/year). Putting the domain's DNS on Cloudflare
(the "zone") is **free**.

---

## Part 2 — Is it legal? (Terms-of-Service compliance)

Short answer: **yes — Cloudflare's own current terms permit exactly this use**,
including commercial use, and Cloudflare publicly rewrote the relevant rule in
2023 specifically to make serving app content and files on its platform clearly
allowed.

### The history people worry about — old "Section 2.8"

For years Cloudflare's agreement had a **Section 2.8** limiting the service to
serving "HTML" content and prohibiting a "disproportionate" amount of images,
audio, or video. That's the clause that made people nervous about hosting an
image-heavy app for free.

**On May 16, 2023, Cloudflare removed that construct.** In their own words, they
"got rid of the antiquated HTML vs. non-HTML construct" and "moved the
content-based restriction concept to a new CDN-specific section." Crucially:

> "customers can serve video and other large files using the CDN so long as that
> content is hosted by a Cloudflare service like Stream, Images, or **R2**"

and they were explicit that **"this restriction only applies to use of our CDN"** —
i.e., to proxying files you host *somewhere else* through Cloudflare's cache. It
does **not** restrict content you store *in* Cloudflare's own products.

### Why mustr is clearly within the rules

- **Images are stored in R2** — Cloudflare's object-storage product, whose whole
  purpose is to store and serve files. Serving your avatars/medals/gallery images
  from R2 is the product working as intended, not a violation.
- **The app is served by Workers + Static Assets** — the intended way to run an
  application on Cloudflare.
- **No self-hosted video** — the one remaining content limit (video files must be
  on Stream, not the generic CDN) simply doesn't apply, because mustr embeds all
  video from YouTube et al. and stores none.
- **The free tiers are official, documented product offerings** with published
  limits — using them (including for a business) is ordinary and expected;
  countless commercial apps run on the Workers free tier.

### The one caveat worth knowing: payments on a Free-plan site

Cloudflare's Self-Serve Subscription Agreement restricts **processing or
collecting credit-card information on a web property receiving Free Services.**
mustr **collects no payment data**, so an ordinary install is compliant.

If you (or a buyer) later add **paid memberships or a store**, don't build
card-collection into the mustr site on the free plan. Use a **third-party hosted
checkout** (e.g. Stripe Checkout / PayPal), where the card data is entered on the
processor's own page — that keeps you compliant and is the standard approach
anyway. (Or move that property to a paid Cloudflare plan.)

### Acceptable Use

Cloudflare's Acceptable Use Policy prohibits the usual things (illegal content,
abuse, etc.). That's the **operator's** responsibility for what they publish — it
isn't triggered by running a community-management app.

---

## Part 3 — What you can tell a buyer

> **"mustr runs on Cloudflare's free tier. The only thing you have to pay for is a
> domain name (from a registrar of your choice). You will not owe Cloudflare
> anything unless your community grows large enough that you choose to upgrade —
> and even then it starts at $5/month."**

Two honest footnotes to include:
- *Media storage (uploaded images) is the one thing that grows over time; the free
  limit is 10 GB (thousands of images).*
- *If you add paid memberships, use a hosted checkout like Stripe rather than
  collecting card details on the site itself.*

The admin **Analytics & Usage** dashboard (Settings → Analytics) shows R2 and D1
storage against their free limits, plus — once a read-only Cloudflare Analytics
token is connected — live request/query rates and a 30-day trend, so a host can
watch the one metric that matters and see exactly where they sit.

---

## Sources (verified 2026-08-08)

- Workers pricing / free limits — https://developers.cloudflare.com/workers/platform/pricing/
- D1 pricing / free limits — https://developers.cloudflare.com/d1/platform/pricing/
- R2 pricing / free tier (egress free) — https://developers.cloudflare.com/r2/pricing/
- Cloudflare Self-Serve Subscription Agreement — https://www.cloudflare.com/terms/
- Cloudflare blog, "Updated Terms of Service" (May 16, 2023 — removal of the HTML/non-HTML §2.8, CDN-only content rule, R2/Stream/Images carve-out) — https://blog.cloudflare.com/updated-tos

---

## Disclaimer

This document analyzes Cloudflare's **published pricing and Terms of Service** as
of the date above and reflects Cloudflare's own public statements about permitted
use. It is **not legal advice**, and it cannot be a courtroom-grade guarantee —
Cloudflare can change its terms, and only a licensed attorney can give you a
binding legal opinion. For a definitive assurance, have counsel review the linked
Self-Serve Subscription Agreement, Service-Specific Terms, and Acceptable Use
Policy. Nothing here creates any relationship with, or commitment from, Cloudflare.
