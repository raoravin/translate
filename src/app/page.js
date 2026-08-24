// The service is API-only — this page exists so hitting the root gives
// something useful instead of a 404.
export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 760, lineHeight: 1.6 }}>
      <h1>Courtbook Translate</h1>
      <p>
        Google Translate proxy for Courtbook. Holds the Google Cloud Translation
        API key and the Indian legal abbreviation handling; callers keep their
        own content, models and translation caches.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>POST /api/translate</code> — batch translate (bearer token required)</li>
        <li><code>GET /api/health</code> — configuration check</li>
      </ul>
      <pre style={{ background: '#f4f4f5', padding: '1rem', overflowX: 'auto', borderRadius: 6 }}>
{`POST /api/translate
Authorization: Bearer <TRANSLATE_API_SECRET>

{ "q": ["<p>Hello</p>"], "target": "hi", "source": "en", "format": "html" }

-> { "success": true, "translations": ["<p>नमस्ते</p>"] }`}
      </pre>
    </main>
  )
}
