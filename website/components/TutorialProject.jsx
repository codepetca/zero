// Publication metadata is supplied by the teaching manifest. Never construct a
// template URL from an unpublished repository name here.
export function TutorialProject({ project, lesson, template, assets }) {
  const starting = lesson === project.firstLesson;
  if (!starting && lesson !== "10" && lesson !== "12") return null;
  return <section className="lesson-start" aria-label={`${project.title} project`}>
    {starting && <>
      {template ? <>
        <a className="button" href={template.templateHref}>Use template</a>
        <p>Create your own GitHub repository from the template, then choose <strong>Clone repository</strong> in Zero&apos;s repository menu. <a href="/docs/setup#start-here">Setup</a></p>
      </> : <p><strong>Template not available yet.</strong> Ask your teacher for the published {project.title} tutorial template, or continue in your own already-cloned repository. <a href="/docs/setup#start-here">Setup</a></p>}
    </>}
    {lesson === "10" && <p>Reopen your Study quiz and Coin game repositories to try the same component in both.</p>}
    {lesson === "12" && <p>For optional artwork and sound in your own game, <a href={assets.href} download={assets.filename}>download sample game assets</a>. This ZIP contains only media files.</p>}
  </section>;
}
