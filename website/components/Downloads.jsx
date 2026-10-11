import { DownloadIcon } from "./Brand";
import { downloadHref, macDownloadHref, localDownloadsEnabled, release, installer } from "@/lib/content";
export function Downloads() {
  const local = localDownloadsEnabled();
  const mac = macDownloadHref();
  const published = release.publication.status === "published";
  return (
    <section className="download-section" id="downloads">
      <h2>Get Zero</h2>
      {mac ? (
        <p>Zero Setup {release.kitVersion} for Mac{installer.publication.status === 'local' ? ' is available in this local preview and has not been publicly released.' : ' is available as a signed and notarized download.'}</p>
      ) : published ? (
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
      {mac && <>
        <a className="button primary compact" href={mac}><DownloadIcon />Download for Mac</a>
        <p>macOS 12 or later · Apple Silicon and Intel</p>
        <p>Open Zero Setup and choose a fresh project folder. Setup guides the Zero profile import and asks before installing editor support or opening official VS Code and Java downloads.</p>
      </>}
      {!mac && (published || local) && (
        <a className="button primary compact" href={downloadHref()}>
          <DownloadIcon />
          Download Zero {release.kitVersion}
        </a>
      )}
      <details>
        <summary>Other downloads</summary>
        {published || local ? (
          <ul>
            {mac && <li><a href={downloadHref()}>Complete kit ZIP — Windows, Linux or manual setup</a></li>}
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
