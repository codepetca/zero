import {receiveProblemReport} from '@/lib/problem-reports.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return receiveProblemReport(request); }
