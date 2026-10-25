import {postJamProposalResponse} from '@/lib/jams-http.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = (request: Request) => postJamProposalResponse(request);
