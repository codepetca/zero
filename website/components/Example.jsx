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
        <a className="back-link" href="/examples">
          <Icon name="arrow-left" />
          All examples
        </a>
        <p className="eyebrow">Example app</p>
        <h1>{example.title}</h1>
        <p className="catalog-lead">{example.description}</p>
        <details className="copy-guide reading-section">
          <summary>
            <h2>Run this example</h2>
            <Icon name="chevron-down" />
          </summary>
          <div className="reading-section-body">
            <p>
              Stop the app and save your current Main and helpers outside{" "}
              <code>src/</code>. Copy the files shown below into the listed
              destinations in your standalone starter, creating resource folders
              when needed. Replace Main and the listed helpers. Keep the{" "}
              <code>zero/</code> framework folder and build files. If an older
              downloaded kit does not have these examples, use the source shown here.
            </p>
            <ul>
              {files.map(({ file, destination }) => (
                <li key={file}>
                  <a
                    href={`/source?file=${encodeURIComponent(`student-template/examples/${file}`)}`}
                  >{`examples/${file}`}</a>{" → "}<code>{destination}</code>
                </li>
              ))}
            </ul>
            <p>
              Run App to rebuild.{" "}
              {["keyboard", "animation", "drawing", "reach-the-coin"].includes(id) &&
                "Click the canvas before testing input."}{" "}
              These examples run in VS Code, in a separate JavaFX window.
            </p>
            <a className="button" href={example.guide ? `/docs/${example.guide}` : `/tutorials/${example.lesson}`}>
              {example.guide ? "Open beginner toolkit" : "Open related lesson"} <Icon name="arrow-right" />
            </a>
          </div>
        </details>
        <h2>Read the source</h2>
        {files.map(({ file }) => (
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
