#!/usr/bin/env node
import {reconcileProblemReports} from '../website/lib/problem-reports-reconcile.mjs';

// Health inspection is the default. --apply explicitly enables public GitHub
// issue delivery using the dedicated server environment; never student tokens.
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--apply') || args.length > 1) {
  console.error('Usage: node scripts/reconcile-problem-reports.mjs [--apply]');
  process.exitCode = 2;
} else {
  const result = await reconcileProblemReports({apply:args.includes('--apply')});
  console.log(JSON.stringify(result));
  if (result.status !== 'ok') process.exitCode = 1;
}
