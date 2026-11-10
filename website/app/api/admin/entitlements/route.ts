import {entitlementAdminResponse} from '@/lib/zero-entitlements-admin.mjs';
import {configuredEntitlementStore} from '@/lib/zero-entitlements-store.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return entitlementAdminResponse(request, {getStore:configuredEntitlementStore}); }
export function POST(request: Request) { return entitlementAdminResponse(request, {getStore:configuredEntitlementStore}); }
