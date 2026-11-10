import {Pool} from 'pg';

const table = 'zero_hub_listings.projects';
const sequence = "nextval('zero_hub_listings.position')";
const fields = 'repository_id, repository_url, title, author, pages_url, source_commit, run_id, run_created_at, queue_position, listed_order, protected';
const configuredPools = new Map();
export const listingPageSize = 8;
export const listingsEnabled = (env = process.env) => env.ZERO_HUB_LISTINGS_ENABLED === '1' && env.VERCEL_ENV !== 'preview';

export function listingLimit(accountId, env = process.env) {
  const ids = (env.ZERO_HUB_LISTINGS_PRO_GITHUB_IDS || '').split(',').map(id => id.trim());
  return ids.length <= 256 && new Set(ids).size === ids.length &&
    ids.every(id => /^[1-9][0-9]{0,19}$/.test(id)) && ids.includes(accountId) ? 10 : 1;
}

function project(row) {
  return {
    repositoryId:row.repository_id, repositoryUrl:row.repository_url, title:row.title, author:row.author,
    pagesUrl:row.pages_url, commit:row.source_commit, runId:row.run_id,
    runCreatedAt:row.run_created_at, listed:row.queue_position !== null, protected:row.protected
  };
}

function comparePublication(saved, incoming) {
  const delta = incoming.runCreatedAt.getTime() - saved.run_created_at.getTime();
  if (delta) return delta;
  const runDelta = BigInt(incoming.runId) - BigInt(saved.run_id);
  return runDelta === 0n ? 0 : runDelta > 0n ? 1 : -1;
}

export function createHubListingsStore(pool) {
  async function transaction(account, operation) {
    const client = await pool.connect();
    let discard = false;
    try {
      await client.query('BEGIN');
      // All changes to a user's quota, protection and queue use the same lock.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('zero-hub-listings:' || $1::text, 0))", [account]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally {
      // A connection whose transaction cannot be reset must leave the pool.
      client.release(discard);
    }
  }

  async function savePublication(account, limit, incoming, {restore = false} = {}) {
    return transaction(account, async client => {
      const args = [account, incoming.repositoryId];
      const {rows:[saved]} = await client.query(`SELECT ${fields} FROM ${table} WHERE account_id=$1 AND repository_id=$2`, args);
      if (restore && !saved) return {status:'missing'};
      const order = saved ? comparePublication(saved, incoming) : 1;
      // A retried publish can neither bring back an unlisted card nor evict a
      // second card. The explicit List action is allowed to retry placement.
      if (order < 0 || (order === 0 && !restore)) {
        return {status:saved.queue_position === null ? 'unlisted' : 'listed', alreadyRecorded:true};
      }

      const values = [...args, incoming.repositoryUrl, incoming.title, incoming.author,
        incoming.pagesUrl, incoming.commit, incoming.runId, incoming.runCreatedAt];
      await client.query(`INSERT INTO ${table}
        (account_id, repository_id, repository_url, title, author, pages_url, source_commit, run_id, run_created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (account_id, repository_id) DO UPDATE SET
        repository_url=EXCLUDED.repository_url, title=EXCLUDED.title, author=EXCLUDED.author,
        pages_url=EXCLUDED.pages_url, source_commit=EXCLUDED.source_commit, run_id=EXCLUDED.run_id,
        run_created_at=EXCLUDED.run_created_at`, values);
      if (saved?.queue_position != null) return {status:'listed'};

      const {rows:active} = await client.query(`SELECT repository_id, title, protected FROM ${table}
        WHERE account_id=$1 AND queue_position IS NOT NULL ORDER BY queue_position`, [account]);
      const replacement = active.length === limit ? active.find(item => !item.protected) : null;
      // An account above its current allowance can unlist cards before adding.
      if (active.length >= limit && !replacement) return {status:'unlisted', reason:active.length > limit ? 'limit' : 'protected'};
      if (replacement) {
        await client.query(`UPDATE ${table} SET queue_position=NULL, listed_order=NULL
          WHERE account_id=$1 AND repository_id=$2`, [account, replacement.repository_id]);
      }
      await client.query(`UPDATE ${table} SET queue_position=position.value, listed_order=position.value
        FROM (SELECT ${sequence} AS value) position WHERE account_id=$1 AND repository_id=$2`, args);
      return {status:'listed', ...(replacement ? {replaced:replacement.title} : {})};
    });
  }

  async function manage(account, repositoryId, action) {
    return transaction(account, async client => {
      const args = [account, repositoryId];
      const {rows:[saved]} = await client.query(`SELECT queue_position, protected FROM ${table}
        WHERE account_id=$1 AND repository_id=$2`, args);
      if (saved?.queue_position == null) return false;
      if (action === 'protect' && !saved.protected) {
        await client.query(`UPDATE ${table} SET protected=false WHERE account_id=$1 AND protected`, [account]);
        await client.query(`UPDATE ${table} SET protected=true WHERE account_id=$1 AND repository_id=$2`, args);
      } else if (action === 'unprotect') {
        await client.query(`UPDATE ${table} SET protected=false WHERE account_id=$1 AND repository_id=$2`, args);
      } else if (action === 'move') {
        await client.query(`UPDATE ${table} SET queue_position=${sequence} WHERE account_id=$1 AND repository_id=$2`, args);
      } else if (action === 'unlist') {
        await client.query(`UPDATE ${table} SET queue_position=NULL, listed_order=NULL, protected=false
          WHERE account_id=$1 AND repository_id=$2`, args);
      }
      return true;
    });
  }

  async function owned(account, repositoryId) {
    const {rows:[row]} = await pool.query(`SELECT ${fields} FROM ${table}
      WHERE account_id=$1 AND repository_id=$2`, [account, repositoryId]);
    return row ? project(row) : null;
  }

  async function mine(account) {
    const {rows} = await pool.query(`SELECT ${fields} FROM ${table} WHERE account_id=$1
      ORDER BY queue_position NULLS LAST, run_created_at DESC, repository_id LIMIT 50`, [account]);
    return rows.map(project);
  }

  async function discover(before, search) {
    const {rows} = await pool.query(`SELECT account_id, ${fields} FROM ${table} WHERE listed_order IS NOT NULL
      AND ($1::bigint IS NULL OR listed_order < $1)
      AND ($2 = '' OR strpos(lower(title || ' ' || author), lower($2)) > 0)
      ORDER BY listed_order DESC LIMIT $3`, [before, search, listingPageSize + 1]);
    return {
      entries:rows.slice(0, listingPageSize).map(row => ({...project(row), accountId:row.account_id, order:row.listed_order})),
      next:rows.length > listingPageSize ? rows[listingPageSize - 1].listed_order : null
    };
  }

  async function stillListed(entries) {
    if (!entries.length) return [];
    const {rows} = await pool.query(`SELECT listed_order, repository_url, pages_url FROM ${table}
      WHERE listed_order=ANY($1::bigint[])`, [entries.map(entry => entry.order)]);
    const current = new Map(rows.map(row => [row.listed_order, row]));
    return entries.filter(entry => {
      const row = current.get(entry.order);
      return row?.repository_url === entry.repositoryUrl && row.pages_url === entry.pagesUrl;
    });
  }

  return {savePublication, manage, owned, mine, discover, stillListed};
}

export function configuredListingsStore(env = process.env) {
  if (!listingsEnabled(env)) return null;
  const connectionString = env.ZERO_HUB_LISTINGS_DATABASE_URL;
  const url = new URL(connectionString);
  const local = !env.VERCEL && ['development','test'].includes(env.NODE_ENV) && url.hostname === '127.0.0.1';
  if (url.protocol !== 'postgresql:' || !url.hostname || !url.username || !url.pathname.slice(1) || url.search || url.hash)
    throw new Error('Invalid listing database configuration');
  if (!configuredPools.has(connectionString)) {
    const pool = new Pool({connectionString, ssl:local ? false : {rejectUnauthorized:true},
      max:4, connectionTimeoutMillis:2500, idleTimeoutMillis:10_000,
      statement_timeout:2500, idle_in_transaction_session_timeout:5000});
    pool.on('error', () => {});
    configuredPools.set(connectionString, createHubListingsStore(pool));
  }
  return configuredPools.get(connectionString);
}
