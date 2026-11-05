import {postJamSettlementResponse} from '@/lib/jams-http.mjs';
import {hiddenJamsResponse} from '@/lib/jams-visibility.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = (request: Request) => hiddenJamsResponse() ?? postJamSettlementResponse(request);
