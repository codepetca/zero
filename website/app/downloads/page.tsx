import { Downloads } from "@/components/Downloads";
import { localDownloadsEnabled } from "@/lib/release";
import { LearnTheme } from "../learn/LearnTheme";
import "../../.generated/learn-theme.css";
import "../learn/learn.css";

export const metadata = {
  title: { absolute: "Downloads | Zero" },
  description: "Get Zero for Mac Silicon or Windows and learn about the portable Windows school pilot.",
};
export const dynamic = "force-dynamic";

export default function DownloadsPage() {
  return (
    <LearnTheme active="">
      <main id="page-content" tabIndex={-1} className="hub home-page">
        <div className="hub-intro">
          <h1>Downloads</h1>
        </div>
        <Downloads />
        <section className="download-section school-download" id="windows-portable" aria-labelledby="school-download-title">
          <h2 id="school-download-title">Windows portable pilot</h2>
          <p className="home-description">
            For testing on a school desktop. School IT stages the x64 package in an approved folder, and students open Zero.exe from that folder.
          </p>
          {localDownloadsEnabled()
            ? <p><a href="/download/windows-portable">Download unsigned pilot ZIP (local preview)</a></p>
            : <p className="source-note">Currently in private testing.</p>}
          <p><a href="/teachers/pilot#portable-windows">School pilot setup and test steps</a></p>
        </section>
      </main>
    </LearnTheme>
  );
}
