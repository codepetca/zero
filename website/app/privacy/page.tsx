import { LearnTheme } from '../learn/LearnTheme';
import '../../.generated/learn-theme.css';
import '../learn/learn.css';

export const metadata = { title: 'Privacy' };

export default function Privacy() {
  return <LearnTheme active="">
    <main id="page-content" tabIndex={-1} className="legal-page">
      <h1>Privacy</h1>
      <p>Codepet Inc. · Last updated October 25, 2026</p>
      <div className="legal-summary">
        <h2>The essentials</h2>
        <p>You can browse Zero’s learning material without connecting GitHub. Connecting GitHub lets Zero process your account identity and credentials for the features you choose to use. Your GitHub password is entered on GitHub, not into Zero.</p>
        <p>Shared projects, publication requests and GitHub activity can be public. Keep private student information and secrets out of submissions. Keep your own backups: the <a href="/terms">service disclaimers</a> do not waive your privacy rights.</p>
      </div>
      <section>
        <h2>1. What this notice covers</h2>
        <p>This notice explains information handling in Codepet’s Zero website, ZeroHub and Zero desktop tools. Features depend on the version and services available. It does not replace the separate policies of GitHub, your school, community projects or websites you visit through links. A school-managed account or device may also be subject to your school’s rules.</p>
      </section>
      <section id="information">
        <h2>2. Information used and why</h2>
        <ul>
          <li><strong>Website connections:</strong> delivering pages and downloads sends normal connection information, such as an IP address, requested address and browser request headers, to the hosting infrastructure. Operational information, including request times, error codes and service responses, may be processed to operate, troubleshoot and secure the service.</li>
          <li><strong>GitHub connections:</strong> sign-in processes your GitHub numeric account ID, username and authorization credentials. Your avatar can load directly from GitHub. The desktop sign-in service also processes short-lived sign-in verification data and exchanges or renews credentials with GitHub. Browser and desktop connections are separate.</li>
          <li><strong>Repository actions:</strong> when you use connected features, Zero processes the repository details, source files, commits, branch information and related GitHub responses needed for that action. The GitHub App’s installed permissions can include repository creation, contents, workflows, Actions, Pages and starring; access is not limited to stars. Review GitHub’s permission screen and repository selection.</li>
          <li><strong>Public sharing:</strong> publication requests submitted through GitHub issues, and shared catalog records and artifacts, can include your GitHub identity, repository, source commit, files, title, description, license and project details. They are used to check, publish, attribute and discover the work you choose to share. Public material can be copied by others.</li>
          <li><strong>Project counts:</strong> when enabled, clicking Play sends the project identifier to increment an aggregate count stored through Upstash. The application counter does not store a visitor profile or send an account ID, IP address or your GitHub credentials to the counter store. This counts link activations, including repeats; it does not measure unique people or gameplay. Hosting infrastructure still receives the request. Library-use summaries are derived from declared dependencies in shared project records.</li>
          <li><strong>Support and privacy requests:</strong> if you contact Codepet, we receive what you send and the contact information needed to respond. Send only what is needed; do not send passwords, access tokens or private student records.</li>
        </ul>
      </section>
      <section id="storage">
        <h2>3. Cookies and information on your device</h2>
        <ul>
          <li><strong>Website sign-in:</strong> an encrypted browser session cookie holds your GitHub ID, username, access token and a security token. It is unavailable to page JavaScript and is marked Secure on HTTPS. It expires within eight hours, or sooner if the GitHub token expires. A separate sign-in flow cookie expires after ten minutes. Signing out clears the website session cookie.</li>
          <li><strong>Desktop browser sign-in:</strong> short-lived verification cookies and tickets connect the browser sign-in to the requesting editor. They are separate from a ZeroHub browser session and expire within minutes.</li>
          <li><strong>Appearance:</strong> your theme choice is saved in the browser’s local storage until you clear it or change it. It has no automatic expiry.</li>
          <li><strong>Local preparation previews:</strong> development-only preparation screens can keep draft form values and retry identifiers in the current browser tab’s session storage. Saving a draft there does not submit it. ZeroJams participation is not enabled on the production site.</li>
          <li><strong>Desktop credentials and history:</strong> Zero uses VS Code SecretStorage for GitHub credentials, including refresh credentials where provided. Recent-project history can retain up to twenty local project paths, timestamps and repository links per GitHub account in the editor’s local state. Projects, Git history, settings and diagnostic output also remain on your device. Local history has no automatic time-based expiry; expired credentials can remain stored until cleared or replaced.</li>
        </ul>
        <p>Aggregate counts and operational logs are separate from saved preferences. Hosting providers and independently visited sites also process information under their own policies.</p>
      </section>
      <section>
        <h2>4. Providers, public destinations and security</h2>
        <p>GitHub handles sign-in, authorized repository actions, stars and public sharing records. Vercel provides website hosting and related infrastructure. Upstash provides aggregate counters when configured. Downloads, shared assets, playable apps and links may be served by GitHub, GitHub Pages, storage providers or independent project creators. Opening those destinations sends information to their operators under their own policies.</p>
        <p>Read the <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">GitHub privacy statement</a>, <a href="https://vercel.com/legal/privacy-notice">Vercel privacy notice</a> and <a href="https://upstash.com/trust/privacy.pdf">Upstash privacy policy</a>. Providers may process information outside Canada. Contact us if you need information about the providers or processing arrangements applicable to your use.</p>
        <p>We use protections such as encrypted sign-in cookies, protected editor credential storage and checks on authorized requests. No online system is completely secure. Do not treat a public repository, submission or playable app as private storage.</p>
      </section>
      <section id="retention">
        <h2>5. Retention and deletion limits</h2>
        <p>Sign-in expiry is not a deletion schedule for every related record. Browser preferences and local editor history persist as described above. Aggregate Play counters have no automatic expiry. Public sharing records, releases, source history and copies made by others can remain available after a listing is withdrawn.</p>
        <p>Hosting logs, provider backups and security records follow the applicable provider configuration and legal requirements; this notice does not promise a fixed deletion period for them. Ask us for the retention information applicable to a specific record. Information may need to be retained to address security incidents, disputes or legal obligations. When considering a deletion request, we will explain relevant limits, including records controlled by another provider.</p>
        <p>Possible data loss is not permission to disregard legal duties to safeguard personal information or respond to privacy requests.</p>
      </section>
      <section id="choices">
        <h2>6. Your choices and requests</h2>
        <ul>
          <li>Browse without signing in. After initial setup and dependency downloads, local project work does not need an active GitHub connection.</li>
          <li>Sign out separately from ZeroHub and desktop Zero. Desktop sign-out clears Zero’s local credential record; website sign-out clears its browser session. Neither deletes repositories, public records, stars or local project history, or signs you out of GitHub itself.</li>
          <li>Review or revoke the Codepet Zero App’s access and manage repository visibility, collaborators, stars and published sites in GitHub’s settings. Revoking access can disable connected features without deleting your work.</li>
          <li>Clear browser site data to remove local preferences and browser storage. Local editor state is separate. Keep backups before removing project files or resetting editor storage.</li>
          <li>Contact us to request access, correction, deletion or information about how your personal information is handled, or to withdraw consent where applicable. Some requests require proportionate identity verification or may be limited by law or another party’s control of the record. We will explain the applicable next steps.</li>
        </ul>
        <p>You may raise a concern with the Office of the Privacy Commissioner of Canada or another regulator with jurisdiction. Nothing in the terms or beta warning removes rights available under applicable privacy law.</p>
      </section>
      <section>
        <h2>7. Students and younger users</h2>
        <p>Zero is designed for learning, including high-school use. Follow GitHub’s age and account requirements. A parent or legal guardian should be involved where required for meaningful consent; a teacher’s permission does not automatically replace it. Do not upload class lists, grades, private student information or someone else’s personal information without proper authority.</p>
        <p>If you believe a child has provided information without required consent, contact us so we can review the situation and appropriate action. This notice does not represent that age or guardian consent has been verified.</p>
      </section>
      <section id="contact">
        <h2>8. Contact and changes</h2>
        <p>Send privacy questions, requests or concerns to Codepet Inc. at <a href="mailto:info@codepet.ca">info@codepet.ca</a>. Describe the relevant service and record without including secrets or unnecessary personal information.</p>
        <p>We will update the date on this notice when it changes. Material new information uses will require an appropriate notice and consent where applicable. The use-based agreement in the <a href="/terms">Terms</a> does not authorize new uses of personal information or replace consent required by privacy law. Reading this page is not recorded as an explicit consent event.</p>
      </section>
    </main>
  </LearnTheme>;
}
