export function TutorialProject({ project, lesson }) {
  if (!project) return null;
  const starting = lesson === project.firstLesson;
  if (!starting) return null;
  return <section className="lesson-start" aria-label={`${project.title} project`}>
    {starting && <>
      {project.id === 'study' ? <p>Open your existing <strong>Study</strong> project in Zero.</p> :
        <p>On Zero’s Start Page, choose <strong>Start tutorial → {project.title}</strong> to create your project.</p>}
    </>}
  </section>;
}
