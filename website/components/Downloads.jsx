import { DownloadIcon } from "./Brand";
import { downloadHref, downloadableKit, macDownloadHref, release, installer } from "@/lib/content";
export function Downloads() {
  const kit = downloadableKit();
  const mac = macDownloadHref();
  return (
    <section className="download-section" id="downloads">
      <h2>Get Zero</h2>
      {mac ? (
        <p>Zero Setup {installer.kitVersion} for Mac{installer.publication.status === 'local' ? ' is available in this local preview and has not been publicly released.' : ' is available as a signed and notarized download.'}</p>
      ) : kit?.publication.status === 'published' ? (
        <p>
          Zero {kit.kitVersion} is available as a verified, versioned
          release.
        </p>
      ) : kit ? (
        <p>
          This local preview offers the packaged Zero {kit.kitVersion} kit.
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
        <p>Open Zero Setup and choose Set up Zero. Setup uses ~/Zero and automatically prepares Java and a separate editor configuration. If Zero is already there, confirm the update; your work is kept. Wait for the progress message, then choose Open Zero and Run App. GitHub sign-in can wait until sharing.</p>
      </>}
      {!mac && kit && (
        <a className="button primary compact" href={downloadHref()}>
          <DownloadIcon />
          Download Zero {kit.kitVersion}
        </a>
      )}
      <details>
        <summary>Other downloads</summary>
        {kit ? (
          <ul>
            {mac && <li><a href={downloadHref()}>Complete kit ZIP {kit.kitVersion} — Windows, Linux or manual setup</a></li>}
            {["starter", "extension"].map((key) => (
              <li key={key}>
                <a href={downloadHref(key)}>{kit.assets[key].label} {kit.kitVersion}</a>
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
