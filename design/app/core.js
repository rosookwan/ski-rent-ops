(() => {
  const root=document.getElementById('ski-ops');
  const registry=new Map(), actions=new Map(), searches=new Map(), changes=new Map();
  const state={page:'home',params:{},tabs:{},filters:{},history:[],menuOpen:false,authenticated:true};
  const $=s=>root.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>Number(n).toLocaleString('ko-KR')+'원';
  const date=s=>s?Number(s.slice(5,7))+'/'+Number(s.slice(8,10)):'';
  const icon=n=>'<i data-lucide="'+n+'" aria-hidden="true"></i>';
  const icons=()=>{if(globalThis.lucide)globalThis.lucide.createIcons({attrs:{width:20,height:20}});};
  const routes=[['home','오늘 현황','layout-dashboard'],['intake','새 대여 접수','circle-plus'],['rentals','렌탈현황','clipboard-list'],['dispatch','배달·수거','truck'],['partners','거래처 장부','handshake'],['closing','하루 마감','calculator'],['preparation','사전 입력·준비','list-checks'],['customers','고객관리','users'],['inventory','재고·정비','package'],['settings','매장 설정','settings-2'],['guide','QR 이용 안내','qr-code']];
  function nav(){return [routes.slice(0,6),routes.slice(6)].map((group,i)=>'<div class="so-nav-group">'+(i?'<span class="so-nav-caption">관리</span>':'')+group.map(([id,label,glyph])=>'<button type="button" class="so-nav-button" data-go="'+id+'" '+(registry.has(id)?'':'disabled')+' '+(activePage()===id?'aria-current="page"':'')+'>'+icon(glyph)+label+'</button>').join('')+'</div>').join('');}
  function activePage(){return registry.get(state.page)?.parent||state.page;}
  function go(page,params={},replace=false){if(!registry.has(page)){toast('이 화면은 다음 단계에 연결됩니다.');return;}close();if(!replace)state.history.push({page:state.page,params:state.params});state.page=page;state.params=params;root.classList.remove('so-menu-open');state.menuOpen=false;$('#so-menu-toggle').setAttribute('aria-expanded','false');render();}
  function render(){const config=registry.get(state.page);if(!config)return;root.classList.toggle('so-vehicle',state.page==='vehicle');$('#so-navigation').innerHTML=nav();$('#so-breadcrumb').textContent=config.title;$('#so-workspace').hidden=!!config.public;$('#so-public').hidden=!config.public;$('#so-entry').hidden=true;
    const modeButton=$('.so-topbar [data-go]');modeButton.dataset.go=state.page==='vehicle'?'home':'vehicle';modeButton.innerHTML=icon(state.page==='vehicle'?'monitor':'tablet')+(state.page==='vehicle'?'매장 화면':'차량 화면');
    const legacy=state.page==='intake'||state.page==='vehicle';$('#so-page').hidden=legacy;$('#so-legacy').hidden=!legacy;
    if(legacy){const l=$('#ski-first-look');l.dispatchEvent(new CustomEvent('ski:set-view',{detail:state.page==='vehicle'?'vehicle':'shop'}));}
    else {const target=config.public?$('#so-public'):$('#so-page');target.innerHTML=config.render();config.mount?.();}
    icons();}
  function close(){if($('#so-dialog').open)$('#so-dialog').close();$('#so-dialog-body').innerHTML='';}
  function modal(title,body){$('#so-dialog-title').textContent=title;$('#so-dialog-body').innerHTML=body;$('#so-dialog').showModal();icons();}
  let toastTimer;function toast(message){clearTimeout(toastTimer);$('#so-toast').textContent=message;$('#so-toast').hidden=false;toastTimer=setTimeout(()=>{$('#so-toast').hidden=true;},4500);}
  const button=(label,action,id='',kind='')=>'<button type="button" class="so-button '+kind+'" data-action="'+action+'" data-id="'+esc(id)+'">'+label+'</button>';
  const link=(label,page,id='',kind='')=>'<button type="button" class="so-button '+kind+'" data-go="'+page+'" data-id="'+esc(id)+'">'+label+'</button>';
  const status=(label,color='grey')=>'<span class="so-status '+color+'">'+esc(label)+'</span>';
  const head=(title,description='',action='',eyebrow='매장 운영')=>'<div class="so-pagehead"><div><span class="so-eyebrow">'+eyebrow+'</span><h1>'+title+'</h1>'+(description?'<p>'+description+'</p>':'')+'</div><div class="so-actions">'+action+'</div></div>';
  const panel=(title,body,action='')=>'<section class="so-panel"><div class="so-panel-head"><h2>'+title+'</h2>'+action+'</div>'+body+'</section>';
  const tabs=(options,fallback)=>{const selected=state.tabs[state.page]||fallback;return '<div class="so-tabs" aria-label="'+esc(registry.get(state.page)?.title)+' 보기">'+options.map(([id,label])=>'<button type="button" class="so-tab" data-subtab="'+id+'" aria-pressed="'+(selected===id)+'">'+label+'</button>').join('')+'</div>';};
  const field=(label,value='',type='text',attr='')=>'<label class="so-field">'+label+'<input type="'+type+'" value="'+esc(value)+'" '+attr+'></label>';
  const select=(label,options,value='',attr='')=>'<label class="so-field">'+label+'<select '+attr+'>'+options.map(o=>{const a=Array.isArray(o)?o:[o,o];return '<option value="'+esc(a[0])+'" '+(value===a[0]?'selected':'')+'>'+esc(a[1])+'</option>';}).join('')+'</select></label>';
  const previewNote='<p class="so-preview-note">화면 체험용 예시입니다. 저장·정산·문자 발송은 실행되지 않습니다.</p>';
  function preview(title,body){modal(title,body+previewNote+'<div class="so-dialog-actions">'+button('닫기','close','','primary')+'</div>');}
  root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.go){go(b.dataset.go,b.dataset.id?{id:b.dataset.id}:{});return;}if(b.dataset.subtab){state.tabs[state.page]=b.dataset.subtab;render();return;}if(b.dataset.action&&actions.has(b.dataset.action)){actions.get(b.dataset.action)(b.dataset.id,b);return;}if(b.id==='so-menu-toggle'){state.menuOpen=!state.menuOpen;root.classList.toggle('so-menu-open',state.menuOpen);b.setAttribute('aria-expanded',String(state.menuOpen));}});
  root.addEventListener('input',e=>{const key=e.target.dataset.search;if(key&&searches.has(key))searches.get(key)(e.target.value);});
  root.addEventListener('change',e=>{const key=e.target.dataset.change;if(key&&changes.has(key))changes.get(key)(e.target.value,e.target);});
  root.addEventListener('submit',e=>e.preventDefault());
  root.addEventListener('click',e=>{const b=e.target.closest('#ski-first-look button');if(!b)return;if(b.dataset.view){e.stopPropagation();go(b.dataset.view==='vehicle'?'vehicle':'intake');return;}if(['board','show-saved'].includes(b.dataset.action)){e.stopPropagation();go('dispatch');return;}if(b.dataset.action==='save'){e.stopPropagation();root.querySelector('#ski-first-look [data-action="quote"]')?.click();return;}if(['send-sms','complete-confirm','final-confirm','customer-save','save-time-settings','ack'].includes(b.dataset.action)||b.hasAttribute('data-alert')||b.hasAttribute('data-final')){e.stopPropagation();toast('처리 화면 예시입니다. 실제 저장·발송·상태 변경은 하지 않습니다.');}},true);
  actions.set('close',close);actions.set('back',()=>{const prev=state.history.pop();if(prev)go(prev.page,prev.params,true);else go('home',{},true);});actions.set('logout',()=>{if(registry.has('login'))go('login',{},true);else go('home');});
  window.SkiOps={root,$,state,data:window.SkiOpsData,register:(id,config)=>registry.set(id,config),action:(id,fn)=>actions.set(id,fn),search:(id,fn)=>searches.set(id,fn),change:(id,fn)=>changes.set(id,fn),go,render,modal,preview,close,toast,esc,money,date,icon,icons,button,link,status,head,panel,tabs,field,select,previewNote,start:()=>go(registry.has('login')?'login':'home',{},true)};
})();
