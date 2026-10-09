import { PageHeader } from "./PageHeader";
import { Icon } from "./Icon";
export function Example({ example, sources }) {
  const id = example.id;
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
              <code>src/</code>. Copy these files from the starter's{" "}
              <code>examples/</code> shelf into <code>src/main/java/</code>,
              replacing Main and the listed helpers. Keep the <code>zero/</code>{" "}
              framework folder.
            </p>
            <ul>
              {example.files.map((file) => (
                <li key={file}>
                  <a
                    href={`/source?file=${encodeURIComponent(`student-template/examples/${file}`)}`}
                  >{`examples/${file}`}</a>
                </li>
              ))}
            </ul>
            <p>
              Run App to rebuild.{" "}
              {["keyboard", "animation", "drawing"].includes(id) &&
                "Click the canvas before testing input."}{" "}
              These examples run in VS Code, in a separate JavaFX window.
            </p>
            <a className="button" href={`/tutorials/${example.lesson}`}>
              Open related lesson <Icon name="arrow-right" />
            </a>
          </div>
        </details>
        <h2>Read the source</h2>
        {example.files.map((file) => (
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
