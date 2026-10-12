// Pure SQL authority validation for either Node HTTP or hosted Web adapters.
export const configurationError=message=>Object.assign(new Error(message),{code:'ZERO_HUB_CONFIG'});
export async function verifyRole(pool,expected) {
  const {rows:[row]}=await pool.query('SELECT current_user AS role');
  if(row.role!==expected) throw configurationError('Database runtime role was not established');
  if(expected!=='hub_migration_owner') {
    const {rows:[authority]}=await pool.query("SELECT r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls AS elevated, EXISTS(SELECT FROM pg_database d WHERE d.datname=current_database() AND pg_has_role(session_user,d.datdba,'MEMBER')) AS database_owner, pg_has_role(session_user,'hub_migration_owner','MEMBER') AS owner, pg_has_role(session_user,'hub_api','MEMBER') AS api, pg_has_role(session_user,'hub_checker','MEMBER') AS checker, pg_has_role(session_user,'hub_publisher','MEMBER') AS publisher FROM pg_roles r WHERE r.rolname=session_user");
    if(!authority || authority.elevated || authority.database_owner || authority.owner || ['api','checker','publisher'].some(role=>role!==expected.slice(4)&&authority[role]))throw configurationError('Runtime database login must have only its own restricted role');
  }
}
