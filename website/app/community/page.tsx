import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
export const metadata = { title: "Community" };
export default function Community() {
  return (
    <>
      <PageHeader active="Community" />
      <main id="page-content" tabIndex={-1} className="reading">
        <div className="intro">
          <p className="eyebrow">Zero Community</p>
          <h1>
            Small components.
            <br />
            Shared learning.
          </h1>
          <p className="lead">
            Build a useful Java library, explain it clearly, and help the next
            person make something.
          </p>
        </div>
        <p className="community-links">
          <a href="https://github.com/codepetca/zero-community">
            Community source
          </a>{" "}
          ·{" "}
          <a href="https://github.com/codepetca/zero-community/blob/main/docs/CONTRIBUTING.md">
            Contribution guide
          </a>
        </p>
        <p className="community-availability">
          Experimental local tooling. Public Maven artifacts and a hosted
          catalog are not available.
        </p>
        <details className="reading-section">
          <summary>
            <h2>The community starts with source</h2>
            <Icon name="chevron-down" />
          </summary>
          <div className="reading-section-body">
            <p>
              <a href="https://github.com/codepetca/zero-community">
                codepetca/zero-community
              </a>{" "}
              is the public source home for the experimental component workflow.
              It contains the HealthBar example, contribution guidance and
              admission checks.
            </p>
            <p>
              GitHub hosts source. Generated Maven artifacts and the component
              catalog remain local. There is no live catalog service or public
              Maven repository to browse here.
            </p>
            <a
              className="button secondary compact"
              href="https://github.com/codepetca/zero-community"
            >
              Visit Zero Community
            </a>
          </div>
        </details>
        <details className="reading-section">
          <summary>
            <h2>Make one understandable thing</h2>
            <Icon name="chevron-down" />
          </summary>
          <div className="reading-section-body">
            <p>
              A component is an ordinary Java library with a pinned Maven
              version. Start with a small helper or control, document its API
              and prove it works in more than one app. Your app keeps ownership
              of its state and explicitly calls its objects’ methods.
            </p>
            <p>
              Read the community’s{" "}
              <a href="https://github.com/codepetca/zero-community/blob/main/docs/CONTRIBUTING.md">
                contribution guide
              </a>{" "}
              before proposing a change. Automated checks validate evidence;
              they do not grant publication or approval.
            </p>
          </div>
        </details>
        <details className="reading-section">
          <summary>
            <h2>Try the Component Workshop</h2>
            <Icon name="chevron-down" />
          </summary>
          <div className="reading-section-body">
            <p>
              The local Workshop opens native JavaFX previews, lets you change
              trusted Java source, and exports a contribution packet. Candidate
              builds execute Java with normal local permissions; this is not a
              sandbox for untrusted submissions.
            </p>
            <p>
              Install, update and revert use normal Maven dependencies. There is
              no component base class or automatic object lifecycle.
            </p>
            <div className="resource-links">
              <Link href="/docs/workshop">Workshop guide</Link>
              <Link href="/docs/components">Component architecture</Link>
              <Link href="/docs/development">Local development commands</Link>
              <Link href="/learn#downloads">Kit availability</Link>
            </div>
          </div>
        </details>
        <details className="reading-section">
          <summary>
            <h2>Experimental, with clear limits</h2>
            <Icon name="chevron-down" />
          </summary>
          <div className="reading-section-body">
            <p>
              Original Zero and Zero Community code use the MIT license; bundled
              dependencies retain their own notices. Community examples remain
              experimental; artifact hosting and appointed maintainers remain
              future decisions. HealthBar is an experimental example, not a
              community-approved release. Advisory AI is not configured as a
              live service.
            </p>
            <p>
              <a href="https://github.com/codepetca/zero">Zero source</a> ·{" "}
              <a href="https://github.com/codepetca/zero-community">
                Community source
              </a>{" "}
              · <Link href="/learn">Back to setup</Link>
            </p>
          </div>
        </details>
      </main>
    </>
  );
}
