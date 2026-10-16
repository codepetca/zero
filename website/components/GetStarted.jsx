// Template links come only from the route's verified publication metadata.
export function GetStarted({ template }) {
  return <main id="page-content" tabIndex={-1} className="get-started">
    <h1>Get started</h1>
    <section id="github" aria-labelledby="github-heading">
      <h2 id="github-heading">1. Sign in to GitHub</h2>
      <p>Use your own account with a verified email.</p>
      <div className="guide-actions">
        <a className="guide-button" href="https://github.com/login" target="_blank" rel="noopener noreferrer">Sign in to GitHub</a>
        <a className="guide-link" href="https://github.com/signup" target="_blank" rel="noopener noreferrer">Create an account</a>
      </div>
      <p className="guide-hint">Opens GitHub in a new tab. <a href="/docs/setup#before-lesson-0-github-and-privacy">School setup and privacy</a>.</p>
    </section>

    <section id="install" aria-labelledby="install-heading">
      <h2 id="install-heading">2. Download and launch Zero</h2>
      <p>Mac with Apple Silicon or Windows ZIP (manual setup).</p>
      <div className="guide-actions">
        <a className="guide-button" href="/downloads">Download Zero</a>
        <a className="guide-link" href="/docs/setup">Installation help</a>
      </div>
    </section>

    <section id="project" aria-labelledby="project-heading">
      <h2 id="project-heading">3. Create your project</h2>
      {template ? <a className="guide-button" href={template.templateHref} target="_blank" rel="noopener noreferrer">Create my project</a> :
        <p className="guide-notice"><strong>Template not available yet.</strong> Ask your teacher for the published template, or open your own already-cloned Greeting app.</p>}
      <p>Create your own repository from the template, copy its Code → HTTPS URL, then use <strong>Git: Clone</strong> in Zero and open the folder.</p>
      <a href="/docs/course-project#tutorial-repositories">Repository setup help</a>
    </section>

    <section id="lesson" aria-labelledby="lesson-heading">
      <h2 id="lesson-heading">4. Start learning</h2>
      <p>Open your cloned project, write Java and choose <strong>Run App</strong>.</p>
      <a className="guide-button" href="/tutorials/0">Start lesson 0</a>
    </section>

    <details id="sharing"><summary>Saving and sharing help</summary>
      <p>Use Setup help in Zero to check Java and Git. Clone outside other repositories and set this repository&apos;s Git name/email before your first upload.</p>
      <p>Run opens your app in the browser and works offline once build tools are cached. Upload changes uses Zero&apos;s own GitHub sign-in; nothing uploads automatically.</p>
      <p>Publish app is optional and public. First Publish confirms the destination; later Publish updates that site. Private-repository Pages may require a paid plan; tutorial uploads do not. Submit your repository link separately in Pika.</p>
      <a href="/docs/course-project#tutorial-repositories">Full GitHub workflow</a>
    </details>
  </main>;
}
