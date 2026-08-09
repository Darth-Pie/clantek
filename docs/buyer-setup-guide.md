# Setting up mustr — the no-jargon guide

*This is the walkthrough for getting your own copy of mustr running. It assumes
you've never written code and never opened a "terminal." If you can run a Discord
server and follow numbered steps, you can do this. Written to be read start to
finish once before you touch anything.*

> **Draft note (not for buyers):** Step 4 (Deploy) and Step 6 (Point your domain)
> are written against a **placeholder** deploy method — we finalize those two once
> the delivery mechanism is locked. Everything else is final-draft copy in the
> real voice. Screenshots/gifs get added per step later.

---

## First: is this actually for you?

Let's save us both some time. mustr is **self-hosted**, which is a nerdy way of
saying *you* run it, on *your* account, and nobody sends you a bill or a support
email — including me. That's the deal, and it's a good deal, but it means the
setup is on you.

Here's the honest bar:

- You'll spend **about 45 minutes**, once.
- You'll need a **credit or debit card** to buy a domain name (roughly **$10–15 a year** — that's the only guaranteed cost).
- You'll do a lot of **clicking buttons and pasting values I hand you**. No coding.
- If a step doesn't work, you'll **re-read the step** rather than message me, because there's no me to message. (I've tried to make that rare. I'm also an optimist.)

If that sounds fine — great, you're exactly who this is for. If "buy a domain and
paste some settings" already sounds like a bad afternoon, mustr honestly might not
be your fit, and that's okay. No hard feelings.

Still here? Let's go.

---

## What you'll need before you start

Grab these first so you're not stopping halfway:

- [ ] A **Discord server** you own (or admin) — the one mustr will be the website for.
- [ ] A **Cloudflare account** (free — we make it in Step 2 if you don't have one).
- [ ] A **credit or debit card** to buy the domain name.
- [ ] **45 minutes** and a cup of something.

That's the whole shopping list. Notably **not** on it: a server to rent, a monthly
subscription, or any software to install on your computer. mustr lives entirely on
Cloudflare's free tier. (If you want the receipts on the "it's free" claim, that's
what the cost & terms brief is for.)

---

## The 30-second picture of what we're building

You're going to end up with four things talking to each other. You don't need to
understand them deeply — just know the names so the steps make sense:

1. **A domain** — your address on the internet, like `yourclan.gg`. You rent it from a registrar.
2. **Cloudflare** — the free service that actually *runs* mustr and holds your data. Think "the landlord and the building."
3. **A Discord application** — a little robot identity so mustr can read your server's roles and post events. This is *not* the same as your server; it's an ID card mustr wears.
4. **mustr itself** — the website, running on Cloudflare, wearing that Discord ID card, reachable at your domain.

The order we'll do it in: domain → Cloudflare → Discord ID → put mustr on Cloudflare
→ hand it the ID → point the domain at it → flip it on with the setup wizard.

Every value you need to copy, I'll tell you exactly where it goes. When in doubt,
**the setup wizard at the end literally prints the URLs you need and where to paste
them** — so don't panic if a term looks unfamiliar now.

---

## Step 1 — Get a domain name

A domain is the `something.com` (or `.gg`, or `.org`) people type to reach you.
You **rent** it, yearly, from a company called a *registrar*.

1. Buy a domain from a registrar. **Any reputable one works.** If you'd like a
   suggestion, I used [Porkbun](https://porkbun.com) for mustr.gg and it was
   painless — no upsells, honest pricing. To be clear: I'm not affiliated with
   them, I earn nothing if you use them, and I can't help you with anything on
   their end. It's just where I had a good experience.
2. Choose a name that's short and yours. `.gg` is popular with gaming groups; a
   plain `.com` is never wrong.
3. Pay for it. You do **not** need any add-ons they upsell you — no "web hosting,"
   no "website builder," no "email hosting." Just the domain. mustr is your hosting.

> **What you now have:** a domain name you own. Write it down. That's the only thing
> you needed money for.

**Do NOT** buy hosting, a "site builder," or a "business email" package. You'll be
tempted at checkout. Resist. You already have all of that coming for free.

---

## Step 2 — Make a Cloudflare account and add your domain

Cloudflare is the free service that runs mustr. If you already have an account, skip
to step 2 below.

1. Go to Cloudflare's site and **sign up** for a free account. Confirm your email.
2. Once you're in, find **"Add a domain"** (sometimes "Add a site"). Type the
   domain you just bought.
3. Cloudflare will give you **two "nameservers"** — they look like
   `something.ns.cloudflare.com`. Copy them.
4. Go **back to your registrar** (from Step 1), find the setting called
   **"Nameservers"** (often under DNS settings), and replace what's there with the
   two Cloudflare gave you.
5. Come back to Cloudflare and let it check. This handoff can take anywhere from a
   few minutes to a few hours — that's normal and out of everyone's hands. Grab a
   refill. It'll email you when it's ready.

> **Plain English:** you just told the internet "Cloudflare is in charge of my
> domain now." That's what nameservers do.

---

## Step 3 — Create your Discord application (mustr's ID card)

This is the fiddliest part, so go slow. You're making a robot identity that mustr
wears to talk to your Discord server. You'll collect a few values here and paste
them in Step 5 — **keep a notepad open.**

1. Go to Discord's **Developer Portal** and click **"New Application."** Name it
   whatever (your clan name + "site" is fine). This name is mostly for you.
2. On the application's main page, find and copy two values into your notepad:
   - **Application ID** (also called Client ID)
   - **Public Key**
3. Open the **"OAuth2"** section. Copy the **Client Secret** (you may have to click
   "Reset Secret" to reveal one). Treat this like a password — paste it in your
   notepad, don't share it.
4. Open the **"Bot"** section. Click to add a bot if prompted, then **"Reset
   Token"** and copy the **Bot Token**. Also a password. Same drill.
5. Still in **Bot**, turn **ON** the toggle called **"Server Members Intent."**
   mustr needs it to see who's in your server. (Leave the others off.)
6. Last value: your **Server ID**. In Discord itself (not the portal), turn on
   Developer Mode (User Settings → Advanced), then right-click your server's icon →
   **"Copy Server ID."** Paste it in your notepad.

By the end your notepad should have **five things**: Application ID, Public Key,
Client Secret, Bot Token, Server ID. Don't invite the bot yet — it has nothing to
join until mustr is running.

> **Two URLs you'll need soon:** the Developer Portal also asks for a "redirect URL"
> and an "interactions endpoint URL." **Don't guess them.** The mustr setup wizard
> (Step 7) shows you the exact ones to copy and tells you where they go. We'll come
> back here then.

---

## Step 4 — Put mustr on Cloudflare

> **⚠️ Placeholder — final steps pending the deploy method.**
>
> This is the one step that changes depending on how we ship mustr to you. It'll be
> one of:
>
> - **The easy way:** a single **"Deploy to Cloudflare"** button. You click it,
>   sign into Cloudflare, and it sets up the app, the database, and the file storage
>   for you. Two or three clicks.
> - **The guided way:** a short numbered list of clicks inside the Cloudflare
>   dashboard to create the app and its storage — still no terminal, just more steps.
>
> Either way, when this step is done you'll have **mustr running at a temporary
> Cloudflare address** (something like `mustr.your-name.workers.dev`) that we make
> pretty in Step 6. Hang tight — this section gets its real instructions and
> screenshots once the method is locked.

---

## Step 5 — Hand mustr its settings

Now we give mustr the five values from Step 3, plus one we invent here. These are
called **"secrets" and "variables"** — just labeled boxes you paste values into,
inside your mustr app's settings on Cloudflare.

Paste each notepad value into the matching box:

| Box name | What you paste |
|---|---|
| `DISCORD_CLIENT_ID` | Application ID |
| `DISCORD_PUBLIC_KEY` | Public Key |
| `DISCORD_CLIENT_SECRET` | Client Secret |
| `DISCORD_BOT_TOKEN` | Bot Token |
| `DISCORD_GUILD_ID` | Server ID |
| `SITE_URL` | your domain, like `https://yourclan.gg` |
| `SITE_NAME` | your clan/community name |

And one you make up right now:

| Box name | What you paste |
|---|---|
| `SETUP_TOKEN` | **A password you invent** — long, random, just for you. This is the key that unlocks the one-time setup wizard. Keep it for Step 7, then it's done its job. |

> **Why the SETUP_TOKEN?** So that on the day your site first goes live, a random
> passer-by can't beat you to the "I'm the owner" button. You'll type this token
> once, claim ownership, and never need it again.

*(The exact place these boxes live is part of Step 4's method — it'll be pointed
out there. If you took the "Deploy to Cloudflare" path, it may even ask you for
these during the deploy.)*

---

## Step 6 — Point your domain at mustr

> **⚠️ Placeholder — pairs with Step 4.**
>
> Right now mustr answers at that temporary `…workers.dev` address. This step
> attaches **your** domain to it, so people reach it at `yourclan.gg` instead.
>
> In Cloudflare this is a "custom domain" setting on your app — a couple of clicks,
> no DNS knowledge required, because Cloudflare already runs your domain (Step 2).
> Real instructions land here alongside Step 4.

When this is done, open your domain in a browser. You should see mustr's **setup
wizard** waiting. On to the fun part.

---

## Step 7 — Turn it on: the setup wizard

This is where it all comes together, and mustr does the hand-holding from here.

1. Visit your domain. You'll get a **"Let's set up mustr"** screen.
2. **Unlock:** paste the `SETUP_TOKEN` you invented in Step 5. This proves you're
   the owner. (It also quietly builds your database the first time — you don't have
   to do anything.)
3. **Identity:** confirm your site name and Discord details. This screen **shows you
   two or three URLs to copy** — the redirect URL and the interactions URL from that
   loose end back in Step 3.
   - Copy each one, go to the Discord Developer Portal, and paste them where the
     screen tells you (it names the exact field). Then come back.
   - There's a **"Check my Discord settings"** button — use it. Green means you're
     good; if not, it tells you which value is off.
4. **Claim ownership:** click **"Sign in with Discord."** Because you're the one
   holding the keys, mustr makes *you* the top-rank owner with full control. The
   setup wizard then locks itself forever — there's no take-backs button, so it's
   just you now.

That's it. You're the owner of a live mustr site.

---

## Step 8 — First hour as an owner

You're in. A short, sane order to get your community actually using it:

1. **Invite the bot to your server.** *Now* it has somewhere to go. (mustr shows you
   the invite link in the admin area — it's pre-set with the right permissions.)
2. **Set your look:** Admin → Theme & Branding. Upload a logo, pick colors. Ten
   minutes here makes it feel like *yours*, not mine.
3. **Build your ranks** to match how your group actually works: Admin → Ranks &
   Roles. Line them up with your Discord roles so the two-way sync has something to
   sync.
4. **Make your home page:** Admin → Pages. Drag the blocks around, write a welcome.
5. **Tell your members to sign in.** They click "Sign in with Discord" on your new
   site; if they're in your server, they're in. No new passwords for anyone.

Poke around the rest of the admin at your own pace. Nothing there bites.

---

## And now, the clean break

Here's the part I want to be straight about, because it's unusual.

**After this, you own it outright and I'm out of the picture.** No subscription, no
license server phoning home, no account with me, no support desk. Your mustr runs on
your Cloudflare, with your data, under your control. If Cloudflare's free tier keeps
doing what it does today (and it's been generous for years), it keeps costing you
nothing but the domain renewal.

That independence is the whole point — nobody can rug-pull a site that only depends
on *your* accounts. The flip side is the one I already warned you about up top:
when something confuses you, the answer is this guide and your own tinkering, not a
ticket to me.

I built it to not need me. Go run your clan.

---

## Quick glossary (for when a word looks scary)

- **Domain / registrar** — your web address, and the company you rent it from.
- **Cloudflare** — the free service that runs mustr and stores your data.
- **Worker** — Cloudflare's name for a running app. mustr *is* a Worker.
- **D1 / R2** — Cloudflare's free database and file storage. Your roster lives in D1; uploaded images live in R2. You never touch these directly.
- **Nameservers** — the setting that says "Cloudflare is in charge of my domain."
- **Discord application / bot** — the ID card mustr wears to talk to your server.
- **Client Secret / Bot Token** — passwords for that ID card. Guard them.
- **SETUP_TOKEN** — a one-time password *you* invent to claim ownership on day one.
- **Secrets / variables** — labeled boxes on Cloudflare where you paste those values.

---

## If something's stuck (the short list)

- **"My domain doesn't load mustr yet."** Step 2's nameserver handoff can take a few
  hours. If Cloudflare hasn't emailed you that it's active, it's still cooking.
- **"The wizard says my Discord settings are wrong."** You almost certainly pasted
  one of the five values into the wrong box, or missed the redirect/interactions URLs
  in Step 7. Re-check those against your notepad.
- **"I can't sign in / it says I'm not in the server."** Sign in with the Discord
  account that's actually a member of the server you set as `DISCORD_GUILD_ID`.
- **"The bot isn't responding to buttons."** Make sure you pasted the interactions
  URL the wizard gave you into the Developer Portal, and that the bot is invited
  (Step 8).
- **"Server Members Intent" nag.** Go back to Step 3.5 and flip that toggle on.
