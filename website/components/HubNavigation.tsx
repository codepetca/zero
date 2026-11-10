import Link from 'next/link';
import styles from '@/app/hub/hub.module.css';

export type HubSection = 'game'|'library'|'jams';
type MenuItem = [label:string,href:string,current:boolean,visible?:boolean];

export function HubNavigation({active,path='/hub',view='',showListings=false,showJams=false,canCreateJam=false}:{
  active:HubSection;path?:string;view?:string;showListings?:boolean;showJams?:boolean;canCreateJam?:boolean;
}) {
  const projectListings=path==='/hub/listings';
  const sharing=path==='/hub/share';
  const groups:{id:string;label:string;href:string;visible?:boolean;items:MenuItem[]}[] = [
    {id:'game',label:'Projects',href:'/hub?kind=game',items:[
      ['Browse projects','/hub?kind=game',!sharing&&!projectListings&&view!=='publish'],
      ['My Projects','/hub/listings',projectListings&&view!=='help',showListings],
      ['Publish an app','/hub?kind=game&view=publish',!sharing&&!projectListings&&view==='publish'],
      ['Share a game','/hub/share?view=game',sharing&&view==='game'],
      ['How app listings work','/hub/listings?view=help',projectListings&&view==='help',showListings]
    ]},
    {id:'library',label:'Libraries',href:'/hub?kind=library',items:[
      ['Browse libraries','/hub?kind=library',!sharing&&!['use','practice','mine'].includes(view)],
      ['My Libraries','/hub?kind=library&view=mine',!sharing&&view==='mine'],
      ['Add a library','/hub?kind=library&view=use',!sharing&&view==='use'],
      ['Share a library','/hub/share?view=library',sharing&&view==='library'],
      ['Requests and results','/hub/share?view=requests',sharing&&view==='requests']
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
        <Link href={group.href} data-active={expanded||undefined}
          aria-current={expanded&&!hasCurrentChild?'location':undefined}>{group.label}</Link>
        {expanded&&<ul className={styles.subnavigation} aria-label={`${group.label} options`}>
          {items.map(([label,href,current])=><li key={href}>
            <Link href={href} aria-current={current?'page':undefined}>{label}</Link>
          </li>)}
        </ul>}
      </li>;
    })}</ul>
  </nav>;
}
