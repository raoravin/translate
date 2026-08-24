// Plain index of the endpoints this service exposes. The service is
// API-only — this page exists so hitting the root gives something useful
// instead of a 404.
const ENDPOINTS = [
  ['GET', '/api/health', 'Liveness + DB/API-key configuration check'],
  ['GET', '/api/constitution-of-india/hierarchy', 'Parts / Schedules / Appendix / Amendments tree'],
  ['GET', '/api/constitution-of-india/entries', 'Entry list for a parent (cached titles only)'],
  ['GET', '/api/constitution-of-india/entries/[id]', 'Single entry, translated on demand'],
  ['GET', '/api/bare-acts/sections', 'Bare-act section list (cached titles only)'],
  ['GET', '/api/bare-acts/sections/[id]', 'Single bare-act section, translated on demand'],
  ['GET', '/api/bare-acts/subordinate-sections', 'Subordinate section list (cached titles only)'],
  ['GET', '/api/bare-acts/subordinate-sections/[id]', 'Single subordinate section, translated on demand'],
  ['GET', '/api/v2/posts/[slug]', 'News post, translated on demand'],
]

export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 900 }}>
      <h1>Courtbook Translate</h1>
      <p>
        Translation service for Courtbook legal content. Pass <code>?tr=&lt;lang&gt;</code> on
        the content endpoints (<code>?lang=</code> on the hierarchy endpoint).
      </p>
      <table cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {ENDPOINTS.map(([method, path, desc]) => (
            <tr key={path} style={{ borderTop: '1px solid #ddd' }}>
              <td><code>{method}</code></td>
              <td><code>{path}</code></td>
              <td>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
