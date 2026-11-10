import Link from 'next/link';
import styles from '@/app/hub/hub.module.css';

export type HubSection = 'game'|'library'|'listings'|'share'|'jams';
type MenuItem = [label:string,href:string,current:boolean,visible?:boolean];

export function HubNavigation({active,path='/hub',view='',showListings=false,showJams=false,canCreateJam=false}:{
  active:HubSection;path?:string;view?:string;showListings?:boolean;showJams?:boolean;canCreateJam?:boolean;
}) {
  const groups:{id:string;label:string;href:string;visible?:boolean;items:MenuItem[]}[] = [
    {id:'share',label:'Share your work',href:'/hub/share',items:[
      ['Share a game','/hub/share?view=game',view==='game'],
      ['Share a library','/hub/share?view=library',view==='library'],
      ['Requests and results','/hub/share?view=requests',view==='requests']
    ]},
    {id:'game',label:'Projects',href:'/hub?kind=game',items:[
      ['Browse projects','/hub?kind=game',view!=='publish'],
      ['Publish an app','/hub?kind=game&view=publish',view==='publish']
    ]},
    {id:'library',label:'Libraries',href:'/hub?kind=library',items:[
      ['Browse libraries','/hub?kind=library',view!=='use'&&view!=='practice'],
      ['Add a library','/hub?kind=library&view=use',view==='use']
    ]},
    {id:'listings',label:'My Apps',href:'/hub/listings',visible:showListings,items:[
      ['Manage apps','/hub/listings',view!=='help'],
      ['How app listings work','/hub/listings?view=help',view==='help']
    ]},
    {id:'jams',label:'Jams',href:'/hub/jams',visible:showJams,items:[
      ['Browse jams','/hub/jams',path==='/hub/jams'],
      ['Create a jam','/hub/jams/create',path==='/hub/jams/create',canCreateJam],
      ['How jams work','/hub/jams/rules',path==='/hub/jams/rules']
    ]}
  ];

  return <nav aria-label="ZeroHub catalog">
    <ul className={styles.navigation}>{groups.filter(group=>group.visible!==false).map(group=>{
      const expanded=active===group.id;
      const items=group.items.filter(([, , ,visible])=>visible!==false);
      const hasCurrentChild=expanded&&items.some(([, ,current])=>current);
      return <li key={group.id}>
        <Link href={group.href} className={group.id==='share'?styles.shareAction:undefined}
          data-active={expanded||undefined} aria-current={expanded&&!hasCurrentChild?'location':undefined}>{group.label}</Link>
        {expanded&&<ul className={styles.subnavigation} aria-label={`${group.label} options`}>
          {items.map(([label,href,current])=><li key={href}>
            <Link href={href} aria-current={current?'page':undefined}>{label}</Link>
          </li>)}
        </ul>}
      </li>;
    })}</ul>
  </nav>;
}
