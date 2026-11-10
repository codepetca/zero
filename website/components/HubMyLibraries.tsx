'use client';

import {HubAccount,useHubGitHub} from './HubGitHub';
import {HubDiscovery} from './HubDiscovery';

export function HubMyLibraries({enforceJamVisibility}:{enforceJamVisibility:boolean}) {
  const {user}=useHubGitHub();
  if(user)return <HubDiscovery key={user.id} libraryOwnerId={user.id} enforceJamVisibility={enforceJamVisibility}/>;
  return <><h1>My Libraries</h1><HubAccount showSignOut={false}/></>;
}
