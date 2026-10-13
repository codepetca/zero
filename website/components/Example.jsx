import { lessonAssets } from "@/lib/learning.mjs";
import { PageHeader } from "./PageHeader";
import { Icon } from "./Icon";
export function Example({ example, sources }) {
  const id = example.id;
  const files = [
    ...example.files.map((file) => ({
      file, destination: `src/main/java/${file.split("/").at(-1)}`,
    })),
    ...(example.resources || []),
  ];
  return (
    <>
      <PageHeader active="Examples" />
      <main id="page-content" tabIndex={-1} className="catalog example-detail">
        <h1>Examples</h1>
        <h2 className="page-subtitle">{example.title}</h2>
        <p className="catalog-lead">{example.description}</p>
        <details className="copy-guide reading-section">
          <summary>
            <h2>Run this example</h2>
            <Icon name="chevron-down" />
          </summary>
          <div className="reading-section-body">
            <p>
              These are complete reference examples. If you came from a lesson,
              read the source below and add the idea to your own code in the same
              lesson project. To run this entire example separately, make a new
              local copy of the starter in another folder. Copy the listed files
              only into that new copy, keeping its <code>zero/</code> framework
              and build files. Open the separate folder in VS Code and Run App.
              Keep your ongoing lesson project as it is.
            </p>
            <ul>
              {files.map(({ file, destination }) => (
                <li key={file}>
                  <a
                    download={lessonAssets[`student-template/examples/${file}`] ? file.split("/").at(-1) : undefined}
                    href={lessonAssets[`student-template/examples/${file}`] || `/source?file=${encodeURIComponent(`student-template/examples/${file}`)}`}
                  >{`examples/${file}`}</a>{" → "}<code>{destination}</code>
                </li>
              ))}
            </ul>
            {files.some(({ file }) => file.endsWith("chime.wav")) && <p>Older kits need the pinned javafx-media dependency from Lesson 12.</p>}
            <p>
              Run App to rebuild.{" "}
              {["keyboard", "animation", "drawing", "reach-the-coin", "movement", "coin-game", "coin-game-controls", "coin-game-component", "composed-game", "scrolling-game", "platform-game", "level-game", "full-game"].includes(id) &&
                "Click the canvas before testing input."}{" "}
              These examples run in VS Code, in a separate JavaFX window.
            </p>
            <a className="button" href={example.guide ? `/docs/${example.guide}` : `/tutorials/${example.lesson}`}>
              {example.guide ? "Open related guide" : "Open related lesson"} <Icon name="arrow-right" />
            </a>
          </div>
        </details>
        <h2>Read the source</h2>
        {files.filter(({ file }) => !lessonAssets[`student-template/examples/${file}`]).map(({ file }) => (
          <details className="source-file" key={file}>
            <summary>{file}</summary>
            <pre>
              <code>{sources[`student-template/examples/${file}`]}</code>
            </pre>
          </details>
        ))}
      </main>
    </>
  );
}
