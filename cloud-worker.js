/* Parsing and validation stay off the UI thread so the loader can animate. */
self.onmessage=async({data:{bytes,manifest,kind}})=>{
 try{
  const progress=(label,percent)=>self.postMessage({type:'progress',label,percent});
  progress('Đang giải nén dữ liệu…',null);
  const data=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  if(data.mediationGroupRows!==undefined&&(!Array.isArray(data.mediationGroups)||!Array.isArray(data.mediationGroupRows)||data.mediationGroupRows.length!==data.rows?.length||data.mediationGroups.some(g=>!g||typeof g.id!=='string'||typeof g.name!=='string')||data.mediationGroupRows.some(i=>i!==null&&(!Number.isInteger(i)||i<0||i>=data.mediationGroups.length))))throw Error('Sai dữ liệu mediation group.');
  if(data?.schema!==1||!Array.isArray(data.axes)||data.axes.length!==6||data.axes.some(x=>!Array.isArray(x))||!Array.isArray(data.rows)||data.rows.length!==manifest.rows||!data.rows.length)throw Error('Snapshot không hợp lệ.');
  const raw=kind==='alert'?new Array(data.rows.length):null;
  const apps=raw?data.axes[1].map(key=>{const m=key.match(/^(.*) ⟦([^⟧]+)⟧$/);return m?[m[1],m[2]]:[key,'Unknown'];}):null;
  for(let n=0;n<data.rows.length;n++){
   const r=data.rows[n];if(!Array.isArray(r)||r.length!==12)throw Error('Sai cấu trúc dòng dữ liệu.');
   for(let i=0;i<6;i++)if(!Number.isInteger(r[i])||r[i]<0||r[i]>=data.axes[i].length)throw Error('Sai chỉ mục dữ liệu.');
   for(let i=6;i<11;i++)if(!Number.isFinite(r[i])||r[i]<0)throw Error('Sai giá trị chỉ số.');
   if(raw)raw[n]=[data.axes[0][r[0]],apps[r[1]][0],apps[r[1]][1],data.axes[2][r[2]],data.axes[3][r[3]],data.axes[4][r[4]],data.axes[5][r[5]],r[6],r[7],r[8],r[9],r[10]];if(raw&&data.mediationGroupRows)raw[n].push(data.mediationGroups[data.mediationGroupRows[n]]||null);
   if(n%250000===0)progress('Đang kiểm tra '+n.toLocaleString('vi-VN')+' / '+data.rows.length.toLocaleString('vi-VN')+' dòng',75+Math.floor(n/data.rows.length*17));
  }
  if(raw){data.rows=raw;data.format='alert-expanded';}
  progress('Đang chuẩn bị giao diện…',94);self.postMessage({type:'done',data});
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
