import { PageHeader } from "@/components/PageHeader";
import { Icon } from "@/components/Icon";
export const metadata = { title: "Docs" };
const docGroups = [
  {
    title: "Start and run",
    items: [
      ["setup", "Set up Zero", "Install the tools and run your first app."],
      ["starter", "Starter guide", "Open, edit and rebuild your project."],
    ],
  },
  {
    title: "Write Java",
    items: [
      ["beginner", "Beginner toolkit", "Start with a small set for apps or games."],
      ["style", "Make it look good", "Fonts, colours, layouts and an editable theme."],
      ["api", "Java API reference", "Startup, controls, drawing and input."],
      ["exercises", "Starter exercises", "Small changes and reusable objects."],
    ],
  },
  {
    title: "Teach and share",
    items: [
      [
        "teachers",
        "Teacher notes",
        "Expected results and assessment guidance.",
      ],
      [
        "lesson-guide",
        "Lesson guide",
        "All six lessons and teaching sequence.",
      ],
      [
        "pilot",
        "Classroom pilot",
        "Check school-machine and student readiness.",
      ],
    ],
  },
  {
    title: "About Zero",
    items: [
      ["product", "How Zero works", ""],
      ["components", "Component architecture", ""],
      ["workshop", "Workshop guide", ""],
      ["development", "Local development", ""],
      ["verification", "Verification record", ""],
    ],
  },
];
export default function Docs() {
  return (
    <>
      <PageHeader active="Docs" />
      <main id="page-content" tabIndex={-1} className="catalog">
        <p className="eyebrow">Documentation</p>
        <h1>Docs.</h1>
        {docGroups.map((group) => (
          <section className="catalog-section" key={group.title}>
            <h2>{group.title}</h2>
            <div className="doc-group">
              {group.items.map(([id, title]) => (
                <a className="catalog-row" href={`/docs/${id}`} key={id}>
                  <div>
                    <h3>{title}</h3>
                  </div>
                  <Icon name="chevron-right" />
                </a>
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
