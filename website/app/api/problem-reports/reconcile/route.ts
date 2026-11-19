import {reconcileProblemReportsResponse} from '@/lib/problem-reports-reconcile.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 25;
export async function POST(request: Request) { return reconcileProblemReportsResponse(request); }
