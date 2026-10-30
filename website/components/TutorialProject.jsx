export function TutorialProject({ project, lesson, assets }) {
  if (project?.start === 'original') return <section className="lesson-start" aria-label="Your own project">
    <p>On Zero’s Start Page, choose <strong>Project → New</strong> to create your own project.</p>
  </section>;
  if (!project) return null;
  const starting = lesson === project.firstLesson;
  if (!starting && lesson !== "10" && lesson !== "12") return null;
  return <section className="lesson-start" aria-label={`${project.title} project`}>
    {starting && <>
      {project.id === 'study' ? <p>Open your existing <strong>Study</strong> project in Zero.</p> :
        <p>On Zero’s Start Page, choose <strong>Start tutorial → {project.title}</strong> to create your project. If the tutorial is unavailable, try again later or open your existing project.</p>}
    </>}
    {lesson === "10" && <p>Reopen your Coin game to refactor it and practise reusing a component.</p>}
    {lesson === "12" && <p>For optional artwork and sound in your own game, <a href={assets.href} download={assets.filename}>download sample game assets</a>. This ZIP contains only media files.</p>}
  </section>;
}
