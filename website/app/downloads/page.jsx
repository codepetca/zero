import { Downloads } from "@/components/Downloads";
import { LearnTheme } from "../learn/LearnTheme";
import "../../.generated/learn-theme.css";
import "../learn/learn.css";

export const metadata = { title: "Download Zero" };
export const dynamic = "force-dynamic";

export default function DownloadPage() {
  return (
    <LearnTheme active="Download">
      <main id="page-content" tabIndex={-1} className="hub downloads-page">
        <div className="hub-intro"><h1>Download Zero</h1></div>
        <Downloads />
      </main>
    </LearnTheme>
  );
}
