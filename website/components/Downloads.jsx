import { DownloadIcon } from "./Brand";
import { downloadableInstaller, macDownloadHref } from "@/lib/release";

const WINDOWS_STORE_LISTING = 'https://apps.microsoft.com/detail/9mxkd6dqlfgx';

export function Downloads() {
  const installer = downloadableInstaller();
  const mac = macDownloadHref();
  return (
    <section className="download-section" id="downloads" aria-label="Downloads">
      <div className="hub-actions">
        {mac && <a className="button primary compact" href={mac}><DownloadIcon />Install for Mac Silicon{installer.publication.status === 'local' && ' (local preview)'}</a>}
        <a className="button primary compact" href={WINDOWS_STORE_LISTING}><DownloadIcon />Install for Windows</a>
      </div>
    </section>
  );
}

export function DownloadRequirements({ platformAware = false } = {}) {
  const installer = downloadableInstaller();
  const mac = macDownloadHref();
  return (
    <p className="source-note" aria-label="Download requirements">
      {mac && installer && <span className={platformAware ? "platform-mac" : undefined}>Mac {installer.kitVersion}: Apple Silicon, macOS {installer.asset.minimumOS}+.{!platformAware && <br />}</span>}
      <span className={platformAware ? "platform-windows" : undefined}>Windows: x64, Windows 10 (build 19041) or later. Install Zero from Microsoft Store.</span>
    </p>
  );
}
