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

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'safety-dashboard-server is running' });
});

app.get('/api/contracts', async (req, res) => {
  try {
    const sites = [];
    let cursor = undefined;
    do {
      const response = await notion.databases.query({ database_id: DATABASE_ID, start_cursor: cursor, page_size: 100 });
      response.results.forEach(page => sites.push(mapPageToSite(page)));
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);
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

    const system = `
You are a command parser for a safety dashboard.
Return ONLY valid JSON with this schema:
{
  "action": "visit" | "contact" | "delete_visit" | "delete_contact" | "query" | "unknown",
  "siteName": string | null,
  "date": "YYYY-MM-DD" | null,
  "answer": string | null,
  "confirmText": string | null
}
Rules:
- If user asks a question, use action="query" and set answer.
- If user wants to add a visit record, use action="visit".
- If user wants to add a contact request record, use action="contact".
- If user wants to delete visit record, use action="delete_visit".
- If user wants to delete contact record, use action="delete_contact".
- Use siteNames to match siteName exactly when possible.
- If the user says "아리야" or "아리아" then interpret the rest of the utterance as the request.
- If the user asks about next week schedule, answer in Korean in answer field.
- If unsure, action="unknown" and answer="".
`;

    const user = {
      text,
      siteNames: Array.isArray(siteNames) ? siteNames : []
    };

    const ai = await deepseekChat([{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(user) }]);
    const result = parseJsonLoose(ai);
    if (!result) return res.json({ ok: true, result: { action: 'unknown', siteName: null, date: null, answer: null, confirmText: null } });
    res.json({ ok: true, result: normalizeAiResult(result) });
  } catch (err) {
    console.error('ai-command error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function deepseekChat(messages){
  const r = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, messages, temperature: 0.1 })
  });
  if(!r.ok){
    const t = await r.text();
    throw new Error(`DeepSeek HTTP ${r.status}: ${t}`);
  }
  const data = await r.json();
  return data?.choices?.[0]?.message?.content || '';
}

function parseJsonLoose(text){
  if(!text) return null;
  try { return JSON.parse(text); } catch(e) {}
  const m = text.match(/\{[\s\S]*\}/);
  if(!m) return null;
  try { return JSON.parse(m[0]); } catch(e) { return null; }
}

function normalizeAiResult(r){
  const out = {
    action: ['visit','contact','delete_visit','delete_contact','query','unknown'].includes(r.action) ? r.action : 'unknown',
    siteName: typeof r.siteName === 'string' && r.siteName.trim() ? r.siteName.trim() : null,
    date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date.trim()) ? r.date.trim() : null,
    answer: typeof r.answer === 'string' ? r.answer.trim() : null,
    confirmText: typeof r.confirmText === 'string' ? r.confirmText.trim() : null
  };
  return out;
}

function clonePropertiesForDuplicate(properties, propertyName, date){
  const cloned = {};
  for (const [key, value] of Object.entries(properties)) {
    if (key === propertyName && value?.type === 'date') {
      cloned[key] = { date: { start: date } };
      continue;
    }
    if (value?.type === 'title') {
      cloned[key] = { title: value.title || [] };
    } else if (value?.type === 'rich_text') {
      cloned[key] = { rich_text: value.rich_text || [] };
    } else if (value?.type === 'number') {
      cloned[key] = { number: value.number ?? null };
    } else if (value?.type === 'select') {
      cloned[key] = { select: value.select ? { name: value.select.name } : null };
    } else if (value?.type === 'multi_select') {
      cloned[key] = { multi_select: value.multi_select || [] };
    } else if (value?.type === 'checkbox') {
      cloned[key] = { checkbox: !!value.checkbox };
    } else if (value?.type === 'date') {
      cloned[key] = { date: null };
    } else if (value?.type === 'url') {
      cloned[key] = { url: value.url || null };
    } else if (value?.type === 'email') {
      cloned[key] = { email: value.email || null };
    } else if (value?.type === 'phone_number') {
      cloned[key] = { phone_number: value.phone_number || null };
    } else {
      try { cloned[key] = JSON.parse(JSON.stringify(value)); } catch(e) {}
    }
  }
  return cloned;
}

function mapPageToSite(page){
  const props = page.properties || {};
  const getText = (name) => {
    const p = props[name];
    if (!p) return '';
    if (p.type === 'title') return (p.title || []).map(t => t.plain_text).join('');
    if (p.type === 'rich_text') return (p.rich_text || []).map(t => t.plain_text).join('');
    if (p.type === 'select') return p.select ? p.select.name : '';
    if (p.type === 'phone_number') return p.phone_number || '';
    if (p.type === 'number') return p.number != null ? String(p.number) : '';
    return '';
  };
  const getDate = (name) => {
    const p = props[name];
    return p && p.date ? p.date.start : null;
  };
  const name = getText('공사명') || getText('Name') || getText('현장명') || '이름없음';
  return {
    id: page.id,
    name,
    company: getText('업체명'),
    contact: getText('연락처'),
    managerName: getText('담당자'),
    contractDate: getDate('계약일자'),
    contactRequest: getDate('연락요청일자'),
    visitDates: [getDate('방문일자')].filter(Boolean),
    contactDates: [getDate('연락요청일자')].filter(Boolean),
    pageIds: [page.id],
    lastEdited: page.last_edited_time
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
