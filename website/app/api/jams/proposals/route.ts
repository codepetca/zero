import {postJamProposalResponse} from '@/lib/jams-http.mjs';
import {authorizeJamRequest} from '@/lib/jams-access.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = (request: Request) => authorizeJamRequest(request) ?? postJamProposalResponse(request);
