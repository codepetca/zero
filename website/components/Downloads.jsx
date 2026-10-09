import { DownloadIcon } from "./Brand";
import { downloadHref, localDownloadsEnabled, release } from "@/lib/content";
export function Downloads() {
  const local = localDownloadsEnabled();
  const published = release.publication.status === "published";
  return (
    <section className="download-section" id="downloads">
      <h2>Get Zero</h2>
      {published ? (
        <p>
          Zero {release.kitVersion} is available as a verified, versioned
          release.
        </p>
      ) : local ? (
        <p>
          This local preview offers the packaged Zero {release.kitVersion} kit.
          Downloads are checked against the local release receipt; this version
          has not been publicly released.
        </p>
      ) : (
        <p>
          Zero {release.kitVersion} is being prepared locally. A public kit
          download is not available yet. This page will link to verified release
          files when publication is complete.
        </p>
      )}
      {(published || local) && (
        <a className="button primary compact" href={downloadHref()}>
          <DownloadIcon />
          Download Zero {release.kitVersion}
        </a>
      )}
      <details>
        <summary>Other downloads</summary>
        {published || local ? (
          <ul>
            {["starter", "extension"].map((key) => (
              <li key={key}>
                <a href={downloadHref(key)}>{release.assets[key].label}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            The starter and extension will be available separately with the
            published kit.
          </p>
        )}
        <p>
          <a href="https://github.com/codepetca/zero/releases">
            Previous releases on GitHub
          </a>
        </p>
      </details>
    </section>
  );
}
