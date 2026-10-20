"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>zero</title>
        <link rel="icon" href="/generated/brand/favicon.svg" type="image/svg+xml" sizes="any" />
      </head>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", colorScheme: "light dark" }}>
        <main id="page-content" style={{ minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <h1>This page couldn’t load</h1>
            <button type="button" style={{ minHeight: 44, padding: "8px 16px" }} onClick={() => reset()}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
