// Publication metadata is supplied by the teaching manifest. Never construct a
// template URL from an unpublished repository name here.
export function TutorialProject({ project, lesson, template, assets }) {
  const starting = lesson === project.firstLesson;
  return <section className="lesson-start" aria-label={`${project.title} project`}>
    {starting ? <>
      <h3>Start your {project.title} repository</h3>
      <p>Launch Zero. It reuses your GitHub connection; choose Connect GitHub if prompted. <a href="/downloads">Download Zero</a> · <a href="/docs/setup#before-lesson-0-github-and-privacy">Account and privacy help</a>.</p>
      {template ? <a className="button" href={template.templateHref}>Use template</a> :
        <p><strong>Template not available yet.</strong> The {project.title} tutorial template has not been published.
          Ask your teacher for the published tutorial template, or continue in your own already-cloned repository.</p>}
      <ol>
        <li>From Zero&apos;s welcome, choose <strong>Start tutorial</strong> → <strong>{project.title}</strong> to open the matching template. With a project open, use Zero&apos;s <strong>…</strong> menu to find Start tutorial.
          {' '}{template ? 'You can also choose Use template above.' : 'Continue when the template is available.'}
          {' '}On GitHub, choose <strong>Use this template → Create a new repository</strong> and create a repository under your own GitHub account.</li>
        <li>Copy <strong>your new repository</strong>&apos;s <strong>Code → HTTPS</strong> URL.
          Return to Zero&apos;s sidebar and choose <strong>Clone repository</strong>. Paste your URL, choose a destination outside any other Git repository,
          then choose <strong>Open in New Window</strong> when VS Code offers to open the clone.</li>
        <li>Open <code>src/main/java/Main.java</code>, write the lesson&apos;s ordinary Java, then choose <strong>Run App</strong>. Start with its empty Main and keep this repository for lessons {project.lessons[0]}–{project.lessons.at(-1)}.</li>
      </ol>
      {template && <p><a href={template.repositoryUrl}>View tutorial template</a></p>}
    </> : <>
      <p>Continue your {project.title} project in the same cloned repository.
        {' '}Need that repository? <a href={`/tutorials/${project.firstLesson}`}>Start at lesson {project.firstLesson}</a>.</p>
    </>}
    <p>For each lesson: <strong>New branch</strong> → edit and <strong>Run App</strong> → <strong>Commit & push</strong> → <strong>Merge to main</strong>.
      Commit &amp; push creates a commit when needed and pushes the current branch. Merge to main merges your branch into main and pushes main.
      Review the account, repository, branch and files before confirming GitHub actions. Nothing pushes automatically.
      Publish app is a separate action that deploys your playable app to GitHub Pages.
      Local Run App needs no GitHub sign-in.</p>
    <p><a href="/docs/course-project#tutorial-repositories">Tutorial repository and Git setup guide</a>.</p>
    {lesson === "10" && <p>Reopen your Study quiz and Coin game repositories to try the same component in both.</p>}
    {lesson === "12" && <p>For optional artwork and sound in your own game, <a href={assets.href} download={assets.filename}>download sample game assets</a>. This ZIP contains only media files.</p>}
  </section>;
}
