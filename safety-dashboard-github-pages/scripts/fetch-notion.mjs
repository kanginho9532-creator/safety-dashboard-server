import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "@notionhq/client";

dotenv.config();

const notionApiKey = process.env.NOTION_API_KEY;
const databaseId = process.env.NOTION_DATABASE_ID;

if (!notionApiKey || !databaseId) {
  throw new Error("NOTION_API_KEY 또는 NOTION_DATABASE_ID 가 설정되지 않았습니다.");
}

const notion = new Client({ auth: notionApiKey });

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

async function fetchAllPages() {
  let results = [];
  let cursor = undefined;
  do {
    const resp = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    });
    results = results.concat(resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return results;
}

function groupSites(rawSites) {
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

  return Object.values(grouped).map((g) => ({
    ...g,
    visits: g.visitDates.length,
    lastVisit: g.visitDates.sort().reverse()[0] || null,
    contactDates: g.contactDates.sort().reverse(),
    visitDates: g.visitDates.sort().reverse(),
  })).sort((a, b) => new Date(b.lastEdited) - new Date(a.lastEdited));
}

const pages = await fetchAllPages();
const rawSites = pages.map(pageToSite);
const sites = groupSites(rawSites);
const payload = {
  ok: true,
  count: sites.length,
  rawCount: rawSites.length,
  syncedAt: new Date().toISOString(),
  sites,
};

const outPath = path.resolve('data/notion-data.json');
await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf-8');
console.log(`Saved ${sites.length} sites to ${outPath}`);
