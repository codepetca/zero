export function TutorialProject({ project, lesson }) {
  if (!project) return null;
  const starting = lesson === project.firstLesson;
  if (!starting) return null;
  return <section className="lesson-start" aria-label={`${project.title} project`}>
    {starting && <>
      <p>On Zero’s Start Page, sign in to GitHub and set up access if needed. Choose <strong>Project → New</strong> to create your {project.title} project.</p>
    </>}
  </section>;
}
