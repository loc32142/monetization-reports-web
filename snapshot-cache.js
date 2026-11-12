/* Shared, compressed snapshot cache. No auth tokens or manifests are trusted offline. */
(()=>{
 const DB='monetization-snapshots-v1',STORE='snapshots';
 let connection;
 function database(){
  if(!globalThis.indexedDB)return Promise.resolve(null);
  if(!connection)connection=new Promise(resolve=>{
   let settled=false;const timer=setTimeout(()=>finish(null),2500);
   const finish=db=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);resolve(db);};
   try{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>{request.result.createObjectStore(STORE,{keyPath:'scope'});};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();finish(db);};request.onerror=()=>finish(null);request.onblocked=()=>finish(null);}catch{finish(null);}
  });
  return connection;
 }
 async function transact(mode,action){
  const db=await database();if(!db)return null;
  return new Promise(resolve=>{let result=null,settled=false,tx;const done=value=>{if(!settled){settled=true;clearTimeout(timer);resolve(value);}};const timer=setTimeout(()=>{try{tx?.abort();}catch{}done(null);},2500);
   try{tx=db.transaction(STORE,mode);const request=action(tx.objectStore(STORE));if(request)request.addEventListener('success',()=>{result=request.result;});tx.oncomplete=()=>done(result);tx.onerror=tx.onabort=()=>done(null);}catch{done(null);}
  });
 }
 const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
 async function read(scope,manifest){
  const entry=await transact('readonly',s=>s.get(scope));
  if(!entry||entry.version!==manifest.version||entry.sha256!==manifest.sha256)return null;
  if(!(entry.blob instanceof Blob)||entry.blob.size!==manifest.bytes||await hash(entry.blob)!==manifest.sha256){await remove(scope);return null;}
  return entry.blob;
 }
 async function write(scope,manifest,blob){
  // One snapshot per account/project/bucket; do not let a slow old tab replace a newer version.
  await transact('readwrite',store=>{const request=store.get(scope);request.onsuccess=()=>{const previous=request.result;if(previous&&Date.parse(previous.generatedAt)>Date.parse(manifest.generatedAt))return;try{store.put({scope,version:manifest.version,sha256:manifest.sha256,generatedAt:manifest.generatedAt,blob});}catch{try{store.transaction.abort();}catch{}}};});
 }
 async function remove(scope){await transact('readwrite',s=>s.delete(scope));}
 async function clear(){await transact('readwrite',s=>s.clear());}
 async function load(scope,manifest,fetchBlob,decode,mayStore=()=>true){
  const run=async()=>{
   const cached=await read(scope,manifest);
   if(cached){try{const data=await decode(cached);return {data,hit:true};}catch{await remove(scope);}}
   const blob=await fetchBlob();
   if(blob.size!==manifest.bytes||await hash(blob)!==manifest.sha256)throw Error('Kiểm tra snapshot không đạt.');
   const data=await decode(blob);
   try{if(await mayStore())await write(scope,manifest,blob);}catch{/* Cache availability must not block a valid report. */}
   return {data,hit:false};
  };
  return globalThis.navigator?.locks? navigator.locks.request('report-snapshot:'+scope,run):run();
 }
 window.ReportSnapshotCache={load,clear,remove};
})();
