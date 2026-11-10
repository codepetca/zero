import type { Metadata } from "next";
import "./globals.css";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { workosConfigured } from "@/lib/workos-config.mjs";
import DocsLocationTracker from "@/components/DocsLocationTracker";
import { productDescription } from "@/lib/product-copy.mjs";
export const metadata: Metadata = {
  metadataBase: new URL("https://zero.codepet.ca"),
  icons: {
    apple: [{ url: "/generated/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    siteName: "Zero",
    images: [{ url: "/generated/brand/share.png", width: 1200, height: 630, alt: "Zero" }],
  },
  twitter: { card: "summary_large_image", images: ["/generated/brand/share.png"] },
  title: { default: "zero", template: "zero" },
  description: productDescription,
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link id="zero-favicon" rel="icon" href="/generated/brand/favicon.svg" type="image/svg+xml" sizes="any" />
      </head>
      <body>
        <a className="skip-link" href="#page-content">
          Skip to content
        </a>
        <DocsLocationTracker />
        {workosConfigured() ? <AuthKitProvider>{children}</AuthKitProvider> : children}
      </body>
    </html>
  );
}
