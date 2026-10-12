import Link from "next/link";
import { Suspense } from "react";
import { HubDiscovery } from "@/components/HubDiscovery";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
export const metadata = { title: "ZeroHub" };
export default function Hub() {
  return <>
    <PageHeader active="ZeroHub" />
    <main id="page-content" tabIndex={-1} className="reading">
      <div className="intro">
        <p className="eyebrow">ZeroHub</p>
        <h1>One useful piece.<br />Share it with others.</h1>
        <p className="lead">Small Java libraries you can use, understand and improve.</p>
      </div>
      <Suspense fallback={<p role="status">Loading libraries…</p>}><HubDiscovery /></Suspense>
      <details className="reading-section">
        <summary><h2>Use a library in your app</h2><Icon name="chevron-down" /></summary>
        <div className="reading-section-body">
          <p>Open Use this component on a card. Add its exact dependency to your app’s pom.xml, then use the shown Java import and example.</p>
          <p>Related components share one library dependency. Your Java stays editable, updates are explicit, and Revert restores your previous library version.</p>
          <Link href="/learn#downloads">Get Zero</Link>
        </div>
      </details>
      <details className="reading-section">
        <summary><h2>Share a library</h2><Icon name="chevron-down" /></summary>
        <div className="reading-section-body">
          <p>When uploads are open, sign in with GitHub, reserve a library and download its editable project. Edit ordinary Java in VS Code, then upload the folder for automatic checks.</p>
          <p>A passing release is listed with its contributor, exact version, API and preview. Failed checks show what to fix. Published versions stay unchanged; upload a new version for later improvements.</p>
          <p>The first libraries are self-contained JavaFX widgets with a public view() method, API notes, an MIT license, a PNG preview, a behavior check and two consumer examples. Coursework repository links still go separately to Pika.</p>
          <div className="resource-links"><Link href="/tutorials/11">Sharing lesson</Link><Link href="/docs/components">Library guide</Link></div>
        </div>
      </details>
    </main>
  </>;
}
