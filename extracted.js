
function getHolidayName(year, month, day) {
    const m = month + 1;
    const fixed = {'1-1':'신정','3-1':'삼일절','5-5':'어린이날','6-6':'현충일','8-15':'광복절','10-3':'개천절','10-9':'한글날','12-25':'크리스마스'};
    const key = m + '-' + day;
    if (fixed[key]) return fixed[key];
    const lunar = {
        2024:{seollal:[2,9,2,10,2,11],chuseok:[9,16,9,17,9,18]},
        2025:{seollal:[1,28,1,29,1,30],chuseok:[10,5,10,6,10,7]},
        2026:{seollal:[2,16,2,17,2,18],chuseok:[9,24,9,25,9,26]},
        2027:{seollal:[2,16,2,17,2,18],chuseok:[10,4,10,5,10,6]},
        2028:{seollal:[1,25,1,26,1,27],chuseok:[10,2,10,3,10,4]},
        2029:{seollal:[2,12,2,13,2,14],chuseok:[9,22,9,23,9,24]},
        2030:{seollal:[2,2,2,3,2,4],chuseok:[9,11,9,12,9,13]}
    };
    const data = lunar[year];
    if (data) {
        const s = data.seollal;
        if (m === s[0] && day >= s[1] && day <= s[1] + 2) { if (day === s[1] + 1) return '설날'; return '설날 연휴'; }
        const c = data.chuseok;
        if (m === c[0] && day >= c[1] && day <= c[1] + 2) { if (day === c[1] + 1) return '추석'; return '추석 연휴'; }
    }
    if (year === 2026) {
        if (m === 3 && day === 2) return '삼일절 대체공휴일';
        if (m === 6 && day === 8) return '현충일 대체공휴일';
        if (m === 8 && day === 17) return '광복절 대체공휴일';
        if (m === 10 && day === 5) return '개천절 대체공휴일';
    }
    return null;
}

let defaultSites = [{"name":"충남 산업단지 플랜트","company":"현대제철","region":"당진","site":"당진","visits":1,"lastVisit":"2026-07-06","contact":"010-4444-5555","address":"충남 당진","start":"2026-01-05","end":"2026-08-05","contractDate":"2025-12-01","amount":95000000,"contactRequest":"2026-07-28","status":"진행중","note":"공정 지연으로 방문 일정 조율 중","lastEdited":"2026-07-19T14:30:00"}];
const MONTHLY_TARGET = 2;
let sites = defaultSites;

const STORE_KEY = 'visitScheduleStore';
const CONTACT_KEY = 'contactScheduleStore';
const CHAT_KEY = 'modificationChatLog';
function loadStore(key){ try{ const raw=JSON.parse(localStorage.getItem(key))||{}; const fixed={}; Object.entries(raw).forEach(([k,v])=>{ if(Array.isArray(v)) fixed[k]=v.filter(Boolean); else if(typeof v==='string'&&v) fixed[k]=[v]; else fixed[k]=[]; }); return fixed; }catch(e){return {};} }
function saveStore(key,data){ localStorage.setItem(key, JSON.stringify(data)); }

let visitStore = loadStore(STORE_KEY);
let contactStore = loadStore(CONTACT_KEY);
sites.forEach(s=>{ if(!(s.name in visitStore)) visitStore[s.name]=s.lastVisit?[s.lastVisit]:[]; if(!(s.name in contactStore)) contactStore[s.name]=s.contactRequest?[s.contactRequest]:[]; });
const validNames = new Set(sites.map(s=>s.name));
Object.keys(visitStore).forEach(k=>{ if(!validNames.has(k)) delete visitStore[k]; });
Object.keys(contactStore).forEach(k=>{ if(!validNames.has(k)) delete contactStore[k]; });
saveStore(STORE_KEY, visitStore); saveStore(CONTACT_KEY, contactStore);

// 날짜 <-> 노션 페이지ID 매핑 (같은 현장이 여러 페이지로 나뉘어 각기 다른 날짜를 가질 때, 어느 페이지의 날짜인지 추적)
const VISIT_PAGEMAP_KEY = 'visitPageMapStore';
const CONTACT_PAGEMAP_KEY = 'contactPageMapStore';
let visitPageMap = loadStore(VISIT_PAGEMAP_KEY);
let contactPageMap = loadStore(CONTACT_PAGEMAP_KEY);
function rebuildPageMapsFromSites(){
  sites.forEach(s=>{
    if(!visitPageMap[s.name]) visitPageMap[s.name] = [];
    if(!contactPageMap[s.name]) contactPageMap[s.name] = [];
    (s.pageDetails||[]).forEach(pd=>{
      if(pd.visitDate && !visitPageMap[s.name].some(e=>e.date===pd.visitDate)) visitPageMap[s.name].push({date:pd.visitDate,pageId:pd.pageId});
      if(pd.contactDate && !contactPageMap[s.name].some(e=>e.date===pd.contactDate)) contactPageMap[s.name].push({date:pd.contactDate,pageId:pd.pageId});
    });
  });
  saveStore(VISIT_PAGEMAP_KEY, visitPageMap);
  saveStore(CONTACT_PAGEMAP_KEY, contactPageMap);
}
function getPageMap(storeType){ return storeType==='visit'?visitPageMap:contactPageMap; }
function getPageMapKey(storeType){ return storeType==='visit'?VISIT_PAGEMAP_KEY:CONTACT_PAGEMAP_KEY; }
function findPageIdForDate(storeType,siteName,date){ const map=getPageMap(storeType); const entry=(map[siteName]||[]).find(e=>e.date===date); return entry?entry.pageId:null; }
function setPageIdForDate(storeType,siteName,date,pageId){ const map=getPageMap(storeType); map[siteName]=map[siteName]||[]; const entry=map[siteName].find(e=>e.date===date); if(entry) entry.pageId=pageId; else map[siteName].push({date,pageId}); saveStore(getPageMapKey(storeType),map); }
function removePageIdForDate(storeType,siteName,date){ const map=getPageMap(storeType); if(map[siteName]){ map[siteName]=map[siteName].filter(e=>e.date!==date); saveStore(getPageMapKey(storeType),map); } }
function anyPageIdForSite(storeType,siteName){ const map=getPageMap(storeType); const arr=map[siteName]||[]; if(arr.length) return arr[0].pageId; const s=sites.find(x=>x.name===siteName); return s?s.notionId:null; }

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.page).classList.add('active');
    if(window.innerWidth<=900) toggleMobileNav(false);
    window.scrollTo({top:0,behavior:'smooth'});
  });
});

const now = new Date();
now.setHours(0,0,0,0);
const curMonth = now.getMonth();
const curYear = now.getFullYear();

function countThisMonth(dates){ return (dates||[]).filter(d=>{ const dt=new Date(d); return dt.getFullYear()===curYear && dt.getMonth()===curMonth; }).length; }
function getUnvisitedThisMonth(){ return sites.filter(s=> countThisMonth(visitStore[s.name]) < MONTHLY_TARGET ); }
function getNeverVisited(){ return sites.filter(s=> s.visits===0 && (visitStore[s.name]||[]).length===0 ); }
function refreshKPIs(){ document.getElementById('kpi-total').textContent=sites.length; document.getElementById('kpi-unvisited').textContent=getUnvisitedThisMonth().length; document.getElementById('kpi-never').textContent=getNeverVisited().length; const totalMonthlyVisits=sites.reduce((sum,s)=>sum+countThisMonth(visitStore[s.name]),0); document.getElementById('kpi-monthly-visits').textContent=totalMonthlyVisits; }

const SITE_COLOR_PALETTE = ['#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2','#db2777','#65a30d','#7c3aed','#0d9488','#c026d3','#4b5563'];
const siteColorMap = {};
sites.forEach((s,i)=>{ siteColorMap[s.name] = SITE_COLOR_PALETTE[i % SITE_COLOR_PALETTE.length]; });
function siteColor(name){ return siteColorMap[name] || '#2563eb'; }
function noteFlag(s){ return s.note ? '<span class="note-flag" title="'+s.note+'">!</span>' : ''; }
let sortMode = 'lastEdited';
function applySortMode(list){ const arr=[...list]; if(sortMode==='lastEdited') return arr.sort((a,b)=>new Date(b.lastEdited)-new Date(a.lastEdited)); if(sortMode==='note') return arr.sort((a,b)=>{ const nA=a.note?0:1,nB=b.note?0:1; if(nA!==nB) return nA-nB; const dA=a.end?daysUntil(a.end):999999,dB=b.end?daysUntil(b.end):999999; return dA-dB; }); if(sortMode==='completion') return arr.sort((a,b)=>(a.end?daysUntil(a.end):999999)-(b.end?daysUntil(b.end):999999)); if(sortMode==='never') return arr.sort((a,b)=>{ const nA=neverVisitedFlag(a)?0:1,nB=neverVisitedFlag(b)?0:1; if(nA!==nB) return nA-nB; const dA=a.end?daysUntil(a.end):999999,dB=b.end?daysUntil(b.end):999999; return dA-dB; }); if(sortMode==='priority') return prioritySort(arr); if(sortMode==='name') return arr.sort((a,b)=>a.name.localeCompare(b.name)); return arr; }
function hexToRgba(hex,a){ const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return 'rgba('+r+','+g+','+b+','+a+')'; }
function siteTag(s){ const col=siteColor(s.name); return '<span class="site-tag" style="background:'+hexToRgba(col,0.15)+';color:'+col+';" onclick="openDetailByName(\''+s.name+'\')">'+s.name+'</span>'; }
function neverVisitedFlag(s){ return s.visits===0 && (visitStore[s.name]||[]).length===0; }
function prioritySort(list){ return [...list].sort((a,b)=>{ const noteA=a.note?0:1,noteB=b.note?0:1; if(noteA!==noteB) return noteA-noteB; const dA=a.end?daysUntil(a.end):999999,dB=b.end?daysUntil(b.end):999999; if(dA!==dB) return dA-dB; const nA=neverVisitedFlag(a)?0:1,nB=neverVisitedFlag(b)?0:1; return nA-nB; }); }
function daysUntil(dateStr){ const d=new Date(dateStr); return Math.ceil((d-now)/(1000*60*60*24)); }
function getCompletionSoon(){ return sites.filter(s=> s.end && daysUntil(s.end)>=0 && daysUntil(s.end)<=30 ).sort((a,b)=>daysUntil(a.end)-daysUntil(b.end)); }
function renderCompletionList(){ const completionSoon=getCompletionSoon(); document.getElementById('kpi-completion').textContent=completionSoon.length; const compList=document.getElementById('completion-list'); compList.innerHTML=''; completionSoon.forEach(s=>{ const div=document.createElement('div'); div.className='completion-card'; div.style.cursor='pointer'; div.onclick=()=>openDetailByName(s.name); div.innerHTML='<div><strong>'+s.name+'</strong>'+noteFlag(s)+'</div><div>'+s.company+'</div><div class="d">D-'+daysUntil(s.end)+' (준공: '+s.end+')</div>'; compList.appendChild(div); }); if(completionSoon.length===0) compList.innerHTML='<div style="color:#94a3b8;font-size:13px;">30일 이내 준공 임박 현장 없음</div>'; }
function renderRegion(){ const regionMap={}; sites.forEach(s=>{ let region=s.site; if(!region&&s.region) region=s.region; if(!region) region=(s.address||'').split(' ')[0]||'기타'; if(!regionMap[region]) regionMap[region]=[]; regionMap[region].push(s); }); const regionList=document.getElementById('region-list'); regionList.innerHTML=''; Object.entries(regionMap).sort((a,b)=>b[1].length-a[1].length).forEach(([r,list])=>{ const div=document.createElement('div'); div.className='region-item'; div.style.cursor='pointer'; div.onclick=()=>openRegionList(r,list); div.innerHTML='<span>'+r+'</span><strong>'+list.length+'건</strong>'; regionList.appendChild(div); }); }
function openRegionList(regionName,list){ kpiListData=list.map(s=>({name:s.name,sub:s.company})); document.getElementById('kpi-list-title').textContent=regionName+' 현장 ('+list.length+')'; document.getElementById('kpi-list-search').value=''; const box=document.getElementById('kpi-list-box'); box.classList.remove('kpi-box-red','kpi-box-gray'); renderKpiListBody(kpiListData); document.getElementById('kpi-list-modal').classList.add('active'); }
function renderActivity(){ const activityList=document.getElementById('activity-list'); activityList.innerHTML=''; const sorted=[...sites].filter(s=>s.lastEdited).sort((a,b)=>new Date(b.lastEdited)-new Date(a.lastEdited)); sorted.forEach(s=>{ const div=document.createElement('div'); div.className='activity-item'; div.style.cursor='pointer'; div.onclick=()=>openDetailByName(s.name); const editedStr=s.lastEdited.slice(0,16).replace('T',' '); div.innerHTML='<span><span class="dot" style="background:'+siteColor(s.name)+'"></span>'+s.name+noteFlag(s)+' · '+s.company+'</span><span>'+editedStr+'</span>'; activityList.appendChild(div); }); if(sorted.length===0) activityList.innerHTML='<div style="color:#94a3b8;font-size:13px;">최근 활동 없음</div>'; }
function generateWeekSchedule(){ const weekDays=['일','월','화','수','목','금','토']; const targets=[]; sites.forEach(s=>{ const c=countThisMonth(visitStore[s.name]); const remaining=Math.max(0,MONTHLY_TARGET-c); for(let i=0;i<remaining;i++) targets.push({name:s.name,company:s.company,isHyundai:s.company==='현대제철',never:s.visits===0,note:s.note}); }); targets.sort((a,b)=>(b.never-a.never)||(a.isHyundai-b.isHyundai)); const plan={1:[],2:[],3:[],4:[],5:[]}; const dayHyundaiCount={1:0,2:0,3:0,4:0,5:0}; let dayPointer=1; targets.forEach(t=>{ let placed=false; for(let attempt=0;attempt<5&&!placed;attempt++){ const day=dayPointer; const cur=plan[day]; const hCount=dayHyundaiCount[day]; const canAddHyundai=t.isHyundai&&hCount<3&&cur.length<4; const canAddNormal=!t.isHyundai&&cur.length<4; if(canAddHyundai||canAddNormal){ cur.push(t); if(t.isHyundai) dayHyundaiCount[day]++; placed=true; } dayPointer=dayPointer>=5?1:dayPointer+1; } }); return {weekDays,plan}; }
function renderAIWeek(){ const {weekDays,plan}=generateWeekSchedule(); const grid=document.getElementById('ai-week-grid'); grid.innerHTML=''; [1,2,3,4,5].forEach(idx=>{ const label=weekDays[idx]; const cell=document.createElement('div'); cell.className='ai-day'; let inner='<div class="d-label">'+label+'</div>'; (plan[idx]||[]).forEach(t=>{ const cls=t.never?'ai-visit-chip chip-never':(t.isHyundai?'ai-visit-chip chip-hyundai':'ai-visit-chip chip-normal'); inner+='<div class="'+cls+'" style="cursor:pointer;" onclick="openDetailByName(\''+t.name+'\')">'+t.name+(t.note?'<span class="note-flag" style="width:14px;height:14px;font-size:10px;">!</span>':'')+'</div>'; }); cell.innerHTML=inner; grid.appendChild(cell); }); }
function renderDashboard(){ refreshKPIs(); renderCompletionList(); renderRegion(); renderActivity(); renderAIWeek(); }

function escapeHtml(value){ return String(value??'').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function isMobileView(){ return window.innerWidth<=900; }
function toggleMobileNav(forceOpen){
  const sidebar=document.getElementById('sidebar');
  const backdrop=document.querySelector('.mobile-nav-backdrop');
  if(!sidebar || !backdrop) return;
  const shouldOpen = typeof forceOpen==='boolean' ? forceOpen : !sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', shouldOpen);
  backdrop.classList.toggle('open', shouldOpen);
  document.body.classList.toggle('nav-open', shouldOpen);
}
function handleMobileResize(){ if(!isMobileView()) toggleMobileNav(false); }
function renderStatsMobileCards(list){
  const wrap=document.getElementById('stats-mobile-list');
  if(!wrap) return;
  wrap.innerHTML='';
  if(!list.length){ wrap.innerHTML='<div class="mobile-empty">검색 결과가 없습니다.</div>'; return; }
  list.forEach(s=>{
    const noteHtml=s.note?'<span class="note-flag" title="'+escapeHtml(s.note)+'">!</span>':'';
    let months='';
    for(let m=1;m<=12;m++){
      const cnt=(visitStore[s.name]||[]).filter(d=>new Date(d).getMonth()+1===m).length;
      months += '<div class="mobile-month-chip"><span class="m">'+m+'월</span><span class="v">'+(cnt||0)+'</span></div>';
    }
    const card=document.createElement('button');
    card.type='button';
    card.className='mobile-data-card';
    card.onclick=()=>openDetailByName(s.name);
    card.innerHTML=`
      <div class="mobile-card-title">
        <div>
          <strong>${escapeHtml(s.name)}</strong>${noteHtml}
          <div class="mobile-card-company">${escapeHtml(s.company||'-')}</div>
        </div>
        <span class="progress-badge ${countThisMonth(visitStore[s.name])>=MONTHLY_TARGET?'full':''}">${countThisMonth(visitStore[s.name])}/${MONTHLY_TARGET} 방문</span>
      </div>
      <div class="mobile-month-grid">${months}</div>`;
    wrap.appendChild(card);
  });
}
function renderContractsMobileCards(sorted){
  const wrap=document.getElementById('contracts-mobile-list');
  if(!wrap) return;
  wrap.innerHTML='';
  if(!sorted.length){ wrap.innerHTML='<div class="mobile-empty">검색 결과가 없습니다.</div>'; return; }
  const total=sorted.length;
  sorted.forEach((s,i)=>{
    const noteHtml=s.note?'<span class="note-flag" title="'+escapeHtml(s.note)+'">!</span>':'';
    const card=document.createElement('button');
    card.type='button';
    card.className='mobile-data-card';
    card.onclick=()=>openDetailByName(s.name);
    card.innerHTML=`
      <div class="mobile-card-title">
        <div>
          <strong>#${total-i} · ${escapeHtml(s.name)}</strong>${noteHtml}
          <div class="mobile-card-company">${escapeHtml(s.company||'-')}</div>
        </div>
        <span class="site-tag" style="background:${hexToRgba(siteColor(s.name),0.12)};color:${siteColor(s.name)};">${escapeHtml(s.status||'상태없음')}</span>
      </div>
      <div class="mobile-meta-grid">
        <div class="mobile-meta-item"><span class="lbl">계약일</span><span class="val">${escapeHtml(fmtDateDot(s.contractDate))}</span></div>
        <div class="mobile-meta-item"><span class="lbl">착공일</span><span class="val">${escapeHtml(fmtDateDot(s.start))}</span></div>
        <div class="mobile-meta-item"><span class="lbl">준공일</span><span class="val">${escapeHtml(fmtDateDot(s.end))}</span></div>
        <div class="mobile-meta-item"><span class="lbl">계약금액</span><span class="val">${escapeHtml((s.amount||0).toLocaleString()+'원')}</span></div>
        <div class="mobile-meta-item"><span class="lbl">최근 수정일</span><span class="val">${escapeHtml((s.lastEdited||'-').slice(0,16).replace('T',' '))}</span></div>
        <div class="mobile-meta-item"><span class="lbl">이번달 방문</span><span class="val">${countThisMonth(visitStore[s.name])}회</span></div>
      </div>`;
    wrap.appendChild(card);
  });
}
function renderMobileAgenda(containerId,state,store,eventClass,label){
  const wrap=document.getElementById(containerId);
  if(!wrap) return;
  wrap.innerHTML='';
  const entries=[];
  sites.forEach(s=>{
    (store[s.name]||[]).forEach(date=>{
      const dt=new Date(date);
      if(dt.getFullYear()===state.year && dt.getMonth()===state.month){
        entries.push({date, site:s});
      }
    });
  });
  entries.sort((a,b)=> new Date(a.date)-new Date(b.date) || a.site.name.localeCompare(b.site.name));
  if(!entries.length){
    wrap.innerHTML='<div class="mobile-empty">이 달에 등록된 '+label+' 일정이 없습니다.</div>';
    return;
  }
  const grouped=new Map();
  entries.forEach(item=>{
    if(!grouped.has(item.date)) grouped.set(item.date, []);
    grouped.get(item.date).push(item.site);
  });
  grouped.forEach((daySites,date)=>{
    const dayWrap=document.createElement('div');
    dayWrap.className='mobile-agenda-day';
    const dt=new Date(date);
    const weekday=['일','월','화','수','목','금','토'][dt.getDay()];
    const countText=daySites.length+'건';
    let inner='<div class="mobile-agenda-date"><span>'+escapeHtml(fmtDateDot(date))+' ('+weekday+')</span><span>'+countText+'</span></div>';
    daySites.forEach(s=>{
      inner += `<div class="mobile-agenda-card ${eventClass}" data-site-name="${escapeHtml(s.name)}">`
        + `<div class="title">${escapeHtml(s.name)}</div>`
        + `<div class="sub">${escapeHtml(s.company||'-')} · ${escapeHtml(s.site||s.region||'-')}</div>`
        + `<div class="tag">${label}</div>`
        + `</div>`;
    });
    dayWrap.innerHTML=inner;
    dayWrap.querySelectorAll('.mobile-agenda-card').forEach(card=>{
      card.addEventListener('click',()=>openDetailByName(card.dataset.siteName));
    });
    wrap.appendChild(dayWrap);
  });
}
function renderStatsTable(){
  const q=(document.getElementById('stats-search').value||'').toLowerCase();
  const filtered=applySortMode(sites.filter(s=>s.name.toLowerCase().includes(q)||s.company.toLowerCase().includes(q)));
  const tbody=document.getElementById('stat-tbody');
  tbody.innerHTML='';
  filtered.forEach(s=>{
    const tr=document.createElement('tr');
    const nFlag=s.note?'<span class="note-flag" title="'+escapeHtml(s.note)+'">!</span>':'';
    let cells='<td class="sticky-col" style="background:#fff;position:sticky;left:0;">'+siteTag(s)+nFlag+'</td><td class="sticky-col" style="background:#fff;position:sticky;left:140px;">'+escapeHtml(s.company)+'</td>';
    for(let m=1;m<=12;m++){ const cnt=(visitStore[s.name]||[]).filter(d=>new Date(d).getMonth()+1===m).length; cells+='<td>'+(cnt>0?('✔×'+cnt):'')+'</td>'; }
    tr.innerHTML=cells;
    tbody.appendChild(tr);
  });
  renderStatsMobileCards(filtered);
}
function renderContractsTable(){
  const q=(document.getElementById('contracts-search').value||'').toLowerCase();
  const sorted=applySortMode([...sites].filter(s=>s.name.toLowerCase().includes(q)||s.company.toLowerCase().includes(q)));
  const tbody=document.getElementById('contract-tbody');
  tbody.innerHTML='';
  const total=sorted.length;
  sorted.forEach((s,i)=>{
    const tr=document.createElement('tr');
    const nFlag=s.note?'<span class="note-flag" title="'+escapeHtml(s.note)+'">!</span>':'';
    tr.innerHTML='<td>'+(total-i)+'</td><td>'+siteTag(s)+nFlag+'</td><td>'+escapeHtml(s.company)+'</td><td>'+escapeHtml(s.contractDate)+'</td><td>'+escapeHtml(s.start)+'</td><td>'+escapeHtml(s.end)+'</td><td>'+escapeHtml((s.amount||0).toLocaleString()+'원')+'</td><td>'+escapeHtml((s.lastEdited||'-').slice(0,16).replace('T',' '))+'</td><td>'+escapeHtml(s.status||'')+'</td>';
    tbody.appendChild(tr);
  });
  renderContractsMobileCards(sorted);
}

let calState = {year:curYear, month:curMonth};
let calStateContact = {year:curYear, month:curMonth};
let selectedEvents = [];
let clipboardEvents = [];
let lastFocusedCellDate = null;
let lastFocusedGridId = null;
function eventKey(store,site,date){ return store+'|'+site+'|'+date; }

function renderSideCards(containerIdUnvisited, containerIdNever, storeType){
  const cUn=document.getElementById(containerIdUnvisited); const cNev=document.getElementById(containerIdNever);
  cUn.innerHTML=''; cNev.innerHTML='';
  getUnvisitedThisMonth().forEach(s=>{ const el=document.createElement('div'); el.className='drag-card'; el.draggable=true; el.style.borderLeft='4px solid '+siteColor(s.name); el.dataset.siteName=s.name; el.title=s.name+' · '+s.company; el.innerHTML='<span class="drag-card-text">'+s.name+' · '+s.company+'</span>'+noteFlag(s); el.addEventListener('dragstart',e=>{ e.dataTransfer.setData('text/plain',JSON.stringify({mode:'new',site:s.name,store:storeType})); }); el.addEventListener('dblclick',()=>openDetailByName(s.name)); el.addEventListener('contextmenu',e=>showContextMenu(e,s.name,storeType,'')); cUn.appendChild(el); });
  getNeverVisited().forEach(s=>{ const el=document.createElement('div'); el.className='drag-card never'; el.draggable=true; el.style.borderLeft='4px solid '+siteColor(s.name); el.dataset.siteName=s.name; el.title=s.name+' · '+s.company; el.innerHTML='<span class="drag-card-text">'+s.name+' · '+s.company+'</span>'+noteFlag(s); el.addEventListener('dragstart',e=>{ e.dataTransfer.setData('text/plain',JSON.stringify({mode:'new',site:s.name,store:storeType})); }); el.addEventListener('dblclick',()=>openDetailByName(s.name)); el.addEventListener('contextmenu',e=>showContextMenu(e,s.name,storeType,'')); cNev.appendChild(el); });
}

function showContextMenu(e,siteName,storeType,dateStr){
  e.preventDefault();
  const menu=document.createElement('div');
  menu.style.cssText='position:absolute;left:'+e.pageX+'px;top:'+e.pageY+'px;background:white;border:1px solid #ccc;border-radius:6px;padding:8px 0;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:1000;min-width:140px;';
  menu.innerHTML='<div style="padding:8px 16px;cursor:pointer;color:#ef4444;" onmouseover="this.style.background=\'#fee2e2\'" onmouseout="this.style.background=\'white\'" onclick="deleteCalendarEvent(\''+siteName+'\',\''+storeType+'\',\''+(dateStr||'')+'\')">🗑 삭제 (노션 반영)</div>';
  document.body.appendChild(menu);
  const closeMenu=()=>menu.remove();
  document.addEventListener('click',closeMenu,{once:true});
}

// 삭제: 로컬 store에서 제거 + 노션에도 반영(남은 마지막 날짜 또는 null)
async function deleteCalendarEvent(siteName,storeType,dateStr){
  const store=storeType==='visit'?visitStore:contactStore;
  const datesToDelete = dateStr ? [dateStr] : (store[siteName]||[]).slice();
  if(store[siteName]){
    if(dateStr){ const idx=store[siteName].indexOf(dateStr); if(idx>-1) store[siteName].splice(idx,1); }
    else { delete store[siteName]; }
    if(store[siteName]&&store[siteName].length===0) delete store[siteName];
  }
  saveStore(storeType==='visit'?STORE_KEY:CONTACT_KEY,store);
  clearSelection();
  refreshCalendars(); renderDashboard(); renderStatsTable(); renderContractsTable();

  // 각 날짜가 매핑된 실제 노션 페이지를 찾아 그 페이지의 날짜만 비움 (방문일자 방식과 동일)
  for(const d of datesToDelete){ await syncDeleteDate(storeType,siteName,d); }
}

function clearSelection(){ selectedEvents=[]; document.querySelectorAll('.cal-event.selected').forEach(el=>el.classList.remove('selected')); }

function renderCalendarGrid(gridId,labelId,state,store,eventClass,storeKeyName){
  const grid=document.getElementById(gridId); const label=document.getElementById(labelId);
  grid.innerHTML=''; label.textContent=state.year+'년 '+(state.month+1)+'월';
  const firstDay=new Date(state.year,state.month,1).getDay();
  const daysInMonth=new Date(state.year,state.month+1,0).getDate();
  const weekNames=['일','월','화','수','목','금','토'];
  weekNames.forEach((w,wi)=>{ const h=document.createElement('div'); h.style.fontWeight='700'; h.style.fontSize='15px'; h.style.textAlign='center'; h.style.color=wi===0?'#ef4444':(wi===6?'#2563eb':'#64748b'); h.style.padding='4px 0'; h.textContent=w; grid.appendChild(h); });
  for(let i=0;i<firstDay;i++) grid.appendChild(document.createElement('div'));

  const todayStr=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  for(let d=1; d<=daysInMonth; d++){
    const cell=document.createElement('div'); cell.className='cal-cell';
    const dateStr=state.year+'-'+String(state.month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    cell.dataset.date=dateStr;
    const dow=new Date(state.year,state.month,d).getDay();
    const holidayName=getHolidayName(state.year,state.month,d);
    if(holidayName) cell.classList.add('cal-holiday');
    if(dateStr===todayStr) cell.classList.add('cal-today');
    if(lastFocusedGridId===gridId && lastFocusedCellDate===dateStr) cell.classList.add('cal-focused');
    const dateColor=holidayName?'#dc2626':(dow===0?'#ef4444':(dow===6?'#2563eb':'#334155'));
    let dateHTML='<div class="date-num" style="color:'+dateColor+';">'+d+(dateStr===todayStr?' <span class="today-badge">오늘</span>':'')+'</div>';
    if(holidayName) dateHTML+='<div class="holiday-badge">🎉 '+holidayName+'</div>';
    cell.innerHTML=dateHTML;

    Object.entries(store).filter(([siteName])=>sites.some(s=>s.name===siteName)).forEach(([siteName,dateArr])=>{
      (dateArr||[]).forEach(dstr=>{
        if(dstr===dateStr){
          const ev=document.createElement('div');
          ev.className='cal-event '+(eventClass||'');
          ev.style.background=siteColor(siteName);
          ev.textContent=siteName; ev.title=siteName; ev.draggable=true;
          const key=eventKey(storeKeyName,siteName,dateStr);
          if(selectedEvents.some(se=>se.key===key)) ev.classList.add('selected');
          ev.addEventListener('click',e=>{
            e.stopPropagation();
            if(e.ctrlKey||e.metaKey){ const idx=selectedEvents.findIndex(se=>se.key===key); if(idx>=0){ selectedEvents.splice(idx,1); ev.classList.remove('selected'); } else { selectedEvents.push({key,store:storeKeyName,site:siteName,date:dateStr}); ev.classList.add('selected'); } }
            else { clearSelection(); selectedEvents.push({key,store:storeKeyName,site:siteName,date:dateStr}); ev.classList.add('selected'); }
          });
          ev.addEventListener('dblclick',e=>{ e.stopPropagation(); openDetailByName(siteName); });
          ev.addEventListener('contextmenu',e=>showContextMenu(e,siteName,storeKeyName,dateStr));
          ev.addEventListener('dragstart',e=>{
            e.stopPropagation();
            const isCopy=e.ctrlKey||e.metaKey;
            const key2=eventKey(storeKeyName,siteName,dateStr);
            let payloadEvents=selectedEvents.some(se=>se.key===key2)?selectedEvents.slice():[{key:key2,store:storeKeyName,site:siteName,date:dateStr}];
            e.dataTransfer.setData('text/plain',JSON.stringify({mode:isCopy?'copy':'move',events:payloadEvents}));
          });
          cell.appendChild(ev);
        }
      });
    });

    // 클릭 시 해당 셀을 "포커스"로 지정 (Ctrl+V 붙여넣기 타겟)
    cell.addEventListener('click',(e)=>{
      if(e.target===cell || e.target.classList.contains('date-num')){
        clearSelection();
      }
      lastFocusedCellDate=dateStr;
      lastFocusedGridId=gridId;
      refreshCalendars();
    });
    cell.addEventListener('dragover',e=>{ e.preventDefault(); cell.classList.add('drag-over'); });
    cell.addEventListener('dragleave',()=>cell.classList.remove('drag-over'));
    cell.addEventListener('drop',e=>{
      e.preventDefault(); cell.classList.remove('drag-over');
      const data=JSON.parse(e.dataTransfer.getData('text/plain'));
      const syncTasks=[];
      if(data.mode==='new'){
        const st=data.store==='visit'?visitStore:contactStore;
        st[data.site]=st[data.site]||[]; if(!st[data.site].includes(dateStr)) st[data.site].push(dateStr);
        saveStore(data.store==='visit'?STORE_KEY:CONTACT_KEY,st);
        syncTasks.push(()=>syncAddDate(data.store,data.site,dateStr));
      } else {
        data.events.forEach(ev=>{
          const st=ev.store==='visit'?visitStore:contactStore;
          if(data.mode==='move'){
            const arr=st[ev.site]||[]; const idx=arr.indexOf(ev.date); if(idx>=0) arr.splice(idx,1); if(!arr.includes(dateStr)) arr.push(dateStr); st[ev.site]=arr;
            syncTasks.push(()=>syncMoveDate(ev.store,ev.site,ev.date,dateStr));
          } else {
            st[ev.site]=st[ev.site]||[]; if(!st[ev.site].includes(dateStr)) st[ev.site].push(dateStr);
            syncTasks.push(()=>syncAddDate(ev.store,ev.site,dateStr));
          }
          saveStore(ev.store==='visit'?STORE_KEY:CONTACT_KEY,ev.store==='visit'?visitStore:contactStore);
        });
        clearSelection();
      }
      refreshCalendars(); renderDashboard(); renderStatsTable(); renderContractsTable();
      syncTasks.forEach(task=>task());
    });
    grid.appendChild(cell);
  }
}

// ----- Ctrl+C / Ctrl+V / Ctrl+드래그 복사 (전부 노션 동기화 포함) -----
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { clearSelection(); refreshCalendars(); return; }

  const isMeta = e.ctrlKey || e.metaKey;

  // Ctrl+C: 선택된 이벤트를 클립보드에 복사
  if (isMeta && (e.key === 'c' || e.key === 'C')) {
    if (selectedEvents.length > 0) {
      clipboardEvents = JSON.parse(JSON.stringify(selectedEvents));
      showSyncBanner('📋 '+clipboardEvents.length+'건 복사됨 (붙여넣을 날짜 클릭 후 Ctrl+V)', '#2563eb');
    }
  }

  // Ctrl+V: 마지막으로 클릭한(포커스된) 날짜 셀에 붙여넣기
  if (isMeta && (e.key === 'v' || e.key === 'V')) {
    if (clipboardEvents.length > 0 && lastFocusedCellDate) {
      const targetDate = lastFocusedCellDate;
      const syncTasks = [];
      clipboardEvents.forEach(ev => {
        const st = ev.store === 'visit' ? visitStore : contactStore;
        st[ev.site] = st[ev.site] || [];
        if (!st[ev.site].includes(targetDate)) st[ev.site].push(targetDate);
        syncTasks.push(() => syncAddDate(ev.store, ev.site, targetDate));
      });
      saveStore(STORE_KEY, visitStore);
      saveStore(CONTACT_KEY, contactStore);
      clearSelection();
      refreshCalendars(); renderDashboard(); renderStatsTable(); renderContractsTable();
      syncTasks.forEach(task => task());
      showSyncBanner('✅ '+targetDate+' 에 붙여넣기 완료 (노션 반영 중)', '#16a34a');
    } else if (clipboardEvents.length > 0) {
      showSyncBanner('⚠ 먼저 붙여넣을 날짜 셀을 클릭하세요', '#f59e0b');
    }
  }
});

document.addEventListener('click',e=>{ if(!e.target.closest('.cal-event')&&!e.target.closest('.cal-cell')){ clearSelection(); refreshCalendars(); } });

// ----- 노션 동기화 (이동/복사/붙여넣기 시 항상 호출) -----
// ===== 방문일자/연락요청 일자 공통 노션 동기화 로직 (페이지 복제 방식) =====
// 원리: 노션의 날짜 속성은 페이지당 1개만 저장 가능하므로, 날짜를 추가할 때마다
// 해당 현장의 페이지를 복제하여 새 페이지에 새 날짜만 기록한다. 방문일자/연락요청 모두 동일한 방식으로 동작.
function getPropertyName(storeType){ return storeType==='visit' ? '방문일자' : '연락요청 일자'; }

// pageMap(로컬 캐시)이 유실/오래된 경우를 대비해, 서버에서 받은 pageDetails(실제 노션 데이터)에서
// 해당 날짜를 가진 페이지를 직접 찾아낸다. 대표 페이지로 잘못 대체되는 것을 방지하는 안전장치.
function findPageIdFromServerDetails(site,storeType,date){
  if(!site || !site.pageDetails) return null;
  const key = storeType==='visit' ? 'visitDate' : 'contactDate';
  const found = site.pageDetails.find(pd => pd[key] === date);
  return found ? found.pageId : null;
}

async function syncAddDate(storeType,siteName,date){
  const site=sites.find(s=>s.name===siteName);
  if(!site){ console.warn('현장 정보 없음:',siteName); return; }
  const propertyName=getPropertyName(storeType);
  const map=getPageMap(storeType);
  const hasAnyMapped=(map[siteName]||[]).length>0;

  showSyncBanner('노션 저장 중... '+siteName);
  try{
    if(!hasAnyMapped && site.notionId){
      // 이 현장에 아직 매핑된 페이지가 없으면(첫 날짜) 기존 대표 페이지에 바로 기록
      const res=await fetch(API_BASE+'/api/update-visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:site.notionId,propertyName,date})});
      const data=await res.json();
      if(data.ok){ setPageIdForDate(storeType,siteName,date,site.notionId); showSyncBanner('✅ Notion 저장 완료: '+siteName,'#16a34a'); }
      else { showSyncBanner('⚠ Notion 저장 실패: '+(data.error||''),'#ef4444'); }
    } else {
      // 이미 날짜가 있는 현장이면 페이지를 복제해서 새 날짜를 별도 페이지에 기록 (기존 날짜 보존)
      const sourcePageId = anyPageIdForSite(storeType,siteName);
      const res=await fetch(API_BASE+'/api/duplicate-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourcePageId,propertyName,date})});
      const data=await res.json();
      if(data.ok){ setPageIdForDate(storeType,siteName,date,data.newPageId); showSyncBanner('✅ Notion 페이지 복제 및 저장 완료: '+siteName,'#16a34a'); }
      else { showSyncBanner('⚠ Notion 복제 실패: '+(data.error||''),'#ef4444'); }
    }
  }catch(e){ showSyncBanner('⚠ 서버 연결 실패 (로컬에만 저장됨)','#f59e0b'); }
}

async function syncMoveDate(storeType,siteName,oldDate,newDate){
  const site=sites.find(s=>s.name===siteName);
  const propertyName=getPropertyName(storeType);
  // pageMap(로컬 캐시) -> 서버가 준 실제 pageDetails -> 최후에만 대표 페이지 순으로 탐색
  const pageId = findPageIdForDate(storeType,siteName,oldDate)
    || findPageIdFromServerDetails(site,storeType,oldDate)
    || (site&&site.notionId);
  if(!pageId){ console.warn('이동할 노션 페이지를 찾지 못함:',siteName,oldDate); return; }
  showSyncBanner('노션 날짜 이동 중... '+siteName);
  try{
    const res=await fetch(API_BASE+'/api/update-visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId,propertyName,date:newDate})});
    const data=await res.json();
    if(data.ok){ removePageIdForDate(storeType,siteName,oldDate); setPageIdForDate(storeType,siteName,newDate,pageId); showSyncBanner('✅ Notion 날짜 이동 완료: '+siteName,'#16a34a'); }
    else { showSyncBanner('⚠ Notion 이동 실패: '+(data.error||''),'#ef4444'); }
  }catch(e){ showSyncBanner('⚠ 서버 연결 실패 (로컬에만 반영됨)','#f59e0b'); }
}

async function syncDeleteDate(storeType,siteName,date){
  const site=sites.find(s=>s.name===siteName);
  const propertyName=getPropertyName(storeType);
  const pageId = findPageIdForDate(storeType,siteName,date)
    || findPageIdFromServerDetails(site,storeType,date)
    || (site&&site.notionId);
  if(!pageId){ console.warn('삭제할 노션 페이지를 찾지 못함:',siteName,date); return; }
  showSyncBanner('노션 날짜 삭제 중... '+siteName);
  try{
    const res=await fetch(API_BASE+'/api/update-visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId,propertyName,date:null})});
    const data=await res.json();
    if(data.ok){ removePageIdForDate(storeType,siteName,date); showSyncBanner('✅ Notion 날짜 삭제 완료: '+siteName,'#16a34a'); }
    else { showSyncBanner('⚠ Notion 삭제 실패: '+(data.error||''),'#ef4444'); }
  }catch(e){ showSyncBanner('⚠ 서버 연결 실패 (로컬만 삭제됨)','#f59e0b'); }
}

// 하위호환: 기존 코드에서 syncDateToNotion(site,storeType,date) 형태로 호출하는 곳을 위한 래퍼
// date===null 이면 삭제, 그 외엔 신규 추가로 처리 (이동은 별도 함수 syncMoveDate 사용)
async function syncDateToNotion(siteName,storeType,dateStr){
  if(dateStr===null){ 
    // 삭제할 날짜를 알 수 없는 호출부(사이드바 드롭 등)는 store에서 이미 제거된 상태이므로 스킵 처리하고,
    // 실제 삭제는 각 호출부에서 syncDeleteDate로 직접 호출하도록 이미 교체됨.
    return;
  }
  await syncAddDate(storeType,siteName,dateStr);
}
function showSyncBanner(text,color){ let el=document.getElementById('sync-banner'); if(!el){ el=document.createElement('div'); el.id='sync-banner'; el.style.cssText='position:fixed;top:8px;right:8px;padding:6px 12px;border-radius:6px;font-size:12px;z-index:500;color:white;'; document.body.appendChild(el); } el.style.background=color||'#2563eb'; el.textContent=text; el.style.display='block'; clearTimeout(el._t); el._t=setTimeout(()=>{ el.style.display='none'; },3000); }

function filterCalSiteList(){ const q=(document.getElementById('cal-site-search').value||'').trim().toLowerCase(); document.querySelectorAll('#unvisited-cards .drag-card').forEach(el=>{ const name=(el.dataset.siteName||el.textContent||'').toLowerCase(); el.style.display=name.includes(q)?'':'none'; }); }
function filterCalSiteList2(){ const q=(document.getElementById('cal-site-search-2').value||'').trim().toLowerCase(); document.querySelectorAll('#unvisited-cards-2 .drag-card').forEach(el=>{ const name=(el.dataset.siteName||el.textContent||'').toLowerCase(); el.style.display=name.includes(q)?'':'none'; }); }

function setupSideListDrop(containerId){
  const el=document.getElementById(containerId); if(!el) return;
  el.addEventListener('dragover',e=>{ e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
  el.addEventListener('drop',e=>{
    e.preventDefault(); el.classList.remove('drag-over');
    const data=JSON.parse(e.dataTransfer.getData('text/plain'));
    if(data.mode==='new') return;
    const syncTasks=[];
    (data.events||[]).forEach(ev=>{
      const st=ev.store==='visit'?visitStore:contactStore;
      if(data.mode==='move' && st[ev.site]){
        const idx=st[ev.site].indexOf(ev.date); if(idx>=0) st[ev.site].splice(idx,1);
        syncTasks.push(()=>syncDeleteDate(ev.store, ev.site, ev.date));
      }
    });
    const touched=new Set((data.events||[]).map(ev=>ev.store));
    touched.forEach(store=>saveStore(store==='visit'?STORE_KEY:CONTACT_KEY,store==='visit'?visitStore:contactStore));
    clearSelection(); refreshCalendars(); renderDashboard(); renderStatsTable(); renderContractsTable();
    // 사이드 리스트로 드래그 = 캘린더에서 삭제로 간주, 방문일자와 동일한 방식으로 노션 반영
    syncTasks.forEach(task=>task());
  });
}
['unvisited-cards','never-cards','unvisited-cards-2','never-cards-2'].forEach(setupSideListDrop);

function refreshCalendars(){
  renderCalendarGrid('cal-grid','cal-month-label',calState,visitStore,'','visit');
  renderCalendarGrid('cal-grid-contact','cal-month-label-contact',calStateContact,contactStore,'contact','contact');
  renderSideCards('unvisited-cards','never-cards','visit');
  renderSideCards('unvisited-cards-2','never-cards-2','contact');
  renderMobileAgenda('visit-mobile-agenda', calState, visitStore, '', '방문 일정');
  renderMobileAgenda('contact-mobile-agenda', calStateContact, contactStore, 'contact', '연락 요청');
}
function changeMonth(delta){ calState.month+=delta; if(calState.month<0){calState.month=11; calState.year--;} if(calState.month>11){calState.month=0; calState.year++;} refreshCalendars(); }
function changeMonthContact(delta){ calStateContact.month+=delta; if(calStateContact.month<0){calStateContact.month=11; calStateContact.year--;} if(calStateContact.month>11){calStateContact.month=0; calStateContact.year++;} refreshCalendars(); }

function fmtDateDot(d){ if(!d) return '-'; return String(d).replace(/-/g,'.'); }
function openDetailByName(name){ const s=sites.find(x=>x.name===name); if(!s) return; document.getElementById('detail-title').textContent=s.name; document.getElementById('detail-manager-company').textContent=s.company||'-'; document.getElementById('detail-manager-name').textContent=s.managerName||'-'; document.getElementById('detail-manager-contact').textContent=s.contact||'-'; const vdates=(visitStore[s.name]||[]).slice().sort(); const cdates=(contactStore[s.name]||[]).slice().sort(); document.getElementById('detail-contact-date').textContent=cdates.length?fmtDateDot(cdates[cdates.length-1]):'-'; document.getElementById('detail-visit-date').textContent=vdates.length?fmtDateDot(vdates[vdates.length-1]):'-'; const target=s.targetVisits||2; const done=vdates.length; document.getElementById('detail-progress-text').textContent='('+done+' / '+target+')'; const boxesWrap=document.getElementById('detail-progress-boxes'); boxesWrap.innerHTML=''; const totalBoxes=Math.max(target,done); for(let i=0;i<totalBoxes;i++){ const box=document.createElement('div'); box.className='progress-box'+(i<done?' filled':''); boxesWrap.appendChild(box); } document.getElementById('detail-visit-history-title').textContent='방문이력 (총 '+done+'회)'; const histList=document.getElementById('detail-visit-history-list'); histList.innerHTML=vdates.length?vdates.slice().reverse().map(d=>'<span class="visit-history-chip">'+fmtDateDot(d)+'</span>').join(''):'<span style="color:#94a3b8;font-size:13px;">방문 기록 없음</span>'; document.getElementById('detail-contract-date').textContent=fmtDateDot(s.contractDate)||'-'; document.getElementById('detail-start-date').textContent=fmtDateDot(s.start)||'-'; document.getElementById('detail-company').textContent=s.company||'-'; document.getElementById('detail-end-date').textContent=fmtDateDot(s.end)||'-'; document.getElementById('detail-amount').textContent=(s.amount||0).toLocaleString()+'원'; document.getElementById('detail-biz-open-no').textContent=s.bizOpenNo||'-'; document.getElementById('detail-biz-mgmt-no').textContent=s.bizMgmtNo||'-'; document.getElementById('detail-mgmt-no').textContent=s.mgmtNo||'-'; document.getElementById('detail-site').textContent=s.site||s.region||'-'; const noteWrap=document.getElementById('detail-note-wrap'); noteWrap.innerHTML=s.note?'<div class="detail-note">⚠️ 비고<br><span>'+s.note+'</span></div>':''; document.getElementById('detail-modal').classList.add('active'); attachCopyButtons(); }
function closeDetail(){ document.getElementById('detail-modal').classList.remove('active'); }
function copyToClipboard(text,btn){ navigator.clipboard.writeText(text).then(()=>{ if(btn){ const orig=btn.textContent; btn.textContent='✅'; setTimeout(()=>btn.textContent=orig,1200); } }).catch(()=>{}); }
function attachCopyButtons(){ document.querySelectorAll('#detail-modal .copy-btn').forEach(b=>b.remove()); const targets=['detail-manager-company','detail-manager-name','detail-manager-contact','detail-contact-date','detail-visit-date','detail-contract-date','detail-start-date','detail-end-date','detail-amount','detail-site','detail-mgmt-no','detail-biz-open-no','detail-biz-mgmt-no']; targets.forEach(id=>{ const el=document.getElementById(id); if(!el) return; const btn=document.createElement('span'); btn.className='copy-btn'; btn.textContent='📋'; btn.title='복사'; btn.style.cssText='cursor:pointer;margin-left:8px;font-size:18px;padding:2px 4px;'; btn.onclick=(e)=>{ e.stopPropagation(); copyToClipboard(el.textContent.trim(),btn); }; el.appendChild(btn); }); const titleEl=document.getElementById('detail-title'); if(titleEl){ const btn=document.createElement('span'); btn.className='copy-btn'; btn.textContent='📋'; btn.title='복사'; btn.style.cssText='cursor:pointer;margin-left:10px;font-size:20px;padding:2px 4px;'; btn.onclick=(e)=>{ e.stopPropagation(); copyToClipboard(titleEl.textContent.replace('📋','').trim(),btn); }; titleEl.appendChild(btn); } }
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeDetail(); closeKpiList(); } });
let kpiListData=[];
function openKpiList(kind){ let title='',list=[]; if(kind==='total'){ title='전체 현장 ('+sites.length+')'; list=sites.map(s=>({name:s.name,sub:s.company})); } else if(kind==='unvisited'){ const arr=getUnvisitedThisMonth(); title='이번달 미방문 ('+arr.length+')'; list=arr.map(s=>({name:s.name,sub:s.company+' · '+countThisMonth(visitStore[s.name])+'/'+MONTHLY_TARGET+' 방문'})); } else if(kind==='never'){ const arr=getNeverVisited(); title='1회도 방문없음 ('+arr.length+')'; list=arr.map(s=>({name:s.name,sub:s.company})); } else if(kind==='monthly-visits'){ const arr=sites.filter(s=>countThisMonth(visitStore[s.name])>0); title='이번달 방문 현장 (총 '+arr.reduce((sum,s)=>sum+countThisMonth(visitStore[s.name]),0)+'회)'; list=arr.map(s=>({name:s.name,sub:s.company+' · '+countThisMonth(visitStore[s.name])+'회 방문'})); } else if(kind==='completion'){ const arr=getCompletionSoon(); title='준공 임박 30일 이내 ('+arr.length+')'; list=arr.map(s=>({name:s.name,sub:s.company+' · D-'+daysUntil(s.end)+' (준공: '+s.end+')'})); } kpiListData=list; document.getElementById('kpi-list-title').textContent=title; document.getElementById('kpi-list-search').value=''; const box=document.getElementById('kpi-list-box'); box.classList.remove('kpi-box-red','kpi-box-gray'); if(kind==='completion') box.classList.add('kpi-box-red'); if(kind==='never') box.classList.add('kpi-box-gray'); renderKpiListBody(list); document.getElementById('kpi-list-modal').classList.add('active'); }
function renderKpiListBody(list){ const body=document.getElementById('kpi-list-body'); body.innerHTML=list.length?list.map(item=>'<div class="kpi-list-row" onclick="closeKpiList();openDetailByName(\''+item.name+'\')"><strong>'+item.name+'</strong><span>'+item.sub+'</span></div>').join(''):'<div style="color:#94a3b8;font-size:13px;">검색 결과가 없습니다</div>'; }
function filterKpiList(){ const q=(document.getElementById('kpi-list-search').value||'').toLowerCase(); renderKpiListBody(kpiListData.filter(i=>i.name.toLowerCase().includes(q)||i.sub.toLowerCase().includes(q))); }
function closeKpiList(){ document.getElementById('kpi-list-modal').classList.remove('active'); }

let chatLog=loadStore(CHAT_KEY); if(!Array.isArray(chatLog)) chatLog=[];
function renderChatLog(){ const log=document.getElementById('chat-log'); log.innerHTML=''; chatLog.forEach(m=>{ const div=document.createElement('div'); div.className='chat-msg'; div.innerHTML='<div style="font-size:11px;color:#94a3b8;">'+m.time+'</div><div>'+m.text+'</div>'; log.appendChild(div); }); log.scrollTop=log.scrollHeight; }
function toggleChat(){ document.getElementById('chat-drawer').classList.toggle('open'); renderChatLog(); }
function sendChat(){ const input=document.getElementById('chat-input'); const text=input.value.trim(); if(!text) return; chatLog.push({time:new Date().toLocaleString(),text:'요청: '+text}); chatLog.push({time:new Date().toLocaleString(),text:'접수됨 — 실제 코드 반영은 개발자(대화창)에서 처리 후 파일이 갱신됩니다.'}); localStorage.setItem(CHAT_KEY,JSON.stringify(chatLog)); input.value=''; renderChatLog(); }

const API_BASE="http://localhost:3000";
function normalizeSite(s){ return { name:s.name||"이름없음", company:s.company||"", visits:(s.visitDates&&s.visitDates.length)||s.visits||0, targetVisits:s.targetVisits||s.visits||2, lastVisit:s.lastVisit||null, visitDates:s.visitDates||(s.lastVisit?[s.lastVisit]:[]), contactDates:s.contactDates||(s.contactRequest?[s.contactRequest]:[]), contact:s.contact||"", managerName:s.managerName||s.manager||"", address:s.address||"", start:s.start||null, end:s.end||null, contractDate:s.contractDate||null, amount:s.amount||0, contactRequest:s.contactRequest||null, status:s.status||"", note:s.note||"", bizOpenNo:s.bizOpenNo||"", bizMgmtNo:s.bizMgmtNo||"", mgmtNo:s.mgmtNo||"", site:s.site||s.region||(s.address||'').split(' ')[0]||'기타', lastEdited:s.lastEdited||new Date().toISOString(), notionId:s.id||(s.pageIds&&s.pageIds[0])||null, pageDetails:s.pageDetails||[], pageIds:s.pageIds||(s.id?[s.id]:[]), visitHistoryPageId:s.visitHistoryPageId||s.id||null, contactHistoryPageId:s.contactHistoryPageId||s.id||null }; }
function rebuildStoresFromSites(){ sites.forEach(s=>{ visitStore[s.name]=(s.visitDates&&s.visitDates.length)?s.visitDates.slice():(visitStore[s.name]||[]); contactStore[s.name]=(s.contactDates&&s.contactDates.length)?s.contactDates.slice():(contactStore[s.name]||[]); }); saveStore(STORE_KEY,visitStore); saveStore(CONTACT_KEY,contactStore); }
function initAllViews(){ rebuildStoresFromSites(); rebuildPageMapsFromSites(); refreshCalendars(); renderDashboard(); renderStatsTable(); renderContractsTable(); }
async function loadFromNotion(){ try{ const res=await fetch(API_BASE+"/api/contracts"); const data=await res.json(); if(data.ok&&data.sites&&data.sites.length){ sites=data.sites.map(normalizeSite); initAllViews(); const banner=document.createElement('div'); banner.style.cssText="position:fixed;top:8px;right:8px;background:#16a34a;color:white;padding:6px 12px;border-radius:6px;font-size:12px;z-index:500;"; banner.textContent="Notion 연동됨 · "+sites.length+"건"; document.body.appendChild(banner); setTimeout(()=>banner.remove(),4000); } else { initAllViews(); } }catch(e){ initAllViews(); } }
async function syncFromNotion(){ await loadFromNotion(); }

// ================= AI 음성지시 기능 =================
let pendingVoiceAction = null;
let recognitionInstance = null;

function toggleVoiceAssistant(){
  document.getElementById('voice-modal').classList.add('active');
  document.getElementById('voice-status').textContent = '버튼을 누르고 말씀해주세요.';
  document.getElementById('voice-transcript').textContent = '';
  document.getElementById('voice-confirm-box').style.display = 'none';
  pendingVoiceAction = null;
}
function closeVoiceAssistant(){
  document.getElementById('voice-modal').classList.remove('active');
  if(recognitionInstance){ try{ recognitionInstance.stop(); }catch(e){} }
}

function startVoiceRecognition(){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    document.getElementById('voice-status').textContent = '⚠ 이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.';
    return;
  }
  document.getElementById('voice-confirm-box').style.display = 'none';
  document.getElementById('voice-transcript').textContent = '';
  document.getElementById('voice-status').textContent = '🎤 듣고 있습니다...';
  document.getElementById('voice-mic-btn').style.background = '#dc2626';

  recognitionInstance = new SpeechRecognition();
  recognitionInstance.lang = 'ko-KR';
  recognitionInstance.interimResults = false;
  recognitionInstance.maxAlternatives = 1;

  recognitionInstance.onresult = async (event) => {
    const text = event.results[0][0].transcript;
    document.getElementById('voice-transcript').textContent = '"' + text + '"';
    document.getElementById('voice-status').textContent = '🤖 AI가 분석 중...';
    document.getElementById('voice-mic-btn').style.background = '#16a34a';
    await processVoiceCommand(text);
  };
  recognitionInstance.onerror = (e) => {
    document.getElementById('voice-status').textContent = '⚠ 인식 실패: ' + e.error;
    document.getElementById('voice-mic-btn').style.background = '#16a34a';
  };
  recognitionInstance.onend = () => {
    document.getElementById('voice-mic-btn').style.background = '#16a34a';
  };
  recognitionInstance.start();
}

async function processVoiceCommand(text){
  const siteNames = sites.map(s => s.name);
  try{
    const res = await fetch(API_BASE + '/api/ai-command', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ text, siteNames })
    });
    const data = await res.json();
    if(!data.ok || !data.result || data.result.action === 'unknown'){
      document.getElementById('voice-status').textContent = '⚠ 명령을 이해하지 못했습니다. 다시 말씀해주세요.';
      return;
    }
    const result = data.result;
    const site = sites.find(s => s.name === result.siteName);
    if(!site){
      document.getElementById('voice-status').textContent = '⚠ "' + result.siteName + '" 현장을 찾을 수 없습니다.';
      return;
    }
    pendingVoiceAction = { action: result.action, site, date: result.date };
    document.getElementById('voice-status').textContent = '아래 내용을 확인해주세요.';
    document.getElementById('voice-confirm-text').textContent = result.confirmText || (site.name + ' 현장 ' + result.date + ' 처리하시겠습니까?');
    document.getElementById('voice-confirm-box').style.display = 'block';
  }catch(e){
    document.getElementById('voice-status').textContent = '⚠ 서버 연결 실패';
  }
}

async function confirmVoiceAction(approved){
  document.getElementById('voice-confirm-box').style.display = 'none';
  if(!approved || !pendingVoiceAction){
    document.getElementById('voice-status').textContent = '취소되었습니다.';
    pendingVoiceAction = null;
    return;
  }
  const { action, site, date } = pendingVoiceAction;
  const storeType = (action === 'add_visit' || action === 'delete_visit') ? 'visit' : 'contact';
  const store = storeType === 'visit' ? visitStore : contactStore;

  if(action === 'add_visit' || action === 'add_contact'){
    store[site.name] = store[site.name] || [];
    if(!store[site.name].includes(date)) store[site.name].push(date);
    saveStore(storeType === 'visit' ? STORE_KEY : CONTACT_KEY, store);
    document.getElementById('voice-status').textContent = '✅ 일정이 추가되었습니다.';
    await syncAddDate(storeType, site.name, date);
  } else if(action === 'delete_visit' || action === 'delete_contact'){
    if(store[site.name]){
      const idx = store[site.name].indexOf(date);
      if(idx > -1) store[site.name].splice(idx, 1);
      else store[site.name] = [];
    }
    saveStore(storeType === 'visit' ? STORE_KEY : CONTACT_KEY, store);
    document.getElementById('voice-status').textContent = '✅ 일정이 삭제되었습니다.';
    await syncDeleteDate(storeType, site.name, date);
  }

  refreshCalendars(); renderDashboard(); renderStatsTable(); renderContractsTable();
  pendingVoiceAction = null;
  setTimeout(()=>{ closeVoiceAssistant(); }, 1500);
}

window.addEventListener('resize', handleMobileResize);
handleMobileResize();
loadFromNotion();
