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
        <h1>A library of components</h1>
        <p className="lead">Created by you</p>
      </div>
      <Suspense fallback={<p role="status">Loading libraries…</p>}><HubDiscovery /></Suspense>
      <details className="reading-section">
        <summary><h2>Use a library in your app</h2><Icon name="chevron-down" /></summary>
        <div className="reading-section-body">
          <p>Automatic library setup is coming in the next Zero update.</p>
          <p>In that version, open Zero’s (…) menu → Browse ZeroHub. Choose a component, select Add library, then Apply. Zero takes care of the library setup.</p>
          <p>Use the component’s Java example, then choose Run App. You choose when to Update; Revert returns to your previous version.</p>
          <details>
            <summary>Using a current Zero download?</summary>
            <p>Current downloads need manual library setup. Follow the <Link href="/docs/components#manual-setup-for-current-downloads">manual setup guide</Link>, or wait for the update.</p>
          </details>
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
