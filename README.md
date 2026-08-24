# Courtbook Translate

Translation service extracted from the main Courtbook app. It serves Constitution
of India entries, bare-act sections, subordinate-legislation sections and news
posts in Indian languages, backed by the **Google Cloud Translation API (v2)**
with a MongoDB-backed translation cache.

**Endpoint paths and response shapes are identical to the main app's**, so
switching a client over is a host change only — no request or parsing changes.

## Endpoints

| Endpoint | Notes |
|---|---|
| `GET /api/health` | Liveness + config check |
| `GET /api/constitution-of-india/hierarchy` | `?lang=` (or `lang=all`), `type=`, `sections=false` |
| `GET /api/constitution-of-india/entries` | `?parent_id=` (required), `section_id=`, `tr=`, `page=`, `limit=` |
| `GET /api/constitution-of-india/entries/[id]` | `?tr=` |
| `GET /api/bare-acts/sections` | `?act_id=` (required), `chapter_id=`, `chapter_item_id=`, `query=`, `tr=` |
| `GET /api/bare-acts/sections/[id]` | `?tr=` |
| `GET /api/bare-acts/subordinate-sections` | `?subordinate_id=` (required), `tr=` |
| `GET /api/bare-acts/subordinate-sections/[id]` | `?tr=` |
| `GET /api/v2/posts/[slug]` | `?tr=` — slug, ObjectId or WordPress ID |

Languages: `en, hi, gu, mr, pa, bn, or, ta, te, kn, ml, ne` (anything else falls back to `en`).

Note the inconsistency carried over from the original app: the hierarchy
endpoint takes `?lang=`, every other endpoint takes `?tr=`.

## How translation resolves

**Detail endpoints** (`.../[id]`, `/api/v2/posts/[slug]`) resolve a non-English
language in three steps, reported back in the `source` field:

1. **Cache hit** in the relevant `*_translations` collection → served directly (`source: "cache"`).
2. **Cache miss** → translated at runtime via Google, written to the cache, served (`source: "runtime"`).
3. **Translation fails** → falls back to English (`source: "base"`).

Responses carry both `requested_lang` and the actually-served `lang`, so a
silent English fallback is always visible to the caller.

**List endpoints** never trigger runtime translation. They only overlay titles
already cached by the detail endpoints, and each item carries the `language` it
was actually served in.

Serving a cached translation stamps `last_read_at` with `timestamps: false`, so
a read never bumps `updatedAt` (which tracks content changes).

### Legal abbreviation expansion

Google Translate misreads Indian legal `X&Y` abbreviations as foreign entities —
`P&H High Court` comes back as "PH & Herzegovina High Court" in Hindi (confused
with B&H / Bosnia and Herzegovina). `src/lib/googleTranslate.js` expands these to
their full names *before* translation: `P&H`, `J&K`, `J&K&L`, `A&N`, `D&NH`.
Ambiguous two-letter initialisms like `SC`/`HC` are deliberately left alone
(SC = Supreme Court vs Scheduled Caste — context dependent).

Content is translated as HTML (`format: 'html'`) so markup survives untouched.
Posts are translated as one HTML blob rather than per Lexical text-leaf, because
translating leaves independently breaks sentences apart wherever a link or bold
span sits mid-sentence.

## Setup

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev            # http://localhost:3001
```

### Environment

| Variable | Purpose |
|---|---|
| `MONGO_URI` | **Same database as the main Courtbook app.** Reads the English source collections, owns the `*_translations` caches. |
| `GOOGLE_TRANSLATE_API_KEY` | Google Cloud Translation API key ("Cloud Translation API" must be enabled on the GCP project). |
| `ALLOWED_ORIGIN` | Origin allowed to call the API cross-origin. Defaults to `*`. |

> **Without `GOOGLE_TRANSLATE_API_KEY` every runtime translation fails and each
> endpoint silently falls back to English** (`source: "base"`). Cached
> translations still serve fine. `GET /api/health` reports whether the key is set.

## Collections

Owned by this service (translation caches, one doc per `(entity_id, lang)`):
`coi_translations`, `bareact_section_translations`,
`subordinate_section_translations`, `post_translations`.

Read-only English sources shared with the main app: `coi_entries`,
`coi_hierarchy`, `sections`, `subordinate_sections`, `posts`, `media`,
`categories`, `cms_users`, `tags`.

Because both apps share one database, the main app keeps working unchanged while
this service runs alongside it.

## Layout

```
src/
  app/api/…                 route handlers (paths mirror the main app exactly)
  config/mongodb.js         pooled connection used by model/index.js
  db/client.js              simple dbConnect used by the COI/bare-act routes
  lib/googleTranslate.js    Google Translate client + abbreviation expansion
  lib/coiTranslate.js       Constitution entry translator
  lib/bareActTranslate.js   bare-act / subordinate section translator
  lib/coi.js                language list, resolveLang, sorting helpers
  lib/bareActSectionSort.js Roman-numeral-aware section sorting
  lib/v2/lexicalToHtml.js   Payload Lexical → HTML
  model/…                   mongoose models (sources + translation caches)
  repositories-2/           post repository (lookups + recommendations)
```

There are two connection helpers because the original code had two: the news
route reaches Mongo through `config/mongodb.js` (connect-on-import, pooled),
while the COI and bare-act routes call `db/client.js` explicitly. Both share
mongoose's single global connection.
