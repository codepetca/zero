import { Downloads } from "@/components/Downloads";
import { localDownloadsEnabled } from "@/lib/release";
import { windowsPortablePilotHref } from "@/lib/windows-portable-pilot.mjs";
import { windowsPortableBundleHref } from "@/lib/windows-portable-bundle.mjs";
import bundle from "../../../release/windows-portable-bundle.json";
import { downloadableKit } from "@/lib/release";
import pilot from "../../../release/windows-portable-pilot.json";
import { LearnTheme } from "../learn/LearnTheme";
import "../../.generated/learn-theme.css";
import "../learn/learn.css";

export const metadata = {
  title: { absolute: "Downloads | Zero" },
  description: "Get Zero for Mac Silicon or Windows and learn about the portable Windows school pilot.",
};
export const dynamic = "force-dynamic";

const available = downloadableKit();
const bundleDownload = windowsPortableBundleHref(bundle, available?.publication.status === "published" ? available : undefined);
const sizeMB = (size: number) => `${(size / 1_000_000).toFixed(1)} MB`;
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
            For testing on a school desktop, choose the Windows x64 ZIP that fits your setup.
          </p>
          <p><a href={bundleDownload}>Complete ZIP {bundle.kitVersion} — VSCodium and tools included ({sizeMB(bundle.asset.size)})</a></p>
          <p className="source-note">Extract all files to an approved folder, then open Zero.exe.</p>
          {pilotDownload ? (
            <>
              <p><a href={pilotDownload}>Small setup ZIP {pilot.kitVersion} — downloads tools ({sizeMB(pilot.asset.size)})</a></p>
              <p className="source-note">For setup or school IT: extract all files, then run Stage-Tools.ps1 to download the tools before copying the folder.</p>
            </>
          ) : localDownloadsEnabled() ? (
            <p><a href="/download/windows-portable">Download unsigned pilot ZIP (local preview)</a></p>
          ) : <p className="source-note">Currently in private testing.</p>}
          <p className="source-note">These pilot downloads are unsigned and may be blocked by school policy. The first project build requires internet access.</p>
          <p><a href="/teachers/pilot#portable-windows">School pilot setup and test steps</a></p>
        </section>
      </main>
    </LearnTheme>
  );
}
