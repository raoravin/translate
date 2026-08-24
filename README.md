# Courtbook Translate

A small HTTP service that wraps the **Google Cloud Translation API (v2)**, split
out of the main Courtbook app so it can be deployed on its own domain.

It holds exactly two things:

1. The **Google Translate API key** and the call to Google.
2. The **Indian legal abbreviation handling** that has to run before translation.

Everything else stays in the main app: the content, the models, the
`*_translations` caches, and the logic deciding *when* to translate. This
service is stateless — no database, no caching, no knowledge of Courtbook's
domain objects.

```
courtbook (main app)                    translate (this service)
  routes, models, caches      ── HTTP ──▶  expand abbreviations
  decides when to translate                call Google
  stores the result                        return text
```

## API

### `POST /api/translate`

```http
POST /api/translate
Authorization: Bearer <TRANSLATE_API_SECRET>
Content-Type: application/json

{ "q": ["<p>P&H High Court</p>", ""], "target": "hi", "source": "en", "format": "html" }
```

```json
{ "success": true, "translations": ["<p>पंजाब और हरियाणा उच्च न्यायालय</p>", null] }
```

| Field | Required | Notes |
|---|---|---|
| `q` | yes | Array of strings, max 128 (Google's per-request cap). |
| `target` | yes | Target language code, e.g. `hi`. |
| `source` | no | Defaults to `en`. |
| `format` | no | `html` (default) or `text`. |

`translations` always has the **same length and ordering as `q`**. Entries that
were empty or not strings come back as `null`, so the caller can zip the result
straight back onto its original field positions. An all-empty `q` returns nulls
without calling Google at all.

| Status | Meaning |
|---|---|
| `200` | Translated. |
| `400` | Malformed body, bad `format`, missing `target`, or over 128 segments. |
| `401` | Missing or wrong bearer token. |
| `429` | Rate limited (120 requests/min per IP). |
| `502` | Google rejected the request or the API key is missing. |
| `503` | `TRANSLATE_API_SECRET` is not configured on the server. |

### `GET /api/health`

```json
{ "ok": true, "translate_key_configured": true, "api_secret_configured": true }
```

Returns `503` when either secret is missing. Worth wiring to your uptime check —
a missing Google key makes every call fail, which callers experience as a silent
fall back to untranslated text.

## Legal abbreviation expansion

Google Translate misreads Indian legal `X&Y` abbreviations as foreign entities —
`P&H High Court` comes back as "PH & Herzegovina High Court" in Hindi (confused
with B&H / Bosnia and Herzegovina). These are expanded to their full names
*before* translation, which gives the engine real context:

| Input | Expanded to |
|---|---|
| `P&H` | Punjab and Haryana |
| `J&K` | Jammu and Kashmir |
| `J&K&L` | Jammu, Kashmir and Ladakh |
| `A&N` | Andaman and Nicobar |
| `D&NH` | Dadra and Nagar Haveli |

`&amp;` is handled as well as `&`, since content is translated as HTML.
Ambiguous two-letter initialisms like `SC`/`HC` are deliberately **not**
expanded (SC = Supreme Court vs Scheduled Caste — context dependent).

## Setup

```bash
npm install
cp .env.example .env    # then fill in the values
npm run dev             # http://localhost:3001
```

| Variable | Purpose |
|---|---|
| `GOOGLE_TRANSLATE_API_KEY` | Google Cloud Translation API key. Enable "Cloud Translation API" on the GCP project. |
| `TRANSLATE_API_SECRET` | Shared secret callers send as `Authorization: Bearer <secret>`. Generate with `openssl rand -hex 32`. |
| `ALLOWED_ORIGIN` | Browser CORS origin. Defaults to `*`. Server-to-server callers ignore it. |

> **Never deploy without `TRANSLATE_API_SECRET`.** Every call costs money against
> your Google quota, so the endpoint must not be open to the internet. The
> service refuses to serve (`503`) when the secret is unset rather than running
> unauthenticated.

Restrict the Google API key itself too (GCP Console → Credentials → API
restrictions → Cloud Translation API only).

## Calling it from the main app

`src/lib/googleTranslate.js` in the main app is the client. It keeps the exact
signature the old direct-to-Google function had, so the callers
(`coiTranslate.js`, `bareActTranslate.js`, the news post route) were unchanged:

```js
const [title, content] = await translateTexts([title, content], 'hi')
```

It needs `TRANSLATE_API_URL` and `TRANSLATE_API_SECRET` in the main app's
environment, and throws on failure — which the existing callers already catch
and handle by falling back to English.
