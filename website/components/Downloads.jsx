import { DownloadIcon } from "./Brand";
import { downloadHref, downloadableKit, downloadableInstaller, macDownloadHref, downloadableWindowsInstaller, windowsDownloadHref, windowsDownloadIsUnsigned, windowsManualDownloadHref } from "@/lib/release";
export function Downloads() {
  const kit = downloadableKit();
  const installer = downloadableInstaller();
  const mac = macDownloadHref();
  const windows = windowsDownloadHref();
  const unsigned = windowsDownloadIsUnsigned();
  const manual = windowsManualDownloadHref();
  if (!mac && !windows && !kit) return null;
  return (
    <section className="download-section" id="downloads" aria-label="Downloads">
      <div className="hub-actions">
        {mac && <a className="button primary compact" href={mac}><DownloadIcon />Download for Mac Silicon{installer.publication.status === 'local' && ' (local preview)'}</a>}
        {windows && <div className="windows-download">
          <a className="button primary compact" href={windows}><DownloadIcon />Download for Windows{unsigned && ' (unsigned)'}</a>
          {manual && <a className="manual-download" href={manual}>Manual setup (ZIP)</a>}
        </div>}
        {!windows && kit && <a className="button primary compact" href={downloadHref()} aria-label={`Download for Windows (ZIP), manual setup${kit.publication.status === 'local' ? ', local preview' : ''}`}><DownloadIcon />Download for Windows (ZIP){kit.publication.status === 'local' && ' (local preview)'}</a>}
      </div>
    </section>
  );
}

export function DownloadRequirements() {
  const kit = downloadableKit();
  const installer = downloadableInstaller();
  const mac = macDownloadHref();
  const windows = windowsDownloadHref();
  const windowsInstaller = downloadableWindowsInstaller();
  const unsigned = windowsDownloadIsUnsigned();
  if (!mac && !windows && !kit) return null;
  return (
    <p className="source-note" aria-label="Download requirements">
      {mac && installer && <>Mac {installer.kitVersion}: Apple Silicon, macOS {installer.asset.minimumOS}+.<br /></>}
      {windows && windowsInstaller ? <>Windows {windowsInstaller.kitVersion}: x64, Windows 10 (build 19041) or later.</> : kit && <>Windows {kit.kitVersion}: ZIP with manual setup.</>}
      {windows && unsigned && <><br />Unsigned preview; automatic updates are off. Interactive Windows testing is pending.</>}
    </p>
  );
}
