const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.options('*', cors());

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

app.get('/', (req, res) => res.json({ ok: true, message: 'safety-dashboard-server is running' }));

app.get('/api/contracts', async (req, res) => {
  try {
    const pages = await queryAllPages();
    const sites = dedupeSites(pages.map(mapPageToSite));
    res.json({ ok: true, count: sites.length, sites });
  } catch (err) {
    console.error('contracts error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/update-visit', async (req, res) => {
  try {
    const { pageId, propertyName, date } = req.body;
    if (!pageId || !propertyName) return res.status(400).json({ ok: false, error: 'pageId와 propertyName이 필요합니다.' });
    const properties = {};
    properties[propertyName] = date === null ? { date: null } : { date: { start: date } };
    await notion.pages.update({ page_id: pageId, properties });
    res.json({ ok: true });
  } catch (err) {
    console.error('update-visit error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/duplicate-page', async (req, res) => {
  try {
    const { sourcePageId, propertyName, date } = req.body;
    if (!sourcePageId || !propertyName || !date) return res.status(400).json({ ok: false, error: 'sourcePageId, propertyName, date가 필요합니다.' });
    const sourcePage = await notion.pages.retrieve({ page_id: sourcePageId });
    const props = clonePropertiesForDuplicate(sourcePage.properties, propertyName, date);
    const newPage = await notion.pages.create({ parent: { database_id: DATABASE_ID }, properties: props });
    res.json({ ok: true, newPageId: newPage.id });
  } catch (err) {
    console.error('duplicate-page error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/ai-command', async (req, res) => {
  try {
    const { text, siteNames } = req.body || {};
    if (!text) return res.status(400).json({ ok: false, error: 'text is required' });
    if (!DEEPSEEK_API_KEY) return res.status(500).json({ ok: false, error: 'DEEPSEEK_API_KEY not set' });
    const system = `Return ONLY valid JSON with schema {"action":"visit"|"contact"|"delete_visit"|"delete_contact"|"query"|"unknown","siteName":string|null,"date":"YYYY-MM-DD"|null,"answer":string|null,"confirmText":string|null}`;
    const ai = await deepseekChat([{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ text, siteNames: Array.isArray(siteNames) ? siteNames : [] }) }]);
    const result = parseJsonLoose(ai);
    res.json({ ok: true, result: normalizeAiResult(result || {}) });
  } catch (err) {
    console.error('ai-command error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function queryAllPages(){
  const out=[];
  let cursor=undefined;
  do {
    const response = await notion.databases.query({ database_id: DATABASE_ID, start_cursor: cursor, page_size: 100 });
    out.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return out;
}

function getText(prop){
  if (!prop) return '';
  if (prop.type === 'title') return (prop.title || []).map(t => t.plain_text).join('');
  if (prop.type === 'rich_text') return (prop.rich_text || []).map(t => t.plain_text).join('');
  if (prop.type === 'select') return prop.select ? prop.select.name : '';
  if (prop.type === 'number') return prop.number != null ? String(prop.number) : '';
  return '';
}

function getDate(prop){ return prop && prop.date ? prop.date.start : null; }

function mapPageToSite(page){
  const p = page.properties || {};
  const name = getText(p['공사명']) || getText(p['Name']) || getText(p['현장명']) || getText(p['사이트명']) || '이름없음';
  return {
    id: page.id,
    name,
    company: getText(p['업체명']) || getText(p['회사명']) || '',
    managerName: getText(p['담당자']) || '',
    contact: getText(p['연락처']) || '',
    contractDate: getDate(p['계약일자']),
    start: getDate(p['착공일']) || getDate(p['시작일']),
    end: getDate(p['준공일']) || getDate(p['종료일']),
    contactRequest: getDate(p['연락요청일자']) || null,
    lastVisit: getDate(p['방문일자']) || null,
    visits: 1,
    visitDates: [getDate(p['방문일자'])].filter(Boolean),
    contactDates: [getDate(p['연락요청일자'])].filter(Boolean),
    address: getText(p['주소']) || '',
    site: getText(p['지역']) || '',
    status: getText(p['상태']) || '',
    note: getText(p['비고']) || '',
    lastEdited: page.last_edited_time,
    pageIds: [page.id],
    pageDetails: [{ pageId: page.id, visitDate: getDate(p['방문일자']) || null, contactDate: getDate(p['연락요청일자']) || null }]
  };
}

function normName(s){ return String(s || '').trim().replace(/\s+/g, ' '); }
function dedupeSites(sites){
  const map = new Map();
  for (const s of sites){
    const key = normName(s.name).toLowerCase();
    if (!map.has(key)) { map.set(key, { ...s }); continue; }
    const cur = map.get(key);
    cur.visits = (cur.visits || 0) + (s.visits || 0);
    cur.visitDates = [...new Set([...(cur.visitDates||[]), ...(s.visitDates||[])])];
    cur.contactDates = [...new Set([...(cur.contactDates||[]), ...(s.contactDates||[])])];
    cur.pageIds = [...new Set([...(cur.pageIds||[]), ...(s.pageIds||[])])];
    cur.pageDetails = [...(cur.pageDetails||[]), ...(s.pageDetails||[])];
    if (!cur.lastVisit || (s.lastVisit && s.lastVisit > cur.lastVisit)) cur.lastVisit = s.lastVisit;
    if (!cur.contactRequest || (s.contactRequest && s.contactRequest > cur.contactRequest)) cur.contactRequest = s.contactRequest;
    if (!cur.lastEdited || (s.lastEdited && s.lastEdited > cur.lastEdited)) cur.lastEdited = s.lastEdited;
    if (!cur.company && s.company) cur.company = s.company;
    if (!cur.managerName && s.managerName) cur.managerName = s.managerName;
    if (!cur.contact && s.contact) cur.contact = s.contact;
    if (!cur.address && s.address) cur.address = s.address;
    if (!cur.site && s.site) cur.site = s.site;
    if (!cur.status && s.status) cur.status = s.status;
    if (!cur.note && s.note) cur.note = s.note;
  }
  return [...map.values()];
}

async function deepseekChat(messages){
  const r = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, messages, temperature: 0.1 })
  });
  if(!r.ok){ throw new Error(await r.text()); }
  const data = await r.json();
  return data?.choices?.[0]?.message?.content || '';
}
function parseJsonLoose(text){ try { return JSON.parse(text); } catch(e) { const m = String(text||'').match(/\{[\s\S]*\}/); if(!m) return null; try { return JSON.parse(m[0]); } catch(e2){ return null; } } }
function normalizeAiResult(r){ return { action: ['visit','contact','delete_visit','delete_contact','query','unknown'].includes(r.action) ? r.action : 'unknown', siteName: typeof r.siteName === 'string' && r.siteName.trim() ? r.siteName.trim() : null, date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date.trim()) ? r.date.trim() : null, answer: typeof r.answer === 'string' ? r.answer.trim() : null, confirmText: typeof r.confirmText === 'string' ? r.confirmText.trim() : null }; }
function clonePropertiesForDuplicate(properties, propertyName, date){ const cloned = {}; for (const [key, value] of Object.entries(properties)) { if (key === propertyName && value?.type === 'date') { cloned[key] = { date: { start: date } }; continue; } if (value?.type === 'title') cloned[key] = { title: value.title || [] }; else if (value?.type === 'rich_text') cloned[key] = { rich_text: value.rich_text || [] }; else if (value?.type === 'number') cloned[key] = { number: value.number ?? null }; else if (value?.type === 'select') cloned[key] = { select: value.select ? { name: value.select.name } : null }; else if (value?.type === 'multi_select') cloned[key] = { multi_select: value.multi_select || [] }; else if (value?.type === 'checkbox') cloned[key] = { checkbox: !!value.checkbox }; else if (value?.type === 'date') cloned[key] = { date: null }; else if (value?.type === 'url') cloned[key] = { url: value.url || null }; else if (value?.type === 'email') cloned[key] = { email: value.email || null }; else if (value?.type === 'phone_number') cloned[key] = { phone_number: value.phone_number || null }; } return cloned; }
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));