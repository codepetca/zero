"use client";

import { useEffect, useRef, useState } from "react";

const steps = ["github", "install", "project", "lesson"];
const titles = {
  github: "Start with GitHub",
  install: "Install Zero",
  project: "Create your project",
  lesson: "Make your first app",
};

export function wizardStep(hash, current = "github") {
  const id = String(hash).replace(/^#/, "");
  if (id === "page-content") return current;
  return steps.includes(id) ? id : id === "sharing" ? "lesson" : "github";
}

// Template links come only from the route's verified publication metadata.
export function GetStartedStep({ step, template, onGitHub, headingRef }) {
  return <section id={step} aria-labelledby="step-heading">
    <h1 id="step-heading" tabIndex={-1} ref={headingRef}>{titles[step]}</h1>
    {step === "github" && <>
      <p>Create an account or sign in to yours.</p>
      <a className="guide-button" href="https://github.com/login" target="_blank" rel="noopener noreferrer" onClick={onGitHub}>Continue with GitHub</a>
      <p className="guide-hint">Opens GitHub in a new tab.</p>
      <details><summary>School setup and privacy</summary>
        <p>Use your own account with a verified email. Follow your teacher&apos;s <a href="/docs/setup#before-lesson-0-github-and-privacy">account and privacy checklist</a>.</p>
      </details>
    </>}
    {step === "install" && <>
      <p>Finish signing in on GitHub, then download Zero.</p>
      <a className="guide-button" href="/downloads">Download Zero</a>
      <p className="guide-hint">Mac with Apple Silicon or Windows ZIP (manual setup).</p>
      <details><summary>Setup help</summary>
        <p>Use Zero&apos;s Setup help to check Java and Git. <a href="/docs/setup">Installation instructions</a>.</p>
      </details>
    </>}
    {step === "project" && <>
      <p>Create your own copy of the Greeting app.</p>
      {template ? <a className="guide-button" href={template.templateHref} target="_blank" rel="noopener noreferrer">Create my project</a> :
        <p className="guide-notice"><strong>Template not available yet.</strong> Ask your teacher for the published template, or use your own already-cloned Greeting app.</p>}
      <ol>
        <li>Create the repository in your GitHub account.</li>
        <li>Copy <strong>your repository&apos;s</strong> Code → HTTPS URL.</li>
        <li>In Zero, choose <strong>Git: Clone</strong>, paste the URL and open the folder.</li>
      </ol>
      <details><summary>Repository setup help</summary>
        <p>Clone outside other repositories. Set this repository&apos;s Git name and email before your first upload. <a href="/docs/course-project#tutorial-repositories">Repository and privacy instructions</a>.</p>
      </details>
    </>}
    {step === "lesson" && <>
      <p>Write Java. Choose Run App. See it in your browser.</p>
      <a className="guide-button" href="/tutorials/0">Start lesson 0</a>
      <p className="guide-hint">Open your cloned project before coding.</p>
      <details><summary>Saving and sharing</summary>
        <p>Run works offline once build tools are cached. Upload changes uses VS Code&apos;s GitHub sign-in; nothing uploads automatically.</p>
        <p>Publish app is optional and public. First Publish confirms the destination; later Publish updates that site. Private-repository Pages may require a paid plan; tutorial uploads do not. Submit your repository link separately in Pika.</p>
        <a href="/docs/course-project#tutorial-repositories">Full GitHub workflow</a>
      </details>
    </>}
  </section>;
}

export function GetStarted({ template }) {
  const [step, setStep] = useState("github");
  const heading = useRef(null);
  const content = useRef(null);
  const currentStep = useRef("github");
  const navigated = useRef(false);

  useEffect(() => {
    const sync = () => {
      const next = wizardStep(window.location.hash, currentStep.current);
      // The shared skip link changes the fragment for focus, not the wizard step.
      if (window.location.hash === "#page-content") {
        window.history.replaceState(window.history.state, "", `#${next}`);
        content.current?.focus();
        return;
      }
      currentStep.current = next;
      navigated.current = true;
      setStep(next);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    if (navigated.current) heading.current?.focus();
  }, [step]);

  const index = steps.indexOf(step);
  return <main id="page-content" tabIndex={-1} ref={content} className="get-started">
    <div className="setup-wizard">
      <p className="guide-progress">Step {index + 1} of {steps.length}</p>
      <GetStartedStep key={step} step={step} template={template} headingRef={heading}
        onGitHub={() => { window.location.hash = "install"; }} />
      {index > 0 && <nav className="guide-navigation" aria-label="Setup navigation">
        <a className="guide-link" href={`#${steps[index - 1]}`}>Back</a>
        {step === "install" && <a className="guide-link" href="#project">Already installed? Next</a>}
        {step === "project" && <a className="guide-link" href="#lesson">My project is open. Next</a>}
      </nav>}
    </div>
  </main>;
}
