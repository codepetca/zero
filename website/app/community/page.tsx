import Link from "next/link";
import { HubDiscovery } from "@/components/HubDiscovery";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { community, communityPreview, type CommunityComponent } from "@/lib/content";
import { discoveryGroups, recommendationFor, componentVersion } from "@/lib/community.mjs";
export const metadata = { title: "Community" };
export const dynamic = "force-dynamic";

type Entry = CommunityComponent & { localPreview?: boolean };
type Group = {id: string; name: string; components: Entry[]};
export default function Community() {
  const published = community.publication.status === "published";
  const groups = discoveryGroups(community) as Group[];
  for (const component of communityPreview?.components || []) {
    let group = groups.find(item => item.id === component.category);
    if (!group) {group = {id:component.category || "components", name:"Other components", components:[]}; groups.push(group);}
    group.components.push({...component, localPreview:true});
  }
  const current = (community.releases as Array<{version: string; sourceRevision: string; workshop?: unknown}>).find(item => item.version === community.latest);
  return (
    <>
      <PageHeader active="Community" />
      <main id="page-content" tabIndex={-1} className="reading">
        <div className="intro">
          <p className="eyebrow">Zero Community</p>
          <h1>One useful piece.<br />Make it better together.</h1>
          <p className="lead">Small Java components you can use, understand and improve.</p>
        </div>
        {process.env.ZERO_HUB_URL && <HubDiscovery />}
        {communityPreview && <p className="community-preview-note">Local preview: unpublished alternatives are shown below. Public downloads are unchanged.</p>}
        {!published && <p>Public downloads are being prepared.</p>}
        {groups.map(group => <section key={group.id} className="component-category" aria-labelledby={`category-${group.id}`}>
          <h2 id={`category-${group.id}`}>{group.name}</h2>
          <div className="component-choices">
            {group.components.map(component => {
              const recommendation = component.localPreview ? null : recommendationFor(community, component);
              const version = component.localPreview ? communityPreview?.version : componentVersion(community, component);
              const selected = community.releases.find(item => item.version === version);
              const simpleName = component.className.split(".").at(-1);
              const api = selected ? `https://github.com/codepetca/zero-community/blob/${selected.sourceRevision}/docs/${simpleName}.md` : null;
              return <article key={component.id} className="component-choice" aria-labelledby={`component-${component.id}`}>
                <div className="component-title"><h3 id={`component-${component.id}`}>{component.name}</h3>{recommendation && <span className="component-badge">Recommended · {recommendation.version}</span>}</div>
                <p>{component.description}</p>
                <p className="component-meta">{component.localPreview ? `Local ${version} · Unpublished` : `Version ${version}`} · Java 17 · MIT · Experimental</p>
                {recommendation && <p className="component-reason">{recommendation.reason}</p>}
                {(component.id === "health-bar" || component.id === "segmented-health-bar") && <div className="component-appearance" role="img" aria-label={`${component.name} example appearance: Health 75 of 100`}>
                  <span>Health: 75 / 100</span>
                  {component.id === "health-bar" ? <div className="plain-health-preview"><span /></div> : <div className="segmented-health-preview">{[0,1,2,3,4,5,6,7,8,9].map(index => <span key={index} className={index < 7 ? "filled" : index === 7 ? "partial" : ""} />)}</div>}
                </div>}
                {component.localPreview ? <details><summary>API &amp; example</summary><pre><code>{component.api.join("\n")}</code></pre><p>Use the prepared local catalog to Try or Add this alternative. It has no public download yet.</p></details> : <div className="resource-links">{api && <a href={api}>API &amp; examples</a>}</div>}
              </article>;
            })}
          </div>
        </section>)}
        {published && Boolean(current?.workshop) && <a className="button secondary compact" href="/community/workshop">Download Workshop</a>}
        <details className="reading-section">
          <summary><h2>Use it in your app</h2><Icon name="chevron-down" /></summary>
          <div className="reading-section-body">
            <p>In Zero, open the sidebar’s (…) menu → Browse components. Pick a component, Try the example, then choose Add library.</p>
            <p>The recommended choice is a starting point, not a required upgrade. Zero adds the exact version you select. Related components currently share one community library; adding a second component does not add another copy.</p>
            <p>Your Java stays editable. Updates are explicit; Revert restores your previous library version after an update. A recommendation changing never changes your installed version.</p>
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
            <p>Alternatives can coexist. Maintainers can recommend a specific version after checking it; recommendations do not grant contribution acceptance or move code into core. Core stays small, with stable APIs and clear teaching value.</p>
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
