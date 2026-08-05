# ClanTek API

The same JSON API that powers the web app also powers native/mobile clients.
Every endpoint lives under `/api` on the site's origin
(`https://clantek.919gaming.com`) and returns JSON.

- **Base URL:** `https://clantek.919gaming.com/api`
- **Content type:** `application/json`
- **Contract version:** `GET /api/version` → `{ "apiVersion": 1, ... }`. `apiVersion`
  is bumped only on a breaking change to the shapes documented here.

## Authentication

Two credential kinds resolve to the exact same identity and permissions:

| Credential | How it's sent | Who uses it |
| --- | --- | --- |
| Web session | `ct_session` httpOnly cookie | the browser app |
| Personal access token | `Authorization: Bearer clt_…` | native/mobile apps, scripts |

A native app authenticates with a **personal access token**. The member creates
one in the web app under **Account → API access** (top-right menu → Settings).
The raw token (`clt_…`) is shown **once**, on creation — store it securely; only
its name and a short prefix are visible afterward. A token:

- carries exactly that member's permissions (it is not scoped down),
- expires one year after creation,
- can be revoked any time from the same screen (a lost device → revoke).

```http
GET /api/me HTTP/1.1
Host: clantek.919gaming.com
Authorization: Bearer clt_ab12cd...your...token
```

There is no login-with-token endpoint by design: tokens are minted by a signed-in
member in the browser, not exchanged from credentials. (A future release may add a
Discord-OAuth deep-link handoff so the app can mint one without copy/paste.)

### Errors

Failures return an HTTP status and `{ "error": "message" }`. Common cases:

- `401 { "error": "Authentication required" }` — missing/invalid/expired token.
- `403 { "error": "Forbidden", "missing": "<permission>" }` — authenticated but
  lacking the required permission.

## Identity

### `GET /api/me`

Who the token belongs to. `authKind` is `"token"` for bearer auth, `"web"` for a
cookie, or `null` if unauthenticated.

```json
{
  "viewer": {
    "id": 12,
    "discordId": "…",
    "username": "…",
    "displayName": "…",
    "avatar": "…",
    "isGod": false,
    "rank": { "id": 3, "name": "Sergeant", "sortOrder": 30 },
    "roles": [{ "id": 2, "name": "Member", "color": "#c0392b" }],
    "permissions": ["roster.view", "events.view"]
  },
  "siteName": "ClanTek",
  "authKind": "token"
}
```

The `permissions` array is the union across the member's roles; `isGod: true`
bypasses all permission checks. Gate app UI on `permissions`, exactly as the web
app does.

## Token management

All under `/api/auth/tokens`. **Minting and revoking require a web session**
(so a leaked token can't spawn or revoke siblings); listing works with either.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/auth/tokens` | The caller's tokens (never the secret). |
| `POST` | `/api/auth/tokens` | Body `{ "label": "My iPhone" }`. Returns the raw `token` **once**. Web session only. |
| `DELETE` | `/api/auth/tokens/:id` | Revoke one of your own. Web session only. |

## Content endpoints

Reads are available to any authenticated member unless a permission is noted.
Shapes below are the fields a client relies on (others may be present).

| Endpoint | Returns |
| --- | --- |
| `GET /api/version` | `{ apiVersion, service, siteName }` — public. |
| `GET /api/members?limit=&offset=` | `{ members: Member[], total }` |
| `GET /api/members/:id` | a single member |
| `GET /api/news` | `{ posts: NewsPost[] }` |
| `GET /api/news/:slug` | a single post |
| `GET /api/events` | `{ events: Event[] }` (requires `events.view`) |
| `GET /api/medals` | `{ medals: [...] }` |
| `GET /api/warrecords` | `{ warRecords: [...] }` |
| `GET /api/games` | `{ games: [...] }` |
| `GET /api/pages/nav` | custom pages in the top nav: `{ pages: [{ slug, title }] }` |
| `GET /api/pages/:slug` | a page's portable layout (see below) |

Media referenced by these (`/media/…`) is served from the same origin.

### Pages — portable layout JSON

`GET /api/pages/:slug` (e.g. `home`, or a custom page's slug) returns a layout a
native client can render with the same data the web app uses:

```json
{
  "slug": "home",
  "title": "Home",
  "exists": true,
  "layout": {
    "version": 1,
    "rows": [
      {
        "id": "r-home",
        "columns": [
          {
            "id": "c-left",
            "span": 5,
            "modules": [
              { "id": "m-roster", "type": "roster", "config": { "title": "Roster", "limit": 12 } }
            ]
          }
        ]
      }
    ]
  }
}
```

- A row is a set of **columns** on a 12-unit grid (`span` = units, desktop); a
  native client collapses columns to a single stack on a narrow screen.
- Each column holds ordered **modules**. `type` is one of: `heading`, `text`,
  `html`, `image`, `button`, `embed`, `divider`, `news`, `roster`, `events`,
  `medals`, `warrecords`, `games`. Data modules (news/roster/…) fetch their own
  data from the endpoints above; content modules render from `config`.
- A module may carry `visibleToRole` (a role id) — render it only if the viewer
  holds that role. The canonical type definitions live in
  `src/shared/layout.ts`.

## Versioning & stability

Treat `apiVersion` as the contract. Additive changes (new fields, new module
types, new endpoints) will **not** bump it; a client should ignore unknown fields
and module types it doesn't understand. A breaking change bumps `apiVersion` and
is announced here.
