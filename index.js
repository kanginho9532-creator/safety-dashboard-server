import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Client } from "@notionhq/client";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname));

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DB_ID = process.env.NOTION_DATABASE_ID;


// ---- helper: convert one Notion page -> site object used by frontend ----
function pageToSite(page) {
  const p = page.properties;
  const getTitle = (key) => p[key]?.title?.[0]?.plain_text || "";
  const getRichText = (key) => p[key]?.rich_text?.[0]?.plain_text || "";
  const getNumber = (key) => p[key]?.number ?? null;
  const getDate = (key) => p[key]?.date?.start || null;
  const getSelect = (key) => p[key]?.select?.name || "";
  const getStatus = (key) => p[key]?.status?.name || "";
  const getPhone = (key) => p[key]?.phone_number || "";
  const getFormulaString = (key) => {
    const f = p[key]?.formula;
    if (!f) return "";
    if (f.type === "string") return f.string || "";
    if (f.type === "number") return f.number ?? "";
    if (f.type === "date") return f.date?.start || "";
    return "";
  };
  const getFormulaNumber = (key) => {
    const f = p[key]?.formula;
    if (f && f.type === "number") return f.number ?? 0;
    return 0;
  };

  return {
    id: page.id,
    name: getTitle("공사명") || "이름없음",
    company: getRichText("회사") || getFormulaString("F회사명"),
    visits: getNumber("지도횟수") || 0,
    targetVisits: getNumber("지도횟수") || 0,
    lastVisit: getDate("방문일자"),
    contact: getPhone("감독자 연락처") || getRichText("감독자 연락처") || "",
    managerName: getRichText("감독자") || "",
    address: getRichText("현장주소"),
    start: getDate("착공일"),
    end: getDate("준공일"),
    contractDate: getDate("계약일"),
    amount: getFormulaNumber("계약금액(VAT 포함)") || getNumber("공사금액") || getNumber("계약금액(VAT자동계산)") || 0,
    contactRequest: getDate("연락요청 일자"),
    status: getStatus("작업 여부"),
    note: getRichText("비고"),
    site: getSelect("사이트"),
    manager: getRichText("감독자"),
    bizOpenNo: getRichText("사업장개시번호"),
    bizMgmtNo: getRichText("사업장관리번호"),
    mgmtNo: getRichText("관리번호"),
    lastEdited: page.last_edited_time,
  };
}


// ---- GET all contract sites from Notion ----
app.get("/api/contracts", async (req, res) => {
  try {
    let results = [];
    let cursor = undefined;
    do {
      const resp = await notion.databases.query({
        database_id: DB_ID,
        start_cursor: cursor,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      });
      results = results.concat(resp.results);
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    const rawSites = results.map(pageToSite);

    const grouped = {};
    rawSites.forEach((s) => {
      const key = s.name;
      const detail = { pageId: s.id, visitDate: s.lastVisit || null, contactDate: s.contactRequest || null };
      if (!grouped[key]) {
        grouped[key] = {
          ...s,
          visitDates: s.lastVisit ? [s.lastVisit] : [],
          contactDates: s.contactRequest ? [s.contactRequest] : [],
          pageIds: [s.id],
          pageDetails: [detail],
        };
      } else {
        const g = grouped[key];
        if (s.lastVisit && !g.visitDates.includes(s.lastVisit)) g.visitDates.push(s.lastVisit);
        if (s.contactRequest && !g.contactDates.includes(s.contactRequest)) g.contactDates.push(s.contactRequest);
        g.pageIds.push(s.id);
        g.pageDetails.push(detail);
        if (new Date(s.lastEdited) > new Date(g.lastEdited)) {
          Object.assign(g, s, { visitDates: g.visitDates, contactDates: g.contactDates, pageIds: g.pageIds, pageDetails: g.pageDetails });
        }
      }
    });

    const sites = Object.values(grouped).map((g) => ({
      ...g,
      visits: g.visitDates.length,
      lastVisit: g.visitDates.sort().reverse()[0] || null,
      contactDates: g.contactDates.sort().reverse(),
      visitDates: g.visitDates.sort().reverse(),
    }));

    sites.sort((a, b) => new Date(b.lastEdited) - new Date(a.lastEdited));

    res.json({ ok: true, count: sites.length, rawCount: rawSites.length, sites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.post("/api/update-visit", async (req, res) => {
  try {
    const { pageId, propertyName, date } = req.body;

    if (!pageId || !propertyName || date === undefined) {
      return res.status(400).json({
        ok: false,
        error: "pageId, propertyName required, date must be a date string or null",
      });
    }

    await notion.pages.update({
      page_id: pageId,
      properties: {
        [propertyName]: { date: date ? { start: date } : null },
      },
    });

    res.json({ ok: true, cleared: date === null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.post("/api/ai-schedule", async (req, res) => {
  try {
    const { sites, rules } = req.body;
    const prompt = `다음은 방문해야 할 현장 목록과 규칙입니다. 이번주(월~금) 방문 스케줄을 JSON으로만 응답하세요.
현장 목록: ${JSON.stringify(sites)}
규칙: ${JSON.stringify(rules)}
응답 형식: {"월":["현장명",...],"화":[...],"수":[...],"목":[...],"금":[...]}`;

    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    res.json({ ok: true, raw: content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.post("/api/ai-command", async (req, res) => {
  try {
    const { text, siteNames } = req.body;
    if (!text) return res.status(400).json({ ok: false, error: "text required" });

    const prompt = `당신은 건설 현장 안전관리 대시보드의 음성 명령 해석기입니다.
사용자가 말한 문장을 분석해서 아래 JSON 형식으로만 응답하세요. 다른 설명은 절대 넣지 마세요.

가능한 action 값:
- "add_visit": 방문 일자 추가
- "delete_visit": 방문 일자 삭제
- "add_contact": 연락요청 일자 추가
- "delete_contact": 연락요청 일자 삭제
- "unknown": 의도를 파악할 수 없음

현장명 목록(이 중에서 가장 유사한 것을 골라 정확히 그대로 사용하세요): ${JSON.stringify(siteNames)}

날짜는 오늘(${new Date().toISOString().slice(0,10)}) 기준으로 상대 표현(예: "내일", "다음주 월요일", "7월 25일")을 절대 날짜(YYYY-MM-DD)로 변환하세요.

응답 형식:
{"action":"add_visit","siteName":"현장명","date":"YYYY-MM-DD","confirmText":"OOO 현장에 YYYY-MM-DD 방문 일정을 추가할까요?"}

사용자 문장: "${text}"`;

    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });
    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || "{}";
    content = content.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      parsed = { action: "unknown", confirmText: "명령을 이해하지 못했습니다. 다시 말씀해주세요." };
    }

    res.json({ ok: true, result: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


const NON_COPYABLE_TYPES = ["formula", "rollup", "created_time", "created_by", "last_edited_time", "last_edited_by", "unique_id"];

app.post("/api/duplicate-page", async (req, res) => {
  try {
    const { sourcePageId, propertyName, date } = req.body;
    if (!sourcePageId || !propertyName || !date) {
      return res.status(400).json({ ok: false, error: "sourcePageId, propertyName, date required" });
    }

    const sourcePage = await notion.pages.retrieve({ page_id: sourcePageId });
    const newProperties = {};

    for (const [key, prop] of Object.entries(sourcePage.properties)) {
      if (NON_COPYABLE_TYPES.includes(prop.type)) continue;
      if (prop.type === "title") newProperties[key] = { title: prop.title };
      else if (prop.type === "rich_text") newProperties[key] = { rich_text: prop.rich_text };
      else if (prop.type === "number") newProperties[key] = { number: prop.number };
      else if (prop.type === "date") newProperties[key] = { date: prop.date };
      else if (prop.type === "select") newProperties[key] = { select: prop.select };
      else if (prop.type === "multi_select") newProperties[key] = { multi_select: prop.multi_select };
      else if (prop.type === "status") newProperties[key] = { status: prop.status };
      else if (prop.type === "phone_number") newProperties[key] = { phone_number: prop.phone_number };
      else if (prop.type === "checkbox") newProperties[key] = { checkbox: prop.checkbox };
      else if (prop.type === "url") newProperties[key] = { url: prop.url };
      else if (prop.type === "email") newProperties[key] = { email: prop.email };
      else if (prop.type === "people") newProperties[key] = { people: prop.people };
      else if (prop.type === "relation") newProperties[key] = { relation: prop.relation };
    }

    newProperties[propertyName] = { date: { start: date } };

    const newPage = await notion.pages.create({
      parent: { database_id: DB_ID },
      properties: newProperties,
    });

    res.json({ ok: true, newPageId: newPage.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.get("/api/debug-schema", async (req, res) => {
  try {
    const resp = await notion.databases.retrieve({ database_id: DB_ID });
    const propNames = Object.keys(resp.properties).map((k) => ({
      name: k,
      type: resp.properties[k].type,
    }));
    res.json({ ok: true, properties: propNames });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.get("/", (req, res) => res.send("Safety Dashboard API server running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
