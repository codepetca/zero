import {LearnTheme} from '@/app/learn/LearnTheme';
import Link from 'next/link';
import {HubProjectNavigation} from './HubProjectNavigation';
import {HubNavigation} from './HubNavigation';
import {Icon} from './Icon';
import {CodeBlock} from './CodeBlock';
import {courseStarterId, projectGuide, projectNavigation, projectTitle} from '@/lib/project-curriculum.mjs';
import '../.generated/learn-theme.css';
import '@/app/learn/learn.css';
import styles from '@/app/hub/hub.module.css';

export type ExampleProject = {
  id: string;
  title: string;
  description: string;
  repositoryUrl: string;
  projectHref: string;
  templateHref?: string;
  images: {src: string; alt: string}[];
  size: number;
  sha256: string;
};

export function HubExamples({snapshot, project}: {snapshot: {starter: ExampleProject; projects: ExampleProject[]}; project: ExampleProject}) {
  const navigation = projectNavigation(snapshot, project);
  const starter = project.id === courseStarterId;
  const guide = projectGuide(project.id);
  return <LearnTheme active="ZeroHub">
    <main id="page-content" tabIndex={-1} className={`reader-layout compact-reader ${styles.examples}`}>
      <aside className="reader-navigation">
        <HubProjectNavigation navigation={navigation} current={project.id} />
      </aside>
      <article key={project.id} className="reader-content">
        <h1>ZeroHub</h1>
        <HubNavigation active="example" />
        <h2 className="page-subtitle">{projectTitle(project)}</h2>
        <p className="catalog-lead">{project.description}</p>
        {starter && <p className={styles.starterDescription}>Start with a small Hello, world! app, the Zero library and working build tools.
          Choose your own idea and build its interface and behaviour. You do not need to start from a finished example.</p>}
        {navigation.checkpoint && <p className={styles.checkpointNote}>This is a runnable tutorial checkpoint.
          For a complete practice project, choose one of the four practice projects.</p>}
        {project.images.length > 0 && <div className={styles.previews}>
          {project.images.map((image, index) => <img key={image.src} className={styles.preview}
            src={image.src} alt={image.alt} loading={index === 0 ? 'eager' : 'lazy'} />)}
        </div>}
        <div className={styles.projectActions}>
          {project.templateHref ? <>
            <a className="button primary" href={project.templateHref}>Use template <Icon name="arrow-right" /></a>
            <a className={styles.repositoryLink} href={project.projectHref} download={`${project.id}.zip`}><Icon name="download" /> Download ZIP</a>
          </> : <a className="button primary" href={project.projectHref} download={`${project.id}.zip`}>
              <Icon name="download" /> {starter ? 'Get starter' : 'Get project'}
            </a>}
          <a className={styles.repositoryLink} href={project.repositoryUrl}>{starter && !project.templateHref ? 'View starter source' : 'View repository'} <Icon name="arrow-right" /></a>
        </div>
        {project.templateHref ? <section className={styles.cloneInstructions} aria-labelledby="clone-title">
          <h3 id="clone-title">Clone your own project</h3>
          <ol>
            <li>Choose Use template. On GitHub, select your own account as the owner and create a repository with a name you choose.</li>
            <li>In your new repository, choose Code → HTTPS and copy its URL. Sign in to Zero and choose Project → Clone from GitHub…. Paste your URL in Clone from GitHub, then choose Clone here in Clone location. Keep the default ~/Zero Projects or choose another folder outside any Git repository. Newer VS Code versions open a new window automatically; the VS Code 1.95 fallback may ask for Open in New Window.</li>
          </ol>
          <p>Terminal alternative: replace the username and project name below with your own:</p>
          <CodeBlock><code>{'git clone https://github.com/YOUR-USERNAME/YOUR-PROJECT.git\ncd YOUR-PROJECT'}</code></CodeBlock>
          <p>For an already-cloned Zero folder, use Project → Open local project… to open a new window without cloning again. Choose Run App. Your repository already contains the starting project on main.</p>
          <p className={styles.workflowHelp}>Using Download ZIP instead? Extract it into a new folder, then create an empty repository in your own account. Choose Project → Open local project… for the extracted Zero folder, then Project → Connect to GitHub… and Commit & push the starting files.</p>
        </section> : <p className={styles.openInstruction}>Extract the project, then sign in to Zero and choose Project → Open local project… for its Zero folder. Choose Run App.</p>}
        {guide && <section className={styles.projectWorkflow} aria-labelledby="project-workflow-title">
          <h3 id="project-workflow-title">{starter ? 'Build your project' : 'Make it yours'}</h3>
          <p>{guide.challenge}</p>
          <ol>
            <li>{project.templateHref
              ? 'In Zero, check that your own cloned repository is open. Personalize the README and Commit & push those changes on main before starting a branch.'
              : 'Create an empty GitHub repository in your own account. In Zero, choose Project → Connect to GitHub… and Commit & push the starting project to main.'}</li>
            <li>Choose New branch in the repository menu for one small feature.</li>
            <li>Edit your Java and update the README with what your project does. Run App and check the result.</li>
            <li>Choose Commit &amp; push. It creates a commit when needed and pushes the current branch; use a message explaining what you changed.</li>
            <li>Choose Merge to main to merge your branch into main and push main. Check your files on GitHub main, then submit your own repository link in Pika.</li>
          </ol>
          <p className={styles.workflowHelp}>Real pushes need GitHub sign-in, Git commit identity and simulation turned off.
            {' '}<Link href="/docs/setup#your-individual-workflow">See the repository setup guide <Icon name="arrow-right" /></Link></p>
          <p className={styles.workflowHelp}>Later, practise pull requests and review on GitHub.
            {' '}<Link href="/docs/course-project#pull-request-practice">See the course project guide <Icon name="arrow-right" /></Link></p>
        </section>}
      </article>
    </main>
  </LearnTheme>;
}
