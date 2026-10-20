import Link from "next/link";

export default function NotFound() {
  return (
    <main id="page-content" tabIndex={-1} style={{ minHeight: "80vh", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div>
        <h1>404</h1>
        <p>This page could not be found.</p>
        <Link href="/" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>Go home</Link>
      </div>
    </main>
  );
}
