(() => {
  const S=window.SkiOps,{esc,icon,button,field,select,panel}=S;
  let shop={name:'우리 스키샵',phone:'010-0000-0000',place:'만선 티롤 앞'};
  const people=[],vehicles=[['demo-van-1','1호 차량'],['demo-van-2','2호 차량']];
  const roles={manager:'관리자',counter:'카운터',driver:'기사님'};
  const places=['만선 티롤 앞','설천 주차장','만선 광장'];
  let sequence=0,personDraft=null;
  const vehicleName=id=>vehicles.find(row=>row[0]===id)?.[1]||'담당 차량 미지정';
  const phone=value=>{
    const text=String(value||'').trim(),digits=text.replace(/\D/g,'');
    if(text&&(!/^\+?[\d ()-]+$/.test(text)||digits.length<8||digits.length>15))throw new Error('연락처를 숫자 8~15자리로 확인해 주세요. 공백과 하이픈은 사용할 수 있습니다.');
    return text;
  };
  const name=(value,label)=>{
    const text=String(value||'').trim();
    if(!text||text.length>30)throw new Error(label+'을 1~30자로 입력해 주세요.');
    return text;
  };
  function error(message){const el=S.$('#so-operation-error');el.textContent=message;el.hidden=false;}
  const errorBox='<p id="so-operation-error" class="so-guest-error" role="alert" hidden></p>';
  function personRows(driver){
    const rows=people.filter(person=>(person.role==='driver')===driver);
    return rows.length?'<div class="so-person-list">'+rows.map(person=>'<button type="button" class="so-person-row" data-action="person-edit" data-id="'+person.id+'" aria-label="'+esc(person.name)+' 정보 수정"><span class="so-person-icon">'+icon(driver?'truck':'user-round')+'</span><span><strong>'+esc(person.name)+'</strong><span class="so-person-meta">'+(driver?vehicleName(person.vehicleId):roles[person.role])+'</span><span class="so-person-phone">'+esc(person.phone||'연락처 미등록')+'</span></span>'+icon('chevron-right')+'</button>').join('')+'</div>':'<p class="so-people-empty">'+(driver?'기사님 이름·연락처와 담당 차량을 등록하세요.':'관리자·카운터 직원을 추가하세요.')+'</p>';
  }
  function panels(){return '<div class="so-operations-directory">'+
    panel('매장 정보','<button type="button" class="so-shop-summary" data-action="shop-edit" aria-label="매장 정보 수정"><span><strong data-store-name>'+esc(shop.name)+'</strong><span>매장 대표번호 <b>'+esc(shop.phone||'미등록')+'</b></span><span>기본 수거 장소 <b>'+esc(shop.place)+'</b></span></span>'+icon('chevron-right')+'</button>')+
    panel('직원 관리 <span class="so-count-bubble">'+people.filter(person=>person.role!=='driver').length+'</span>',personRows(false)+'<div class="so-people-foot">'+button('직원 권한 보기','staff-preview','','quiet small')+'</div>',button(icon('user-plus')+'직원 추가','person-add','staff','soft small'))+
    panel('기사님·차량 <span class="so-count-bubble">'+people.filter(person=>person.role==='driver').length+'</span>',personRows(true),button(icon('plus')+'기사님 추가','person-add','driver','soft small'))+'</div>';}
  S.action('shop-edit',()=>S.modal('매장 정보 수정','<div class="so-operation-form so-stack">'+field('상호',shop.name,'text','data-shop-field="name" maxlength="30"')+field('매장 대표 연락처',shop.phone,'tel','data-shop-field="phone" maxlength="24" placeholder="예: 063-000-0000"')+select('기본 수거 장소',places,shop.place,'data-shop-field="place"')+'<p class="so-muted">매장 대표번호는 고객 안내와 매장·기사님 연락처에 표시합니다. 기사님 번호는 별도로 등록합니다.</p><p class="so-muted">기본 수거 장소는 장소를 직접 고르지 않은 작성 중 접수에 적용됩니다. 저장한 접수는 유지합니다.</p>'+errorBox+'</div><div class="so-dialog-actions">'+button('취소','close')+button('매장 정보 저장','shop-save','','primary')+'</div>'));
  S.action('shop-save',()=>{
    try{
      const read=key=>S.$('[data-shop-field="'+key+'"]').value;
      const next={name:name(read('name'),'상호'),phone:phone(read('phone')),place:read('place')};
      if(!places.includes(next.place))throw new Error('기본 수거 장소를 선택해 주세요.');
      window.SkiIntake.setDefaultPlace(shop.place,next.place);
      shop=next;S.close();S.render();S.toast('매장 정보와 대표 연락처를 반영했습니다.');
    }catch(reason){error(reason.message);}
  });
  function editPerson(person){
    personDraft={...person};const driver=person.role==='driver';
    S.modal(driver?(person.id?'기사님 정보 수정':'기사님 추가'):(person.id?'직원 정보 수정':'직원 추가'),'<div class="so-operation-form so-stack"><div class="so-form-grid">'+field(driver?'기사님 이름':'직원 이름',person.name,'text','data-person-field="name" maxlength="30"')+field(driver?'기사님 연락처':'직원 연락처 (선택)',person.phone,'tel','data-person-field="phone" maxlength="24" placeholder="예: 010-0000-0000"')+(driver?select('담당 차량',[['','미지정'],...vehicles],person.vehicleId,'data-person-field="vehicleId"'):select('담당 역할',[['counter','카운터'],['manager','관리자']],person.role,'data-person-field="role"'))+'</div><p class="so-muted">'+(driver?'기사님 연락처는 매장 대표번호와 별도로 관리하며 배달·수거 화면에서 확인할 수 있습니다.':'직원 목록과 역할을 관리합니다. 실제 로그인 계정이나 접근 권한은 생성하지 않습니다.')+'</p>'+errorBox+'</div><div class="so-dialog-actions">'+(person.id?button(driver?'기사님 삭제':'직원 삭제','person-delete',person.id,'quiet'):'')+button('취소','close')+button(driver?'기사님 저장':'직원 저장','person-save','','primary')+'</div>');
  }
  S.action('person-add',kind=>editPerson({id:'',name:'',phone:'',role:kind==='driver'?'driver':'counter',vehicleId:''}));
  S.action('person-edit',id=>{const person=people.find(person=>person.id===id);if(person)editPerson(person);});
  S.action('person-save',()=>{
    if(!personDraft)return;
    try{
      const driver=personDraft.role==='driver',read=key=>S.$('[data-person-field="'+key+'"]').value;
      const next={...personDraft,name:name(read('name'),driver?'기사님 이름':'직원 이름'),phone:phone(read('phone')),role:driver?'driver':read('role'),vehicleId:driver?read('vehicleId'):''};
      if(!['manager','counter','driver'].includes(next.role)||(!driver&&next.role==='driver'))throw new Error('담당 역할을 선택해 주세요.');
      if(driver&&!next.phone)throw new Error('기사님 연락처를 입력해 주세요.');
      if(next.vehicleId&&!vehicles.some(vehicle=>vehicle[0]===next.vehicleId))throw new Error('담당 차량을 확인해 주세요.');
      if(people.some(person=>person.id!==next.id&&(person.role==='driver')===driver&&person.name===next.name&&person.phone.replace(/\D/g,'')===next.phone.replace(/\D/g,'')))throw new Error('같은 이름과 연락처가 등록되어 있습니다. 기존 정보를 수정해 주세요.');
      const index=people.findIndex(person=>person.id===next.id);
      if(index<0){next.id='person-'+(++sequence);people.push(next);}else people[index]=next;
      personDraft=null;S.close();S.render();S.toast((driver?'기사님':'직원')+' 정보를 반영했습니다.');
    }catch(reason){error(reason.message);}
  });
  S.action('person-delete',id=>{
    const person=people.find(person=>person.id===id);if(!person)return;
    personDraft=null;
    S.modal('등록 정보 삭제','<p><strong>'+esc(person.name)+'</strong>의 연락처와 등록 정보를 삭제할까요?</p><p class="so-muted">기존 접수와 배달·수거 기록은 유지합니다.</p><div class="so-dialog-actions">'+button('취소','close')+button('등록 정보 삭제','person-delete-confirm',id,'primary')+'</div>');
  });
  S.action('person-delete-confirm',id=>{
    const index=people.findIndex(person=>person.id===id);if(index>=0)people.splice(index,1);
    S.close();S.render();S.toast('등록 정보를 삭제했습니다.');
  });
  function contacts(){
    const drivers=people.filter(person=>person.role==='driver');
    const card=(title,number,detail)=>'<div class="so-contact-card"><span>'+esc(detail)+'</span><strong>'+esc(title)+'</strong><b>'+esc(number||'연락처 미등록')+'</b></div>';
    S.modal('매장·기사님 연락처','<div class="so-contact-directory">'+card(shop.name,shop.phone,'매장 대표번호')+'<h3>기사님 연락처</h3>'+(drivers.length?drivers.map(person=>card(person.name,person.phone,vehicleName(person.vehicleId))).join(''):'<p class="so-muted">등록된 기사님이 없습니다. 매장 설정에서 기사님 연락처를 추가해 주세요.</p>')+'</div><p class="so-muted">번호 확인 화면입니다. 실제 통화는 시작하지 않습니다.</p><div class="so-dialog-actions">'+button('닫기','close','','primary')+'</div>');
  }
  S.action('operations-contacts',contacts);
  S.operations={panels,store:()=>({...shop}),drivers:()=>people.filter(person=>person.role==='driver').map(person=>({...person}))};
})();
