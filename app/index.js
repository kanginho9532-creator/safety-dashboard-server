require('dotenv').config();
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
    const completedNames = buildCompletedSiteNameSet(rawSites);
    const filteredRawSites = rawSites.filter(s => !completedNames.has(s.name));
    const sites = groupSites(filteredRawSites).map(s => ({ ...s, completed: false }));
    const excluded = rawSites.length - filteredRawSites.length;
    res.json({ ok: true, count: sites.length, rawCount: rawSites.length, excludedByCompletion: excluded, completedSiteNames: Array.from(completedNames), sites });
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

app.post('/api/update-select', async (req, res) => {
  try {
    const { pageId, propertyName, value } = req.body;
    if (!pageId || !propertyName || value === undefined) {
      return res.status(400).json({ ok: false, error: 'pageId, propertyName, value(문자열 또는 null)가 필요합니다.' });
    }
    await notion.pages.update({
      page_id: pageId,
      properties: { [propertyName]: { select: value ? { name: value } : null } }
    });
    res.json({ ok: true, cleared: value === null });
  } catch (err) {
    console.error('update-select error:', err);
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
