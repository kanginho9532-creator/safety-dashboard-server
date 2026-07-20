import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Client } from "@notionhq/client";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json());

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
    lastVisit: getDate("방문일자"),
    contact: getPhone("감독자 연락처") || getRichText("감독자"),
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

    // 공사명 기준으로 그룹핑 -> 실제 계약 건수만 남기고, 방문일자/연락요청일자는 모두 합쳐서 배열로 저장
    const grouped = {};
    rawSites.forEach((s) => {
      const key = s.name;
      if (!grouped[key]) {
        grouped[key] = {
          ...s,
          visitDates: s.lastVisit ? [s.lastVisit] : [],
          contactDates: s.contactRequest ? [s.contactRequest] : [],
          pageIds: [s.id],
        };
      } else {
        const g = grouped[key];
        if (s.lastVisit && !g.visitDates.includes(s.lastVisit)) g.visitDates.push(s.lastVisit);
        if (s.contactRequest && !g.contactDates.includes(s.contactRequest)) g.contactDates.push(s.contactRequest);
        g.pageIds.push(s.id);
        // 가장 최근 수정된 페이지 정보(비고, 상태 등)로 대표값 갱신
        if (new Date(s.lastEdited) > new Date(g.lastEdited)) {
          Object.assign(g, s, { visitDates: g.visitDates, contactDates: g.contactDates, pageIds: g.pageIds });
        }
      }
    });

    const sites = Object.values(grouped).map((g) => ({
      ...g,
      visits: g.visitDates.length,
      lastVisit: g.visitDates.sort().reverse()[0] || null,
    }));

    sites.sort((a, b) => new Date(b.lastEdited) - new Date(a.lastEdited));

    res.json({ ok: true, count: sites.length, rawCount: rawSites.length, sites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- PATCH update visit date / contact date on a page ----
app.post("/api/update-visit", async (req, res) => {
  try {
    const { pageId, propertyName, date } = req.body;
    if (!pageId || !propertyName || !date) {
      return res.status(400).json({ ok: false, error: "pageId, propertyName, date required" });
    }
    await notion.pages.update({
      page_id: pageId,
      properties: {
        [propertyName]: { date: { start: date } },
      },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- POST ai weekly schedule via DeepSeek ----
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


// ---- DEBUG: 실제 Notion 속성 이름 확인용 ----
app.get("/api/debug-schema", async (req, res) => {
  try {
    const resp = await notion.databases.retrieve({ database_id: DB_ID });
    const propNames = Object.keys(resp.properties).map(k => ({
      name: k,
      type: resp.properties[k].type
    }));
    res.json({ ok: true, properties: propNames });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/", (req, res) => res.send("Safety Dashboard API server running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
