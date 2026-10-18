import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://zero.codepet.ca"),
  icons: {
    icon: [
      { url: "/generated/brand/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/generated/brand/zero-white-on-purple.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [{ url: "/generated/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    siteName: "Zero",
    images: [{ url: "/generated/brand/share.png", width: 1200, height: 630, alt: "Zero" }],
  },
  twitter: { card: "summary_large_image", images: ["/generated/brand/share.png"] },
  title: { default: "Zero — a simple Java kit", template: "%s — Zero" },
  description:
    "A simple kit for building Java apps. Ordinary Java, VS Code and a small JavaFX library.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#page-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
