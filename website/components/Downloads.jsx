import { DownloadIcon } from "./Brand";
import { downloadHref, downloadableKit, macDownloadHref, installer } from "@/lib/content";
export function Downloads() {
  const kit = downloadableKit();
  const mac = macDownloadHref();
  if (!mac && !kit) return null;
  return (
    <section className="download-section" id="downloads" aria-label="Downloads">
      <div className="hub-actions">
        {mac && <a className="button primary compact" href={mac}><DownloadIcon />Download for Mac Silicon{installer.publication.status === 'local' && ' (local preview)'}</a>}
        {kit && <a className="button primary compact" href={downloadHref()}><DownloadIcon />Download for Windows (ZIP){kit.publication.status === 'local' && ' (local preview)'}</a>}
      </div>
    </section>
  );
}
