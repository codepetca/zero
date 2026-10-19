import { DownloadIcon } from "./Brand";
import { downloadHref, downloadableKit, downloadableInstaller, macDownloadHref, downloadableWindowsInstaller, windowsDownloadHref, windowsDownloadIsUnsigned } from "@/lib/content";
export function Downloads() {
  const kit = downloadableKit();
  const installer = downloadableInstaller();
  const mac = macDownloadHref();
  const windows = windowsDownloadHref();
  const unsigned = windowsDownloadIsUnsigned();
  if (!mac && !windows && !kit) return null;
  return (
    <section className="download-section" id="downloads" aria-label="Downloads">
      <div className="hub-actions">
        {mac && <a className="button primary compact" href={mac}><DownloadIcon />Download for Mac Silicon{installer.publication.status === 'local' && ' (local preview)'}</a>}
        {windows && <a className="button primary compact" href={windows} aria-describedby={unsigned ? 'windows-unsigned-note' : undefined}><DownloadIcon />Download for Windows{unsigned && ' (unsigned)'}</a>}
        {!windows && kit && <a className="button primary compact" href={downloadHref()} aria-label={`Download for Windows (ZIP), manual setup${kit.publication.status === 'local' ? ', local preview' : ''}`}><DownloadIcon />Download for Windows (ZIP){kit.publication.status === 'local' && ' (local preview)'}</a>}
      </div>
      {windows && unsigned && <p className="source-note" id="windows-unsigned-note">Unsigned preview. Windows may show a security warning.</p>}
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
