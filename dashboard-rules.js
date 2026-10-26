(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DashboardRules=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const day=v=>{if(!v)return '';const s=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const d=new Date(v);return isNaN(d)?'':new Date(d.getTime()+9*3600000).toISOString().slice(0,10);};
const month=v=>day(v).slice(0,7);
const completed=s=>String(s&&s.status||'').replace(/\s+/g,'')==='공사완료';
const visible=(s,now=new Date())=>!completed(s)||month(s.lastEdited)===month(now);
const currentCompleted=(s,now=new Date())=>completed(s)&&month(s.lastEdited)===month(now);
const uniqueDates=arr=>Array.from(new Set((arr||[]).map(day).filter(Boolean))).sort();
function noteDeferral(note,now=new Date()){
 const text=String(note||'');const current=day(now), y=+current.slice(0,4),m=+current.slice(5,7);
 if(/매주|매일|주\s*1회|매월/.test(text))return '';
 const yearMatches=[...text.matchAll(/(20\d{2}|2\d)년(?:도)?[^\n.]{0,25}(?:공사|작업)[^\n.]{0,12}(?:예정|일정)/g)];
 for(const a of yearMatches){const yy=+a[1]<100?2000+(+a[1]):+a[1];if(yy>y)return a[0];}
 const pattern=/(?:(20\d{2}|2\d)년\s*)?(\d{1,2})(?:월\s*(?:초|중순|말|중|에|부터|대보수|\d{1,2}일|\([^)]*\)|\s)*|\/\d{1,2}[^\n]{0,18}?)[^\n.!]{0,25}?(?:작업|재개|착수|시작|진행)/g;
 for(const a of text.matchAll(pattern)){
   const yy=a[1]?(+a[1]<100?2000+(+a[1]):+a[1]):y,mm=+a[2];
   if(mm<1||mm>12)continue;
   if((yy>y||(yy===y&&mm>m))&&!/준공|추가\s*작업/.test(a[0]))return a[0];
 }
 return '';
}
function metrics(sites,now=new Date()){
 const all=sites.filter(s=>visible(s,now)),active=all.filter(s=>!completed(s)),cm=month(now),today=day(now);
 const visits=s=>uniqueDates(s.visitDates),contacts=s=>uniqueDates(s.contactDates);
 const missing=active.filter(s=>visits(s).filter(d=>d.slice(0,7)===cm).length===0);
 const deferred=missing.filter(s=>noteDeferral(s.note,now));
 const completion=active.filter(s=>{const end=day(s.end);const delta=(Date.parse(end)-Date.parse(today))/86400000;return end&&delta>=0&&delta<=30;});
 return {visible:all,active,completed:all.filter(s=>currentCompleted(s,now)),unvisited:missing.filter(s=>!noteDeferral(s.note,now)),deferred,never:active.filter(s=>!visits(s).length),monthlyVisits:all.reduce((a,s)=>a+visits(s).filter(d=>d.slice(0,7)===cm).length,0),completion,contactMissing:active.filter(s=>!contacts(s).length&&!String(s.note||'').trim())};
}
function week(sites,now=new Date()){
 const today=day(now),base=new Date(today+'T00:00:00Z'),dow=base.getUTCDay();base.setUTCDate(base.getUTCDate()+(dow===0?-6:1-dow));
 const days=Array.from({length:7},(_,i)=>{const d=new Date(base);d.setUTCDate(d.getUTCDate()+i);return {date:d.toISOString().slice(0,10),items:[]};});
 for(const s of sites.filter(s=>visible(s,now))){for(const v of uniqueDates(s.visitDates)){const d=days.find(d=>d.date===v);if(d)d.items.push(s);}}
 days.forEach(d=>d.items.sort((a,b)=>String(a.name).localeCompare(String(b.name),'ko')));return days;
}
return {day,month,completed,visible,currentCompleted,uniqueDates,noteDeferral,metrics,week};
});
