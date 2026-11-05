/* Shared loader. Only requests our authenticated same-origin API. */
(() => {
  const cloud=window.ReportCloud={version:null,bundle:null,apply:null,ready:false};
  let busy=false,timer=null;
  const kind=document.documentElement.dataset.cloudReport;
  const label=document.createElement('div');label.id='cloud-status';label.setAttribute('role','status');label.textContent='Đang kết nối dữ liệu…';document.body.append(label);
  const boot=document.createElement('div');boot.id='cloud-boot';boot.innerHTML='<div><strong>Đang mở report</strong><p>Đang lấy phiên bản dữ liệu hoàn chỉnh mới nhất.</p></div>';document.body.append(boot);
  const status=text=>label.textContent=text;
  const message=error=>error?.message||'Không thể kết nối nguồn dữ liệu.';
  async function json(url){if(window.ReportTransport)return window.ReportTransport.latest();const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(r.status===401||r.status===403)throw Error('Phiên đăng nhập đã hết hạn. Tải lại trang để đăng nhập.');if(!r.ok)throw Error('Nguồn dữ liệu chưa sẵn sàng. Report giữ nguyên dữ liệu hiện tại.');return r.json();}
  cloud.validate=(data,manifest)=>{
    if(data?.schema!==1||!Array.isArray(data.axes)||data.axes.length!==6||data.axes.some(a=>!Array.isArray(a))||!Array.isArray(data.rows)||data.rows.length!==manifest.rows||!data.rows.length)throw Error('Snapshot không hợp lệ.');
    for(const r of data.rows){if(!Array.isArray(r)||r.length!==12)throw Error('Sai cấu trúc dòng dữ liệu.');for(let i=0;i<6;i++)if(!Number.isInteger(r[i])||r[i]<0||r[i]>=data.axes[i].length)throw Error('Sai chỉ mục dữ liệu.');for(let i=6;i<11;i++)if(!Number.isFinite(r[i])||r[i]<0)throw Error('Sai giá trị chỉ số.');}
    return data;
  };
  cloud.toAlert=data=>{
    const apps=data.axes[1].map(key=>{const m=key.match(/^(.*) ⟦([^⟧]+)⟧$/);return m?[m[1],m[2]]:[key,'Unknown'];});
    return data.rows.map(r=>[data.axes[0][r[0]],apps[r[1]][0],apps[r[1]][1],data.axes[2][r[2]],data.axes[3][r[3]],data.axes[4][r[4]],data.axes[5][r[5]],r[6],r[7],r[8],r[9],r[10]]);
  };
  async function download(manifest){
    if(manifest.schema!==1||!/^\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(manifest.version)||!Number.isInteger(manifest.rows)||manifest.rows<1||!/^[a-f0-9]{64}$/.test(manifest.sha256))throw Error('Thông tin phiên bản không hợp lệ.');
    status('Đang tải dữ liệu mới…');
    if(window.ReportTransport)return cloud.validate(await window.ReportTransport.snapshot(manifest),manifest);
    const r=await fetch(`/api/snapshots/${encodeURIComponent(manifest.version)}/data`,{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)throw Error('Không tải được snapshot. Sẽ thử lại, dữ liệu hiện tại được giữ nguyên.');
    const bytes=await r.arrayBuffer();
    if(bytes.byteLength!==manifest.bytes)throw Error('File tải về chưa đầy đủ.');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==manifest.sha256)throw Error('Kiểm tra toàn vẹn dữ liệu không đạt.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return cloud.validate(await new Response(stream).json(),manifest);
  }
  function showFresh(m){const time=new Date(m.generatedAt).toLocaleString('vi-VN');status(`${m.synthetic?'DEMO · ':''}Cập nhật: ${time} · ${m.from} → ${m.to}`);label.title='Hai report cùng sử dụng phiên bản '+m.version;}
  function applyWeeklyBootstrap(data){const el=document.getElementById('bootstrap'),config=JSON.parse(el.textContent);config.axes=data.axes;config.rows=data.rows;config.metadata=data.metadata;config.importRows=data.rows.length;el.textContent=JSON.stringify(config);}
  async function start(){
    try{
      if(window.ReportTransport)await window.ReportTransport.ready;
      const manifest=await json('/api/latest');const data=await download(manifest);cloud.bundle=data;
      if(kind==='weekly')applyWeeklyBootstrap(data);
      for(const source of document.querySelectorAll('script[data-cloud-script]')){
        const script=document.createElement('script');script.textContent=source.textContent;document.body.append(script);source.remove();
      }
      await window.reportReady;
      if(typeof cloud.apply!=='function')throw Error('Report chưa khởi tạo thành công.');
      cloud.version=manifest.version;cloud.ready=true;cloud.bundle=null;showFresh(manifest);boot.remove();document.documentElement.classList.add('cloud-ready');
      timer=setInterval(check,60000);
    }catch(error){status(message(error));boot.replaceChildren();const box=document.createElement('div'),p=document.createElement('p'),button=document.createElement('button');p.textContent=message(error);button.textContent='Thử lại / đăng nhập lại';button.onclick=()=>location.reload();box.append(p,button);boot.append(box);}
  }
  async function check(){
    if(busy||document.hidden||!cloud.ready||document.querySelector('#overlay:not(.hidden),#modal-overlay:not(.hidden),.loading:not(.hidden),#country-drawer:not(.hidden)'))return;
    busy=true;
    try{const manifest=await json('/api/latest');if(manifest.version===cloud.version){showFresh(manifest);return;}
      const data=await download(manifest);
      if(document.querySelector('#overlay:not(.hidden),#modal-overlay:not(.hidden),.loading:not(.hidden)')){status('Dữ liệu mới đã sẵn sàng; sẽ cập nhật sau khi đóng hộp thoại.');return;}
      await cloud.apply(data);cloud.version=manifest.version;showFresh(manifest);
    }catch(error){status(message(error));}finally{busy=false;}
  }
  cloud.check=check;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  window.addEventListener('online',check);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  start();
})();
