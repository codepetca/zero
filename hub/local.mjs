// Disposable developer demo. Local identity and fake storage never deploy by default.
import http from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createHub} from './service/hub.mjs';
import {startDisposablePostgres} from './service/postgres-fixture.mjs';
import * as checker from './checker/runner.mjs';
import {starterUiBundle} from './fixtures/starter-ui.mjs';
export async function startLocalHub({port=8788,databasePort=15440,origin='http://127.0.0.1:3177',output}={}) {
  if (!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid local hub port');
  output=resolve(output||`.verification/hub-${randomUUID()}`);
  await mkdir(output,{recursive:true,mode:0o700});
  const database=await startDisposablePostgres({port:databasePort});
  let server,hub;
  try {
    hub=createHub({pool:database.pool,storageRoot:resolve(output,'objects'),checker,origin,localIdentity:{id:'101',login:'zero-local-demo'}});
    await hub.migrate();server=http.createServer(hub.handler);server.requestTimeout=30000;server.headersTimeout=15000;
    await new Promise((res,rej)=>server.once('error',rej).listen(port,'127.0.0.1',res));
    hub.startWorkers();
    return {hub,output,server,async stop(){await hub.stop();await new Promise(res=>server.close(res));await database.stop();}};
  } catch(error) {if(server)server.close();if(hub)await hub.stop();await database.stop();throw error;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const args=process.argv.slice(2);const take=(flag)=>{const index=args.indexOf(flag);return index<0?undefined:args[index+1];};
  const demo=await startLocalHub({output:take('--output'),origin:take('--origin')||'http://127.0.0.1:3177'});
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await demo.stop();};
  process.on('SIGINT',()=>stop().finally(()=>process.exit(0)));process.on('SIGTERM',()=>stop().finally(()=>process.exit(0)));
  try {
    if(args.includes('--starter-ui')) {
      const actor={id:'101',login:'zero-local-demo'};
      const reservation=await demo.hub.reserveLibrary(actor,{className:'ScoreDisplay',title:'Starter UI'});
      const bundle=await starterUiBundle(reservation.libraryId);
      if(take('--preview'))bundle.files['preview.png']=(await readFile(take('--preview'))).toString('base64');
      const submitted=await demo.hub.submit(actor,bundle);
      while(true) {
        const status=await demo.hub.getSubmission(actor,submitted.id);
        if(['published','failed'].includes(status.status)) {
          await writeFile(resolve(demo.output,'dogfood.json'),JSON.stringify({submission:status,bundle},null,2)+'\n');
          if(status.status!=='published')throw new Error('Local Starter UI failed; inspect the source-bound dogfood report');
          console.log(`Starter UI ${reservation.libraryId} ${bundle.descriptor.version} listed locally.`);break;
        }
        await new Promise(res=>setTimeout(res,500));
      }
    }
    console.log('Disposable ZeroHub at http://127.0.0.1:8788. Website: ZERO_HUB_URL=http://127.0.0.1:8788 npm run dev -- --port 3177');
    console.log(`Local test identity only. Database disappears on exit. Evidence: ${demo.output}`);
  } catch(error) {await stop();throw error;}
}
