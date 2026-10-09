import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { community } from "@/lib/content";
export const metadata = { title: "Community" };
export default function Community() {
  const published = community.publication.status === "published";
  const current = (community.releases as Array<{version: string; sourceRevision: string; workshop?: unknown}>).find(item => item.version === community.latest);
  const api = `https://github.com/codepetca/zero-community/blob/${current?.sourceRevision || "main"}/docs/HealthBar.md`;
  return (
    <>
      <PageHeader active="Community" />
      <main id="page-content" tabIndex={-1} className="reading">
        <div className="intro">
          <p className="eyebrow">Zero Community</p>
          <h1>One useful piece.<br />Make it better together.</h1>
          <p className="lead">Small Java components you can use, understand and improve.</p>
        </div>
        <h2>HealthBar</h2>
        <p>A label and progress bar for health or energy. Your app owns the value; HealthBar displays it.</p>
        <p>{published ? `Version ${community.latest} · Java 17 · MIT · Experimental` : "Public downloads are being prepared."}</p>
        <div className="resource-links">
          <a href={api}>API &amp; examples</a>
          {published && Boolean(current?.workshop) && <a className="button secondary compact" href="/community/workshop">Download Workshop</a>}
        </div>
        <details className="reading-section">
          <summary><h2>Use it in your app</h2><Icon name="chevron-down" /></summary>
          <div className="reading-section-body">
            <p>In Zero, open the sidebar’s (…) menu → Browse components → HealthBar. Try the example, then choose Add library.</p>
            <p>Zero adds an exact Maven version to your project. Your Java stays editable. Update is available when a later fix is published; Revert restores your previous version after an update.</p>
            <pre><code>{'import zero.community.HealthBar;\n\nHealthBar energy = new HealthBar("Energy", 100);\nenergy.setHealth(75);\n// Add energy.view() to your JavaFX layout.'}</code></pre>
            <Link href="/learn#downloads">Get Zero</Link>
          </div>
        </details>
        <details className="reading-section">
          <summary><h2>Improve it for others</h2><Icon name="chevron-down" /></summary>
          <div className="reading-section-body">
            <p>Download Workshop, extract it, and open its component-workshop folder in VS Code. Run it with the standard build shortcut.</p>
            <p>Edit the included community source, preview your change, run its checks and export a contribution packet. Fork Zero Community and open a pull request with your source change and packet.</p>
            <p>GitHub runs the checks. An existing repository maintainer reviews the exact change before acceptance. Contributions waiting for review stay unpublished. Coursework repository links still go separately to Pika.</p>
            <div className="resource-links">
              <a href="https://github.com/codepetca/zero-community/blob/main/docs/CONTRIBUTING.md">Contribution guide</a>
              <a href="https://github.com/codepetca/zero-community">Community source</a>
              <Link href="/docs/workshop">Workshop guide</Link>
            </div>
          </div>
        </details>
      </main>
    </>
  );
}
