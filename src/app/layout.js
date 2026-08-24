export const metadata = {
  title: 'Courtbook Translate',
  description: 'Translation service for Courtbook legal content.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
