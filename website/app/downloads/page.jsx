import { Downloads } from "@/components/Downloads";
import Link from "next/link";
import { downloadableKit, downloadableInstaller, macDownloadHref, windowsInstaller, windowsDownloadHref } from "@/lib/content";
import { LearnTheme } from "../learn/LearnTheme";
import "../../.generated/learn-theme.css";
import "../learn/learn.css";

export const metadata = { title: "Download Zero" };
export const dynamic = "force-dynamic";

export default function DownloadPage() {
  const kit = downloadableKit();
  const installer = downloadableInstaller();
  const mac = macDownloadHref();
  const windows = windowsDownloadHref();
  return (
    <LearnTheme active="Download">
      <main id="page-content" tabIndex={-1} className="hub downloads-page">
        <div className="hub-intro"><h1>Download Zero</h1></div>
        <Downloads />
        <div className="download-help">
          <p>{mac && installer && <>Mac {installer.kitVersion}: Apple Silicon, macOS {installer.asset.minimumOS}+.<br /></>}
            {windows && windowsInstaller ? <>Windows {windowsInstaller.kitVersion}: x64, Windows 10 (build 19041) or later.</> : kit && <>Windows {kit.kitVersion}: ZIP with manual setup.</>}</p>
          <Link href="/docs/setup">Installation steps and setup help</Link>
        </div>
      </main>
    </LearnTheme>
  );
}
