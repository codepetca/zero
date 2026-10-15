import { Downloads } from "@/components/Downloads";
import Link from "next/link";
import { downloadableKit, installer, macDownloadHref } from "@/lib/content";
import { LearnTheme } from "../learn/LearnTheme";
import "../../.generated/learn-theme.css";
import "../learn/learn.css";

export const metadata = { title: "Download Zero" };
export const dynamic = "force-dynamic";

export default function DownloadPage() {
  const kit = downloadableKit();
  const mac = macDownloadHref();
  return (
    <LearnTheme active="Download">
      <main id="page-content" tabIndex={-1} className="hub downloads-page">
        <div className="hub-intro"><h1>Download Zero</h1></div>
        <Downloads />
        <div className="download-help">
          <p>{mac && installer && <>Mac {installer.kitVersion}: Apple Silicon, macOS {installer.asset.minimumOS}+.<br /></>}
            {kit && <>Windows {kit.kitVersion}: ZIP with manual setup.</>}</p>
          <Link href="/docs/setup">Installation steps and setup help</Link>
          <p className="download-next"><Link href="/get-started#project">After installing: create your tutorial project</Link></p>
          <Link href="/get-started#github">New here? Start with GitHub setup</Link>
        </div>
      </main>
    </LearnTheme>
  );
}
