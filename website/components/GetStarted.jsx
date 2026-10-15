// Only the route's verified teaching metadata supplies a tutorial template link.
export function GetStarted({ template }) {
  return <main id="page-content" tabIndex={-1} className="get-started">
    <header className="get-started-intro">
      <h1>Get started</h1>
      <p>Prepare your account, install Zero and make your first Java app.</p>
      <a className="guide-link" href="/tutorials/0">Already set up? Continue tutorials</a>
    </header>
    <nav aria-label="Get started steps" className="guide-steps">
      <a href="#github">1. GitHub</a>
      <a href="#install">2. Install</a>
      <a href="#project">3. Your project</a>
      <a href="#lesson">4. First lesson</a>
      <a href="#sharing">5. Save and share</a>
    </nav>

    <section id="github" aria-labelledby="github-heading">
      <h2 id="github-heading">1. Prepare your GitHub account</h2>
      <p>Use your own GitHub account and verify your email. If you already have an account, sign in to it.</p>
      <div className="guide-actions">
        <a className="guide-button" href="https://github.com/signup" target="_blank" rel="noopener noreferrer">Create GitHub account <span className="guide-new-tab">(new tab)</span></a>
        <a className="guide-link" href="https://github.com/login" target="_blank" rel="noopener noreferrer">Sign in to GitHub <span className="guide-new-tab">(new tab)</span></a>
      </div>
      <p>With your teacher, check school access to GitHub and VS Code, repository privacy and the name/email attached to your commits. Keep passwords and tokens private.</p>
      <p><a href="/docs/setup#before-lesson-0-github-and-privacy">Account, school access and privacy checklist</a>. You can read this website without signing in; it does not check your GitHub account.</p>
    </section>

    <section id="install" aria-labelledby="install-heading">
      <h2 id="install-heading">2. Install Zero</h2>
      <p>Choose the download for <strong>Mac with Apple Silicon</strong> or <strong>Windows</strong>. The Windows ZIP uses manual setup.</p>
      <div className="guide-actions"><a className="guide-button" href="/downloads">Download Zero</a></div>
      <p>Open Zero in VS Code, then use <strong>Setup Help</strong> to check Java and Git before cloning your project. If school software restrictions block setup, ask your teacher.</p>
      <p><a href="/docs/setup">Installation steps and setup help</a></p>
    </section>

    <section id="project" aria-labelledby="project-heading">
      <h2 id="project-heading">3. Create and clone your project</h2>
      <p>Your Greeting app starts in your own GitHub repository—a saved home for your project and its history.</p>
      {template ? <div className="guide-actions">
        <a className="guide-button" href={template.templateHref} target="_blank" rel="noopener noreferrer">Use Greeting app template <span className="guide-new-tab">(new tab)</span></a>
      </div> : <p className="guide-notice"><strong>Template not available yet.</strong> The Greeting app tutorial template has not been published. Ask your teacher for the published tutorial template, or continue in your own already-cloned Greeting app repository.</p>}
      <ol>
        <li>{template ? "Choose Use template" : "When the template is published, choose Use template"} and create a new repository under your own GitHub account. Follow your teacher&apos;s privacy choice.</li>
        <li>In <strong>your new repository</strong>, copy its <strong>Code → HTTPS</strong> URL.</li>
        <li>In VS Code, open the Command Palette and choose <strong>Git: Clone</strong>. Paste your URL, choose a location outside any other Git repository, then open the cloned folder.</li>
        <li>Before your first upload, set the teacher-approved Git name and email for this repository using the <a href="/docs/course-project#tutorial-repositories">repository setup guide</a>.</li>
      </ol>
      <p>Keep this repository for lessons 0–2. Clone your own copy, rather than the teacher&apos;s template.</p>
    </section>

    <section id="lesson" aria-labelledby="lesson-heading">
      <h2 id="lesson-heading">4. Start lesson 0</h2>
      <p>Once your repository is cloned and open in Zero, follow lesson 0 to write ordinary Java, choose <strong>Run App</strong> and see your app in the browser. Edit your greeting, then run it again.</p>
      <div className="guide-actions"><a className="guide-button" href="/tutorials/0">Open lesson 0</a></div>
      <p>You can browse the lesson while waiting for the template. Start the coding work after cloning. Once the build tools and dependencies are cached, local Run works offline without an active GitHub sign-in.</p>
    </section>

    <section id="sharing" aria-labelledby="sharing-heading">
      <h2 id="sharing-heading">5. Save progress, then choose whether to publish</h2>
      <p>For each lesson: <strong>New branch</strong> → edit and <strong>Run App</strong> → <strong>Upload changes</strong> → <strong>Finish change</strong>.</p>
      <p>Before confirming GitHub actions, review your account, repository, branch and files. Nothing uploads automatically. When an upload needs sign-in, use VS Code&apos;s own GitHub sign-in flow.</p>
      <p><strong>Publish app</strong> is a separate, optional action that creates or updates a public playable link. First Publish asks you to confirm its destination; later explicit Publish actions update that approved site. Tutorial uploads do not require a paid plan. Private repositories may need a paid GitHub plan for Pages; check with your teacher before changing privacy.</p>
      <p>Submit your source repository link separately in Pika. Uploading or publishing does not submit your assignment.</p>
      <a className="guide-link" href="/docs/course-project#tutorial-repositories">Full repository and sharing guide</a>
    </section>
  </main>;
}
