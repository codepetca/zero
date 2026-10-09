import type { Metadata } from "next";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
export const metadata: Metadata = {
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
