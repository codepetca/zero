import {getStarResponse, postStarResponse} from '@/lib/hub-stars.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return getStarResponse(request); }
export async function POST(request: Request) { return postStarResponse(request); }
