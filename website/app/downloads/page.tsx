import { Downloads } from "@/components/Downloads";
import { localDownloadsEnabled } from "@/lib/release";
import { windowsPortablePilotHref } from "@/lib/windows-portable-pilot.mjs";
import pilot from "../../../release/windows-portable-pilot.json";
import { LearnTheme } from "../learn/LearnTheme";
import "../../.generated/learn-theme.css";
import "../learn/learn.css";

export const metadata = {
  title: { absolute: "Downloads | Zero" },
  description: "Get Zero for Mac Silicon or Windows and learn about the portable Windows school pilot.",
};
export const dynamic = "force-dynamic";

const pilotDownload = windowsPortablePilotHref(pilot);

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
          {pilotDownload ? (
            <>
              <p><a href={pilotDownload}>Download Zero Portable {pilot.kitVersion} (Windows x64 ZIP)</a></p>
              <p className="source-note">Unsigned pilot. The staging script downloads VS Code and the other tools before school IT copies the folder.</p>
            </>
          ) : localDownloadsEnabled() ? (
            <p><a href="/download/windows-portable">Download unsigned pilot ZIP (local preview)</a></p>
          ) : <p className="source-note">Currently in private testing.</p>}
          <p><a href="/teachers/pilot#portable-windows">School pilot setup and test steps</a></p>
        </section>
      </main>
    </LearnTheme>
  );
}
