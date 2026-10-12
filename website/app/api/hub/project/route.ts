import {projectResponse} from '@/lib/hub-project.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return projectResponse(request);}
