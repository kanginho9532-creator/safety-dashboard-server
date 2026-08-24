require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Client } = require('@notionhq/client');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.options('*', cors());
app.use(express.static(__dirname));

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DB_ID = process.env.NOTION_DATABASE_ID;
const COMPANY_DB_ID = process.env.NOTION_COMPANY_DATABASE_ID || process.env.COMPANY_NOTION_DATABASE_ID || process.env.NOTION_COMPANY_DB_ID || '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const NON_COPYABLE_TYPES = ['formula', 'rollup', 'created_time', 'created_by', 'last_edited_time', 'last_edited_by', 'unique_id'];
const PERSONAL_DIRECT_COMPANY_NAMES = ['개인직영공사'];

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'safety-dashboard.html'));
});

function normalizeKey(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}
function buildTextArray(value) {
  return value ? [{ type: 'text', text: { content: String(value) } }] : [];
}
function plainTextFromArray(arr) {
  return Array.isArray(arr) ? arr.map(t => t.plain_text || '').join('') : '';
}
function propToString(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title': return plainTextFromArray(prop.title);
    case 'rich_text': return plainTextFromArray(prop.rich_text);
    case 'phone_number': return prop.phone_number || '';
    case 'email': return prop.email || '';
    case 'url': return prop.url || '';
    case 'number': return prop.number != null ? String(prop.number) : '';
    case 'select': return (prop.select && prop.select.name) || '';
    case 'status': return (prop.status && prop.status.name) || '';
    case 'date': return (prop.date && prop.date.start) || '';
    case 'formula': {
      const f = prop.formula;
      if (!f) return '';
      if (f.type === 'string') return f.string || '';
      if (f.type === 'number') return f.number != null ? String(f.number) : '';
      if (f.type === 'date') return (f.date && f.date.start) || '';
      return '';
    }
    default: return '';
  }
}
function propToNumber(prop) {
  if (!prop) return null;
  if (prop.type === 'number') return typeof prop.number === 'number' ? prop.number : null;
  if (prop.type === 'formula' && prop.formula && prop.formula.type === 'number') return typeof prop.formula.number === 'number' ? prop.formula.number : null;
  return null;
}
function propToDate(prop) {
  if (!prop) return null;
  if (prop.type === 'date') return (prop.date && prop.date.start) || null;
  if (prop.type === 'formula' && prop.formula && prop.formula.type === 'date') return (prop.formula.date && prop.formula.date.start) || null;
  return null;
}
function propToStatus(prop) {
  if (!prop) return '';
  if (prop.type === 'status') return (prop.status && prop.status.name) || '';
  if (prop.type === 'select') return (prop.select && prop.select.name) || '';
  return '';
}
function findPropertyKey(properties, candidates) {
  const keys = Object.keys(properties || {});
  for (const candidate of candidates) {
    const found = keys.find(key => normalizeKey(key) === normalizeKey(candidate));
    if (found) return found;
  }
  return null;
}
function getPropertyString(properties, candidates) {
  const key = findPropertyKey(properties, candidates);
  return key ? propToString(properties[key]) : '';
}
function getPropertyNumber(properties, candidates) {
  const key = findPropertyKey(properties, candidates);
  return key ? propToNumber(properties[key]) : null;
}
function getPropertyDate(properties, candidates) {
  const key = findPropertyKey(properties, candidates);
  return key ? propToDate(properties[key]) : null;
}
function getPropertyStatus(properties, candidates) {
  const key = findPropertyKey(properties, candidates);
  return key ? propToStatus(properties[key]) : '';
}
function findCompanyNameFromProperties(properties) {
  return getPropertyString(properties, ['회사명', '회사', '업체명', 'F회사명']);
}
function extractPeopleFromProperties(properties) {
  const peopleMap = new Map();
  const keys = Object.keys(properties || {});
  for (const key of keys) {
    const norm = normalizeKey(key);
    let match = norm.match(/^담당자(\d+)$/) || norm.match(/^담당자명(\d+)$/) || norm.match(/^담당자이름(\d+)$/);
    if (match) {
      const idx = Number(match[1]);
      const cur = peopleMap.get(idx) || { index: idx, label: `담당자${idx}`, name: '', phone: '' };
      cur.name = propToString(properties[key]) || cur.name;
      peopleMap.set(idx, cur);
      continue;
    }
    match = norm.match(/^연락처(\d+)$/) || norm.match(/^담당자(\d+)연락처$/) || norm.match(/^담당자연락처(\d+)$/) || norm.match(/^전화번호(\d+)$/);
    if (match) {
      const idx = Number(match[1]);
      const cur = peopleMap.get(idx) || { index: idx, label: `담당자${idx}`, name: '', phone: '' };
      cur.phone = propToString(properties[key]) || cur.phone;
      peopleMap.set(idx, cur);
      continue;
    }
  }
  if (!peopleMap.size) {
    const fallbackName = getPropertyString(properties, ['담당자', '감독자']);
    const fallbackPhone = getPropertyString(properties, ['담당자 연락처', '감독자 연락처', '연락처']);
    if (fallbackName || fallbackPhone) {
      peopleMap.set(1, { index: 1, label: '담당자1', name: fallbackName, phone: fallbackPhone });
    }
  }
  return Array.from(peopleMap.values())
    .sort((a, b) => a.index - b.index)
    .map((p, idx) => ({ label: p.label || `담당자${idx + 1}`, name: p.name || '', phone: p.phone || '' }));
}
function pageToSite(page) {
  const p = page.properties || {};
  const managerEntries = extractPeopleFromProperties(p);
  return {
    id: page.id,
    name: getPropertyString(p, ['공사명', '현장명']) || '이름없음',
    company: findCompanyNameFromProperties(p),
    visits: getPropertyNumber(p, ['지도횟수', '방문횟수']) || 0,
    targetVisits: getPropertyNumber(p, ['지도횟수', '목표방문횟수']) || 0,
    lastVisit: getPropertyDate(p, ['방문일자']),
    contact: getPropertyString(p, ['감독자 연락처', '담당자 연락처', '연락처1', '연락처']) || (managerEntries[0] && managerEntries[0].phone) || '',
    managerName: getPropertyString(p, ['감독자', '담당자', '담당자1']) || (managerEntries[0] && managerEntries[0].name) || '',
    address: getPropertyString(p, ['현장주소', '주소']),
    start: getPropertyDate(p, ['착공일']),
    end: getPropertyDate(p, ['준공일']),
    contractDate: getPropertyDate(p, ['계약일']),
    amount: getPropertyNumber(p, ['계약금액(VAT 포함)', '공사금액', '계약금액(VAT자동 계산)']) || 0,
    contactRequest: getPropertyDate(p, ['연락요청 일자', '연락요청일자']),
    status: getPropertyStatus(p, ['작업 여부', '상태']),
    note: getPropertyString(p, ['비고']),
    site: getPropertyString(p, ['사이트', '지역']),
    manager: getPropertyString(p, ['감독자', '담당자']) || '',
    responsible: getPropertyString(p, ['책임자']) || '',
    managerEntries,
    bizOpenNo: getPropertyString(p, ['사업장개시번호']),
    bizMgmtNo: getPropertyString(p, ['사업장관리번호']),
    mgmtNo: getPropertyString(p, ['관리번호']),
    lastEdited: page.last_edited_time,
    createdAt: getPropertyDate(p, ['생성 일시']) || page.created_time,
    rawProperties: p
  };
}
function groupSites(rawSites) {
  const grouped = {};
  rawSites.forEach((s) => {
    const key = s.name;
    const detail = { pageId: s.id, visitDate: s.lastVisit || null, contactDate: s.contactRequest || null };
    if (!grouped[key]) {
      grouped[key] = {
        ...s,
        createdAt: s.createdAt || s.lastEdited,
        visitDates: s.lastVisit ? [s.lastVisit] : [],
        contactDates: s.contactRequest ? [s.contactRequest] : [],
        pageIds: [s.id],
        pageDetails: [detail],
        _statuses: s.status ? [s.status] : []
      };
    } else {
      const g = grouped[key];
      if (s.lastVisit && !g.visitDates.includes(s.lastVisit)) g.visitDates.push(s.lastVisit);
      if (s.contactRequest && !g.contactDates.includes(s.contactRequest)) g.contactDates.push(s.contactRequest);
      if (!g.pageIds.includes(s.id)) g.pageIds.push(s.id);
      g.pageDetails.push(detail);
      if (s.status && !g._statuses.includes(s.status)) g._statuses.push(s.status);
      if (new Date(s.createdAt || s.lastEdited) > new Date(g.createdAt || 0)) g.createdAt = s.createdAt || s.lastEdited;
      if (new Date(s.lastEdited) > new Date(g.lastEdited)) {
        Object.assign(g, s, { createdAt: g.createdAt, visitDates: g.visitDates, contactDates: g.contactDates, pageIds: g.pageIds, pageDetails: g.pageDetails, _statuses: g._statuses });
      }
    }
  });
  const COMPLETED_KEYWORDS = ['완료','준공완료','공사완료','공사 완료','종료','종결'];
  const isCompletedGroup = (statuses) => (statuses || []).some(st => {
    const norm = String(st || '').replace(/\s+/g,'');
    return COMPLETED_KEYWORDS.some(kw => norm.includes(kw.replace(/\s+/g,'')));
  });
  return Object.values(grouped).map((g) => ({
    ...g,
    visits: g.visitDates.length,
    lastVisit: g.visitDates.slice().sort().reverse()[0] || null,
    contactDates: g.contactDates.slice().sort().reverse(),
    visitDates: g.visitDates.slice().sort().reverse(),
    _completed: isCompletedGroup(g._statuses),
    _allStatuses: (g._statuses || []).slice()
  })).filter(g => !g._completed).map(({ _completed, _allStatuses, _statuses, ...rest }) => rest).sort((a, b) => new Date(b.lastEdited) - new Date(a.lastEdited));
}
async function queryAllPages(databaseId, sorts = [{ timestamp: 'last_edited_time', direction: 'descending' }]) {
  if (!databaseId) return [];
  let results = [];
  let cursor = undefined;
  do {
    const resp = await notion.databases.query({ database_id: databaseId, start_cursor: cursor, sorts });
    results = results.concat(resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return results;
}
function parseCompanyPage(page) {
  const props = page.properties || {};
  return {
    pageId: page.id,
    name: getPropertyString(props, ['회사명', '회사', '업체명']) || '회사명 미지정',
    responsible: getPropertyString(props, ['책임자']) || '',
    people: extractPeopleFromProperties(props),
    lastEdited: page.last_edited_time
  };
}
function buildCompanies(rawSites, companyPages = []) {
  const map = new Map();
  rawSites.forEach(site => {
    const companyName = site.company || '회사명 미지정';
    if (!map.has(companyName)) {
      map.set(companyName, { name: companyName, responsible: site.responsible || '', people: [], contracts: [], pageIds: [], lastEdited: site.lastEdited });
    }
    const item = map.get(companyName);
    if (!item.responsible && site.responsible) item.responsible = site.responsible;
    (site.managerEntries || []).forEach((person, idx) => {
      const exists = item.people.some(p => (p.name || '') === (person.name || '') && (p.phone || '') === (person.phone || ''));
      if (!exists && (person.name || person.phone)) item.people.push({ label: person.label || `담당자${idx + 1}`, name: person.name || '', phone: person.phone || '' });
    });
    if (site.name && !item.contracts.some(contract => contract.name === site.name)) item.contracts.push({ name: site.name, status: site.status || '', end: site.end || '' });
    if (!item.pageIds.includes(site.id)) item.pageIds.push(site.id);
    if (new Date(site.lastEdited) > new Date(item.lastEdited || 0)) item.lastEdited = site.lastEdited;
  });
  companyPages.map(parseCompanyPage).forEach(cp => {
    if (!map.has(cp.name)) {
      map.set(cp.name, { name: cp.name, responsible: cp.responsible || '', people: cp.people || [], contracts: [], pageIds: [], companyPageId: cp.pageId, lastEdited: cp.lastEdited });
    } else {
      const item = map.get(cp.name);
      item.companyPageId = cp.pageId;
      if (cp.responsible) item.responsible = cp.responsible;
      if (Array.isArray(cp.people) && cp.people.length) item.people = cp.people;
      if (new Date(cp.lastEdited) > new Date(item.lastEdited || 0)) item.lastEdited = cp.lastEdited;
    }
  });
  return Array.from(map.values()).map(company => ({
    ...company,
    people: company.people && company.people.length ? company.people : [{ label: '담당자1', name: '', phone: '' }],
    contracts: (company.contracts || []).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko')),
    contractCount: (company.contracts || []).length
  })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
}
function cloneWritableProperty(prop) {
  switch (prop.type) {
    case 'title': return { title: prop.title };
    case 'rich_text': return { rich_text: prop.rich_text };
    case 'number': return { number: prop.number };
    case 'date': return { date: prop.date };
    case 'select': return { select: prop.select };
    case 'multi_select': return { multi_select: prop.multi_select };
    case 'status': return { status: prop.status };
    case 'phone_number': return { phone_number: prop.phone_number };
    case 'checkbox': return { checkbox: prop.checkbox };
    case 'url': return { url: prop.url };
    case 'email': return { email: prop.email };
    case 'people': return { people: prop.people };
    case 'relation': return { relation: prop.relation };
    default: return null;
  }
}
function setPropertyValueForExistingProp(prop, value) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title': return { title: buildTextArray(value) };
    case 'rich_text': return { rich_text: buildTextArray(value) };
    case 'phone_number': return { phone_number: value || null };
    case 'email': return { email: value || null };
    case 'url': return { url: value || null };
    case 'number': return { number: value === '' || value == null ? null : Number(String(value).replace(/[^0-9.-]/g, '')) };
    case 'date': return { date: value ? { start: String(value) } : null };
    case 'select': return { select: value ? { name: String(value) } : null };
    case 'status': return { status: value ? { name: String(value) } : null };
    case 'checkbox': return { checkbox: Boolean(value) };
    default: return null;
  }
}
function applyCandidates(properties, updates, candidates, value) {
  const key = findPropertyKey(properties, candidates);
  if (!key) return false;
  const update = setPropertyValueForExistingProp(properties[key], value);
  if (!update) return false;
  updates[key] = update;
  return true;
}
function collectIndexedSlots(properties, peopleLength) {
  const indices = new Set([1, 2, 3]);
  for (const key of Object.keys(properties || {})) {
    const norm = normalizeKey(key);
    const match = norm.match(/(담당자|연락처|전화번호)(\d+)/);
    if (match) indices.add(Number(match[2]));
  }
  for (let i = 1; i <= Math.max(peopleLength, 3); i++) indices.add(i);
  return Array.from(indices).sort((a, b) => a - b);
}
function buildCompanyUpdatesFromProperties(properties, payload) {
  const updates = {};
  applyCandidates(properties, updates, ['책임자'], payload.responsible || '');
  const people = Array.isArray(payload.people) ? payload.people : [];
  const slots = collectIndexedSlots(properties, people.length);
  slots.forEach((slot) => {
    const person = people[slot - 1] || {};
    let nameApplied = applyCandidates(properties, updates, [`담당자${slot}`, `담당자 ${slot}`, `담당자${slot}명`, `담당자${slot}이름`], person.name || '');
    if (slot === 1 && !nameApplied) nameApplied = applyCandidates(properties, updates, ['담당자', '감독자'], person.name || '');
    let phoneApplied = applyCandidates(properties, updates, [`연락처${slot}`, `연락처 ${slot}`, `담당자${slot} 연락처`, `담당자${slot}연락처`, `담당자 ${slot} 연락처`, `전화번호${slot}`], person.phone || '');
    if (slot === 1 && !phoneApplied) phoneApplied = applyCandidates(properties, updates, ['담당자 연락처', '감독자 연락처', '연락처'], person.phone || '');
  });
  return updates;
}
async function updatePageProperties(pageId, updates) {
  if (!pageId || !Object.keys(updates).length) return false;
  await notion.pages.update({ page_id: pageId, properties: updates });
  return true;
}
async function updateCompanyPages(companyName, payload) {
  const contractPages = await queryAllPages(DB_ID);
  const matchingContractPages = contractPages.filter(page => findCompanyNameFromProperties(page.properties || {}) === companyName);
  let updatedContractPages = 0;
  for (const page of matchingContractPages) {
    const updates = buildCompanyUpdatesFromProperties(page.properties || {}, payload);
    if (await updatePageProperties(page.id, updates)) updatedContractPages += 1;
  }

  let companyDbUpdated = false;
  if (COMPANY_DB_ID) {
    const companyPages = await queryAllPages(COMPANY_DB_ID);
    const parsed = companyPages.map(parseCompanyPage);
    const found = parsed.find(item => item.name === companyName);
    if (found) {
      const rawPage = companyPages.find(page => page.id === found.pageId);
      const updates = buildCompanyUpdatesFromProperties(rawPage.properties || {}, payload);
      if (await updatePageProperties(found.pageId, updates)) companyDbUpdated = true;
    }
  }
  return { updatedContractPages, companyDbUpdated };
}

app.get('/api/contracts', async (req, res) => {
  try {
    if (!DB_ID) throw new Error('NOTION_DATABASE_ID not set');
    const results = await queryAllPages(DB_ID);
    const rawSites = results.map(pageToSite);
    const sites = groupSites(rawSites);
    res.json({ ok: true, count: sites.length, rawCount: rawSites.length, sites });
  } catch (err) {
    console.error('contracts error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/companies', async (req, res) => {
  try {
    if (!DB_ID) throw new Error('NOTION_DATABASE_ID not set');
    const contractPages = await queryAllPages(DB_ID);
    const rawSites = contractPages.map(pageToSite);
    const companyPages = COMPANY_DB_ID ? await queryAllPages(COMPANY_DB_ID) : [];
    const companies = buildCompaniesV2(rawSites, companyPages);
    res.json({ ok: true, count: companies.length, companies, companyDbEnabled: Boolean(COMPANY_DB_ID) });
  } catch (err) {
    console.error('companies error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/company-card', async (req, res) => {
  try {
    const payload = buildCompanyPayloadContext(req.body || {});
    if (!payload.companyName) return res.status(400).json({ ok: false, error: 'companyName is required' });
    const result = await updateCompanyPagesV2(payload);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('company-card error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/update-visit', async (req, res) => {
  try {
    const { pageId, propertyName, date } = req.body;
    if (!pageId || !propertyName || date === undefined) {
      return res.status(400).json({ ok: false, error: 'pageId, propertyName required, date must be a date string or null' });
    }
    await notion.pages.update({
      page_id: pageId,
      properties: { [propertyName]: { date: date ? { start: date } : null } }
    });
    res.json({ ok: true, cleared: date === null });
  } catch (err) {
    console.error('update-visit error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/duplicate-page', async (req, res) => {
  try {
    const { sourcePageId, propertyName, date } = req.body;
    if (!sourcePageId || !propertyName || !date) {
      return res.status(400).json({ ok: false, error: 'sourcePageId, propertyName, date required' });
    }
    const sourcePage = await notion.pages.retrieve({ page_id: sourcePageId });
    const newProperties = {};
    for (const [key, prop] of Object.entries(sourcePage.properties || {})) {
      if (NON_COPYABLE_TYPES.includes(prop.type)) continue;
      const cloned = cloneWritableProperty(prop);
      if (cloned) newProperties[key] = cloned;
    }
    newProperties[propertyName] = { date: { start: date } };
    const newPage = await notion.pages.create({ parent: { database_id: DB_ID }, properties: newProperties });
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

    const prompt = `당신은 건설 현장 안전관리 대시보드의 음성 명령 해석기입니다.
사용자가 말한 문장을 분석해서 아래 JSON 형식으로만 응답하세요. 다른 설명은 절대 넣지 마세요.

가능한 action 값:
- "add_visit": 방문 일자 추가
- "delete_visit": 방문 일자 삭제
- "add_contact": 연락요청 일자 추가
- "delete_contact": 연락요청 일자 삭제
- "unknown": 의도를 파악할 수 없음

현장명 목록(이 중에서 가장 유사한 것을 골라 정확히 그대로 사용하세요): ${JSON.stringify(Array.isArray(siteNames) ? siteNames : [])}

날짜는 오늘(${new Date().toISOString().slice(0, 10)}) 기준으로 상대 표현(예: "내일", "다음주 월요일", "7월 25일")을 절대 날짜(YYYY-MM-DD)로 변환하세요.

응답 형식:
{"action":"add_visit","siteName":"현장명","date":"YYYY-MM-DD","confirmText":"OOO 현장에 YYYY-MM-DD 방문 일정을 추가할까요?"}

사용자 문장: "${text}"`;

    const resp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: DEEPSEEK_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0 })
    });
    const data = await resp.json();
    let content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '{}';
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      parsed = { action: 'unknown', confirmText: '명령을 이해하지 못했습니다. 다시 말씀해주세요.' };
    }
    res.json({ ok: true, result: parsed });
  } catch (err) {
    console.error('ai-command error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/debug-schema', async (req, res) => {
  try {
    const resp = await notion.databases.retrieve({ database_id: DB_ID });
    const propNames = Object.keys(resp.properties).map((k) => ({ name: k, type: resp.properties[k].type }));
    let companyProps = [];
    if (COMPANY_DB_ID) {
      const cResp = await notion.databases.retrieve({ database_id: COMPANY_DB_ID });
      companyProps = Object.keys(cResp.properties).map((k) => ({ name: k, type: cResp.properties[k].type }));
    }
    res.json({ ok: true, properties: propNames, companyDbEnabled: Boolean(COMPANY_DB_ID), companyProperties: companyProps });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


function cleanCompanyNameRaw(name) {
  const value = String(name || '').trim();
  return value || '회사명 미지정';
}
function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}
function normalizePersonName(value) {
  return String(value || '').trim();
}
function isPersonalDirectCompanyName(name) {
  return PERSONAL_DIRECT_COMPANY_NAMES.includes(cleanCompanyNameRaw(name));
}
function getCompanyRepresentativeName(siteOrCompany) {
  return normalizePersonName((siteOrCompany && (siteOrCompany.responsible || siteOrCompany.managerName || siteOrCompany.manager)) || '');
}
function buildCompanyIdentity(companyName, representativeName) {
  const cleanName = cleanCompanyNameRaw(companyName);
  const representative = normalizePersonName(representativeName);
  if (isPersonalDirectCompanyName(cleanName)) {
    return { key: `${cleanName}::${representative || '미지정'}`, displayName: representative ? `${cleanName} · ${representative}` : `${cleanName} · 대표자 미지정` };
  }
  return { key: cleanName, displayName: cleanName };
}
function getSiteCompanyIdentity(site) {
  return buildCompanyIdentity(site && site.company, getCompanyRepresentativeName(site));
}
function buildCompanyPayloadContext(payload = {}) {
  const pageIds = Array.isArray(payload.pageIds) ? payload.pageIds.filter(Boolean) : [];
  const contractNames = Array.isArray(payload.contractNames) ? payload.contractNames.filter(Boolean) : [];
  const representativeName = normalizePersonName(payload.representativeName || payload.responsible || '');
  const identity = buildCompanyIdentity(payload.companyName, representativeName);
  return {
    ...payload,
    companyName: cleanCompanyNameRaw(payload.companyName),
    representativeName,
    companyKey: payload.companyKey || identity.key,
    companyDisplayName: payload.companyDisplayName || identity.displayName,
    pageIds,
    contractNames
  };
}
function matchCompanyPayloadToSite(site, payload = {}) {
  if (!site) return false;
  const siteIdentity = getSiteCompanyIdentity(site);
  if (payload.companyKey && siteIdentity.key === payload.companyKey) return true;
  if (payload.pageIds && payload.pageIds.length && payload.pageIds.includes(site.id)) return true;
  if (payload.contractNames && payload.contractNames.length && payload.contractNames.includes(site.name)) {
    if (!payload.companyName || cleanCompanyNameRaw(site.company) === cleanCompanyNameRaw(payload.companyName)) return true;
  }
  if (payload.companyName && cleanCompanyNameRaw(site.company) !== cleanCompanyNameRaw(payload.companyName)) return false;
  if (isPersonalDirectCompanyName(site.company)) {
    return siteIdentity.key === buildCompanyIdentity(payload.companyName, payload.representativeName).key;
  }
  return cleanCompanyNameRaw(site.company) === cleanCompanyNameRaw(payload.companyName);
}
function buildCompaniesV2(rawSites, companyPages = []) {
  const map = new Map();
  rawSites.forEach(site => {
    const identity = getSiteCompanyIdentity(site);
    if (!map.has(identity.key)) {
      map.set(identity.key, {
        key: identity.key,
        name: cleanCompanyNameRaw(site.company),
        displayName: identity.displayName,
        responsible: site.responsible || '',
        representativeName: getCompanyRepresentativeName(site),
        people: [],
        contracts: [],
        pageIds: [],
        lastEdited: site.lastEdited,
        isPersonalDirect: isPersonalDirectCompanyName(site.company)
      });
    }
    const item = map.get(identity.key);
    if (!item.responsible && site.responsible) item.responsible = site.responsible;
    if (!item.representativeName) item.representativeName = getCompanyRepresentativeName(site);
    (site.managerEntries || []).forEach((person, idx) => {
      const exists = item.people.some(p => (p.name || '') === (person.name || '') && (p.phone || '') === (person.phone || ''));
      if (!exists && (person.name || person.phone)) item.people.push({ label: person.label || `담당자${idx + 1}`, name: person.name || '', phone: person.phone || '' });
    });
    if (site.name && !item.contracts.some(contract => contract.name === site.name)) item.contracts.push({ name: site.name, status: site.status || '', end: site.end || '', pageIds: site.pageIds || [site.id] });
    if (!item.pageIds.includes(site.id)) item.pageIds.push(site.id);
    if (new Date(site.lastEdited) > new Date(item.lastEdited || 0)) item.lastEdited = site.lastEdited;
  });
  companyPages.map(parseCompanyPage).forEach(cp => {
    const representativeName = normalizePersonName(cp.responsible || (cp.people && cp.people[0] && cp.people[0].name) || '');
    const identity = buildCompanyIdentity(cp.name, representativeName);
    if (!map.has(identity.key)) {
      map.set(identity.key, { key: identity.key, name: cleanCompanyNameRaw(cp.name), displayName: identity.displayName, responsible: cp.responsible || '', representativeName, people: cp.people || [], contracts: [], pageIds: [], companyPageId: cp.pageId, lastEdited: cp.lastEdited, isPersonalDirect: isPersonalDirectCompanyName(cp.name) });
    } else {
      const item = map.get(identity.key);
      item.companyPageId = cp.pageId;
      if (cp.responsible) item.responsible = cp.responsible;
      if (!item.representativeName) item.representativeName = representativeName;
      if (Array.isArray(cp.people) && cp.people.length) item.people = cp.people;
      if (new Date(cp.lastEdited) > new Date(item.lastEdited || 0)) item.lastEdited = cp.lastEdited;
    }
  });
  return Array.from(map.values()).map(company => ({
    ...company,
    people: company.people && company.people.length ? company.people : [{ label: '담당자1', name: '', phone: '' }],
    contracts: (company.contracts || []).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko')),
    contractCount: (company.contracts || []).length
  })).sort((a, b) => String(a.displayName || a.name).localeCompare(String(b.displayName || b.name), 'ko'));
}
async function updateCompanyPagesV2(payload) {
  const context = buildCompanyPayloadContext(payload);
  const contractPages = await queryAllPages(DB_ID);
  const rawSites = contractPages.map(pageToSite);
  const matchingContractPages = contractPages.filter((page, idx) => matchCompanyPayloadToSite(rawSites[idx], context));
  let updatedContractPages = 0;
  for (const page of matchingContractPages) {
    const updates = buildCompanyUpdatesFromProperties(page.properties || {}, context);
    if (await updatePageProperties(page.id, updates)) updatedContractPages += 1;
  }

  let companyDbUpdated = false;
  if (COMPANY_DB_ID) {
    const companyPages = await queryAllPages(COMPANY_DB_ID);
    const parsed = companyPages.map(parseCompanyPage);
    const found = parsed.find(item => buildCompanyIdentity(item.name, normalizePersonName(item.responsible || (item.people && item.people[0] && item.people[0].name) || '')).key === context.companyKey);
    if (found) {
      const rawPage = companyPages.find(page => page.id === found.pageId);
      const updates = buildCompanyUpdatesFromProperties(rawPage.properties || {}, context);
      if (await updatePageProperties(found.pageId, updates)) companyDbUpdated = true;
    }
  }
  return { updatedContractPages, companyDbUpdated, matchedContracts: matchingContractPages.length };
}


const SITE_FIELD_CANDIDATES = {
  name: ['공사명', '현장명'],
  company: ['회사명', '회사', '업체명', 'F회사명'],
  managerName: ['담당자1', '담당자', '감독자'],
  contact: ['연락처1', '담당자 연락처', '감독자 연락처', '연락처', '전화번호1'],
  address: ['현장주소', '주소'],
  start: ['착공일'],
  end: ['준공일'],
  contractDate: ['계약일'],
  amount: ['계약금액(VAT 포함)', '공사금액', '계약금액(VAT자동 계산)'],
  status: ['작업 여부', '상태'],
  note: ['비고'],
  site: ['사이트', '지역'],
  responsible: ['책임자'],
  bizOpenNo: ['사업장개시번호'],
  bizMgmtNo: ['사업장관리번호'],
  mgmtNo: ['관리번호'],
  targetVisits: ['목표방문횟수', '지도횟수'],
  visits: ['방문횟수', '지도횟수']
};
function normalizeSiteFieldValue(fieldKey, value) {
  if (value == null) return '';
  if (['amount', 'targetVisits', 'visits'].includes(fieldKey)) {
    const num = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(num) ? num : null;
  }
  if (['contractDate', 'start', 'end'].includes(fieldKey)) return value ? String(value) : null;
  return String(value);
}
function buildSiteUpdatesFromProperties(properties, fieldUpdates = {}) {
  const updates = {};
  Object.entries(fieldUpdates || {}).forEach(([fieldKey, rawValue]) => {
    const candidates = SITE_FIELD_CANDIDATES[fieldKey] || [];
    if (!candidates.length) return;
    const value = normalizeSiteFieldValue(fieldKey, rawValue);
    applyCandidates(properties, updates, candidates, value);
  });
  return updates;
}
async function resolveSitePagesForUpdate(pageIds = [], siteName = '') {
  const uniquePageIds = Array.from(new Set((Array.isArray(pageIds) ? pageIds : []).filter(Boolean)));
  if (uniquePageIds.length) {
    const pages = [];
    for (const pageId of uniquePageIds) {
      try {
        const page = await notion.pages.retrieve({ page_id: pageId });
        if (page && page.object === 'page') pages.push(page);
      } catch (err) {
        console.warn('site page retrieve failed:', pageId, err.message);
      }
    }
    if (pages.length) return pages;
  }
  const all = await queryAllPages(DB_ID);
  return all.filter(page => pageToSite(page).name === siteName);
}

async function ensureDatabaseOption(propertyName, value) {
  if (!propertyName || !value) return;
  try {
    const db = await notion.databases.retrieve({ database_id: DB_ID });
    const prop = db.properties && db.properties[propertyName];
    if (!prop) return;
    if (prop.type === 'select') {
      const existing = (prop.select && prop.select.options || []).some(option => option.name === value);
      if (!existing) {
        await notion.databases.update({
          database_id: DB_ID,
          properties: { [propertyName]: { select: { options: [...(prop.select.options || []), { name: value }] } } }
        });
      }
    } else if (prop.type === 'status') {
      const existing = (prop.status && prop.status.options || []).some(option => option.name === value);
      if (!existing) {
        await notion.databases.update({
          database_id: DB_ID,
          properties: { [propertyName]: { status: { options: [...(prop.status.options || []), { name: value }] } } }
        });
      }
    }
  } catch (err) {
    console.warn('ensureDatabaseOption failed:', propertyName, value, err.message);
  }
}
async function ensureOptionsForUpdates(properties, updates) {
  for (const key of Object.keys(updates || {})) {
    const prop = properties && properties[key];
    if (!prop) continue;
    const type = prop.type;
    if (type === 'select' || type === 'status') {
      const value = updates[key] && updates[key][type] && updates[key][type].name;
      if (value) await ensureDatabaseOption(key, value);
    }
  }
}
app.post('/api/update-site-fields', async (req, res) => {
  try {
    const { pageIds = [], siteName = '', updates = {} } = req.body || {};
    if (!DB_ID) throw new Error('NOTION_DATABASE_ID not set');
    if (!Object.keys(updates || {}).length) return res.status(400).json({ ok: false, error: 'updates required' });
    const pages = await resolveSitePagesForUpdate(pageIds, siteName);
    let updatedPages = 0;
    for (const page of pages) {
      const notionUpdates = buildSiteUpdatesFromProperties(page.properties || {}, updates);
      await ensureOptionsForUpdates(page.properties || {}, notionUpdates);
      if (await updatePageProperties(page.id, notionUpdates)) updatedPages += 1;
    }
    res.json({ ok: true, updatedPages, matchedPages: pages.length });
  } catch (err) {
    console.error('update-site-fields error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'API endpoint not found: ' + req.method + ' ' + req.path });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
