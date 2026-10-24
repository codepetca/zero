import {catalogResponse} from '@/lib/sharing-catalog.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {return catalogResponse(request,{practiceOnly:true});}
