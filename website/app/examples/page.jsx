import { PageHeader } from "@/components/PageHeader";
import { Icon } from "@/components/Icon";
import { examples } from "@/lib/learning.mjs";
export const metadata = { title: "Examples" };
export default function Examples() {
  return (
    <>
      <PageHeader active="Examples" />
      <main id="page-content" tabIndex={-1} className="catalog">
        <p className="eyebrow">Example apps</p>
        <h1>Pick an example.</h1>
        <div className="examples-list">
          {examples.map((example) => (
            <a
              href={`/examples/${example.id}`}
              className="catalog-row"
              key={example.id}
            >
              <div>
                <h2>{example.title}</h2>
              </div>
              <Icon name="chevron-right" />
            </a>
          ))}
        </div>
      </main>
    </>
  );
}
