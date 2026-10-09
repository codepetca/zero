import { PageHeader } from "@/components/PageHeader";
import { Icon } from "@/components/Icon";
import { lessons, quickLinks } from "@/lib/learning.mjs";
import { Downloads } from "@/components/Downloads";
export const metadata = { title: "Learn Java" };
export const dynamic = "force-dynamic";
export default function Learn() {
  return (
    <>
      <PageHeader active="Tutorials" />
      <main id="page-content" tabIndex={-1} className="hub">
        <div className="hub-intro">
          <p className="eyebrow">Learn with Zero</p>
          <h1>Learn Java.</h1>
          <p className="hub-lead">Six lessons. One small app.</p>
          <div className="hub-actions">
            <a className="button" href="/tutorials/1">
              Start lesson 1
            </a>
            <a className="setup-link" href="/docs/setup">
              New here? Set up Zero <Icon name="arrow-right" />
            </a>
          </div>
        </div>
        <div className="hub-columns">
          <section aria-labelledby="lessons-title">
            <h2 id="lessons-title">Lessons</h2>
            <ol className="lesson-list">
              {lessons.map((lesson) => (
                <li key={lesson.id}>
                  <details className="lesson-preview">
                    <summary>
                      <span className="lesson-number">{lesson.id}</span>
                      <h3>{lesson.title}</h3>
                      <Icon name="chevron-down" />
                    </summary>
                    <div className="lesson-preview-body">
                      <p>{lesson.description}</p>
                      <p className="lesson-topic">{lesson.topic}</p>
                      <a href={`/tutorials/${lesson.id}`}>
                        Open lesson {lesson.id} <Icon name="arrow-right" />
                      </a>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </section>
          <aside className="quick-links" aria-labelledby="quick-title">
            <h2 id="quick-title">Docs & help</h2>
            {quickLinks.map((link) => (
              <a className="quick-link" key={link.title} href={link.href}>
                <div>
                  <h3>{link.title}</h3>
                </div>
                <Icon name="chevron-right" />
              </a>
            ))}
          </aside>
        </div>
        <Downloads />
      </main>
    </>
  );
}
