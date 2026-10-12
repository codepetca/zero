// Pure SQL authority validation for either Node HTTP or hosted Web adapters.
export const configurationError=message=>Object.assign(new Error(message),{code:'ZERO_HUB_CONFIG'});
const RUNTIME_ROLES=new Set(['hub_api','hub_checker','hub_publisher']);

// A runtime LOGIN has membership in exactly its own NOLOGIN group, and carries
// no object grants itself. SET ROLE is a convenience, not a credential boundary:
// RESET ROLE must expose no second source of authority. Direct CONNECT on this
// database is the only object-grant exception; PUBLIC defaults are not direct
// grants. Table/column/sequence, schema, routine and other object ACLs are checked
// conservatively rather than trying to duplicate the group's migration policy.
const LOGIN_AUTHORITY_SQL=`
WITH RECURSIVE login AS (
  SELECT oid,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolcanlogin
  FROM pg_roles WHERE rolname=session_user
), memberships(roleid) AS (
  SELECT m.roleid FROM pg_auth_members m JOIN login l ON m.member=l.oid
  UNION
  SELECT m.roleid FROM pg_auth_members m JOIN memberships parent ON m.member=parent.roleid
), direct_acl AS (
  SELECT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
  UNION ALL SELECT a.grantee FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a
  UNION ALL SELECT a.grantee FROM pg_namespace c CROSS JOIN LATERAL aclexplode(c.nspacl) a
  UNION ALL SELECT a.grantee FROM pg_proc c CROSS JOIN LATERAL aclexplode(c.proacl) a
  UNION ALL SELECT a.grantee FROM pg_type c CROSS JOIN LATERAL aclexplode(c.typacl) a
  UNION ALL SELECT a.grantee FROM pg_language c CROSS JOIN LATERAL aclexplode(c.lanacl) a
  UNION ALL SELECT a.grantee FROM pg_foreign_data_wrapper c CROSS JOIN LATERAL aclexplode(c.fdwacl) a
  UNION ALL SELECT a.grantee FROM pg_foreign_server c CROSS JOIN LATERAL aclexplode(c.srvacl) a
  UNION ALL SELECT a.grantee FROM pg_largeobject_metadata c CROSS JOIN LATERAL aclexplode(c.lomacl) a
  UNION ALL SELECT a.grantee FROM pg_default_acl c CROSS JOIN LATERAL aclexplode(c.defaclacl) a
  UNION ALL SELECT a.grantee FROM pg_parameter_acl c CROSS JOIN LATERAL aclexplode(c.paracl) a
  UNION ALL SELECT a.grantee FROM pg_tablespace c CROSS JOIN LATERAL aclexplode(c.spcacl) a
  UNION ALL SELECT a.grantee FROM pg_database c CROSS JOIN LATERAL aclexplode(c.datacl) a
    WHERE c.datname<>current_database() OR a.privilege_type<>'CONNECT' OR a.is_grantable
)
SELECT
  l.rolsuper OR l.rolcreaterole OR l.rolcreatedb OR l.rolreplication OR l.rolbypassrls OR NOT l.rolcanlogin AS elevated,
  EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$1 AND (r.rolcanlogin OR r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)) AS group_elevated,
  NOT EXISTS(SELECT FROM memberships m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname=$1) AS missing_group,
  EXISTS(SELECT FROM memberships m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname<>$1) AS extra_membership,
  EXISTS(SELECT FROM pg_auth_members m WHERE m.admin_option AND (m.member=l.oid OR m.member IN (SELECT roleid FROM memberships))) AS membership_admin,
  EXISTS(SELECT FROM direct_acl a WHERE a.grantee=l.oid) AS direct_grants,
  EXISTS(SELECT FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass AND d.refobjid IN (l.oid,(SELECT oid FROM pg_roles WHERE rolname=$1)) AND d.deptype='o') AS owned_objects
FROM login l`;

export async function verifyRole(pool,expected) {
  if(expected!=='hub_migration_owner'&&!RUNTIME_ROLES.has(expected))throw configurationError('Unsupported hub database role');
  const {rows:[row]}=await pool.query('SELECT current_user AS role');
  if(row?.role!==expected)throw configurationError('Database runtime role was not established');
  // Migration is a deliberately privileged operator process, never a runtime URL.
  if(expected==='hub_migration_owner')return;
  const {rows:[authority]}=await pool.query(LOGIN_AUTHORITY_SQL,[expected]);
  if(!authority||Object.values(authority).some(Boolean))throw configurationError('Runtime database login must have only its own restricted role, no extra memberships, direct object grants or owned objects');
}
