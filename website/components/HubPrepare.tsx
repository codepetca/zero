import Link from 'next/link';
import {HubRequestResults} from './HubRequestResults';
export function HubPrepare({view}:{view?:'library'|'requests'}={}) {
  return <>
    {view!=='requests'&&<p className="hub-note">To put a game on ZeroHub, <Link href="/hub?kind=game&view=publish">publish it as an app</Link>.</p>}
    {view!=='requests'&&<section><h2>Before you share</h2><p>In Zero’s sidebar, choose <strong>Start Page → Sign in to Zero</strong> and connect your own public GitHub repository.</p><p>The sharing form opens on GitHub. Use the same account as Zero. Browsing and downloads need no sign-in.</p></section>}
    {(!view||view==='library')&&<section>
      {!view&&<h2>Share a library</h2>}
      <ol className="steps">
        <li>In a public GitHub project you own, use <strong>Extract library</strong>. Review the generated folder and Java imports.</li>
        <li>Use <strong>Check library</strong> to check the API, behavior and two examples locally. To share from a current Zero project, select MIT and include the complete notice with its copyright line in the library’s <code>LICENSE</code> file. Use code you have the rights to share under MIT.</li>
        <li>Commit and push your source. Choose <strong>Share library</strong>, review the exact committed folder and version, and use <strong>Open GitHub form</strong>. Submit the form on GitHub.</li>
        <li>Paste the issue URL into <Link href="/hub/share?view=requests">Requests and results</Link> and choose <strong>Check request</strong>. Once <strong>View exact release</strong> appears, try the library in a second project.</li>
      </ol>
      <p>The updated editor extracts original libraries from current Zero projects into <code>zero.lib</code>. Copy the exact import for the release you add. Published versions keep their original imports and files.</p>
    </section>}
    {(!view||view==='library')&&<section>
      <h2>Tutorial practice: CreditsBadge</h2>
      <p><Link href="/tutorials/11">Lesson 11</Link> gives you the CreditsBadge exercise and its original MIT notice. Use the reserved folder <code>libraries/tutorial-credits-badge/</code> and follow the submitted issue through the same hosted checks.</p>
      <p>Accepted tutorial copies appear in <Link href="/hub?kind=practice">Tutorial practice</Link>. Maintainers may remove listings during cleanup. Source and accepted artifacts are retained.</p>
    </section>}
    {(!view||view==='requests')&&<section>{!view&&<h2>Requests and results</h2>}<p>Zero opens the <a href="https://github.com/codepetca/zero/issues/new/choose">official GitHub publication form</a> with the source identity already filled in. Submit the form using the same GitHub account as Zero. The request and its result are public; keep private information out of sharing metadata.</p><p>Use the updated Zero editor to prepare a request. <a href="https://github.com/codepetca/zero/issues">View official GitHub requests</a>. Coursework repository links still go separately to Pika.</p><HubRequestResults/><p><Link href="/hub">Browse ZeroHub</Link> · <Link href="/">Get Zero</Link></p></section>}
  </>;
}
