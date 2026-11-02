import { DownloadIcon } from "./Brand";
import { downloadableInstaller, macDownloadHref } from "@/lib/release";

// Microsoft supplies a small Store web installer; it downloads the app when run.
const WINDOWS_STORE_INSTALLER = 'https://get.microsoft.com/installer/download/9mxkd6dqlfgx?referrer=appbadge';
const WINDOWS_STORE_LISTING = 'https://apps.microsoft.com/detail/9mxkd6dqlfgx';

export function Downloads() {
  const installer = downloadableInstaller();
  const mac = macDownloadHref();
  return (
    <section className="download-section" id="downloads" aria-label="Downloads">
      <div className="hub-actions">
        {mac && <a className="button primary compact" href={mac}><DownloadIcon />Download for Mac Silicon{installer.publication.status === 'local' && ' (local preview)'}</a>}
        <div className="windows-download">
          <a className="button primary compact" href={WINDOWS_STORE_INSTALLER}><DownloadIcon />Download for Windows</a>
          <a className="manual-download" href={WINDOWS_STORE_LISTING}>View in Microsoft Store</a>
        </div>
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
      <span className={platformAware ? "platform-windows" : undefined}>Windows: x64, Windows 10 (build 19041) or later. The installer downloads Zero from Microsoft Store.</span>
    </p>
  );
}
