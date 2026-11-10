import {PageHeader} from '@/components/PageHeader';
import {ZeroAccountDetails} from '@/components/ZeroAccount';
export default function ZeroAccountPage() {
  return <><PageHeader/><main id="page-content" className="zero-account-page"><h1>Zero account</h1><ZeroAccountDetails/><p>ZeroHub uses your verified Codepet Zero GitHub App access.</p></main></>;
}
