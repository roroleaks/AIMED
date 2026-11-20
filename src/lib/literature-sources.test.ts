import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeHtmlEntities,
  sanitizeSearchQuery,
  buildSearchQuery,
  deduplicateArticles,
  fetchOpenAlexArticles,
  fetchCrossrefArticles,
  fetchSemanticScholarArticles,
  fetchPmcArticles,
  fetchPubMedArticles,
  searchMultiSourceLiterature,
  fetchEuropePmcArticles,
  fetchDoajArticles,
  fetchGoogleScholarArticles,
  parseScholarSummary,
  articleIdentityKeys,
  resolveMandatorySources,
  ALL_LITERATURE_SOURCES,
  type LiteratureArticle,
  SEARCH_SOURCE_OPTIONS,
  resetSourceStatus,
  sourceStatusSnapshot,
  resetSourceCooldownsForTests
} from "./literature-sources.ts";
import { fetchClinicalTrialsArticles } from "./source-clinicaltrials.ts";
import { fetchCochraneArticles } from "./source-cochrane.ts";
import { fetchPreprintArticles } from "./source-preprints.ts";
import { buildTruthfulMethodsText } from "./deterministic-commentary.ts";

test("LS1. SEARCH_SOURCE_OPTIONS defines all 11 mandatory literature sources", () => {
  const ids = SEARCH_SOURCE_OPTIONS.map(o => o.id);
  assert.ok(ids.includes("pubmed"), "Should include pubmed");
  assert.ok(ids.includes("pmc"), "Should include pmc");
  assert.ok(ids.includes("europepmc"), "Should include europepmc");
  assert.ok(ids.includes("googlescholar"), "Should include googlescholar");
  assert.ok(ids.includes("semanticscholar"), "Should include semanticscholar");
  assert.ok(ids.includes("openalex"), "Should include openalex");
  assert.ok(ids.includes("crossref"), "Should include crossref");
  assert.ok(ids.includes("doaj"), "Should include doaj");
  assert.ok(ids.includes("clinicaltrials"), "Should include clinicaltrials");
  assert.ok(ids.includes("cochrane"), "Should include cochrane");
  assert.ok(ids.includes("preprints"), "Should include preprints");
  assert.equal(SEARCH_SOURCE_OPTIONS.length, 11);
});

test("LS2. decodeHtmlEntities decodes standard entities and strips JATS/XML tags", () => {
  const raw = "<b>Cervical</b> Cerclage &amp; Preterm Birth &lt;2024&gt; &#39;Study&#39; &quot;Analysis&quot;";
  const decoded = decodeHtmlEntities(raw);
  assert.equal(decoded, "Cervical Cerclage & Preterm Birth <2024> 'Study' \"Analysis\"");
});

test("LS3. sanitizeSearchQuery removes stopwords and symbols", () => {
  const q = "The role of and in cervical cerclage for the prevention of preterm birth!";
  const sanitized = sanitizeSearchQuery(q);
  assert.ok(!sanitized.includes("the"), "Stopword 'the' should be stripped");
  assert.ok(!sanitized.includes("of"), "Stopword 'of' should be stripped");
  assert.ok(!sanitized.includes("!"), "Punctuation should be stripped");
  assert.ok(sanitized.includes("cervical"), "Clinical term 'cervical' should be kept");
  assert.ok(sanitized.includes("cerclage"), "Clinical term 'cerclage' should be kept");
});

test("LS4. buildSearchQuery combines PICO elements into clean search string", () => {
  const pico = {
    population: "women with singleton pregnancy and short cervix",
    intervention: "cervical cerclage",
    comparator: "expectant management",
    outcome: "preterm birth before 34 weeks"
  };
  const term = buildSearchQuery(pico);
  assert.ok(term.includes("women"), term);
  assert.ok(term.includes("pregnancy"), term);
  assert.ok(term.includes("cerclage"), term);
  assert.ok(term.includes("preterm"), term);
});

test("LS5. deduplicateArticles collapses identical papers from different sources", () => {
  const articles: LiteratureArticle[] = [
    {
      pmid: "34520055",
      title: "FIGO good practice recommendations on cervical cerclage",
      journal: "Int J Gynaecol Obstet",
      year: "2021",
      authors: "Shennan A",
      doi: "10.1002/ijgo.13888",
      url: "https://pubmed.ncbi.nlm.nih.gov/34520055/",
      source: "pubmed"
    },
    {
      pmid: "cr:10.1002/ijgo.13888",
      title: "FIGO good practice recommendations on cervical cerclage",
      journal: "International Journal of Gynecology & Obstetrics",
      year: "2021",
      authors: "Shennan Andrew",
      doi: "10.1002/ijgo.13888",
      url: "https://doi.org/10.1002/ijgo.13888",
      source: "crossref"
    },
    {
      pmid: "oax:W4213433783",
      title: "FIGO good practice recommendations on cervical cerclage",
      journal: "International Journal of Gynecology and Obstetrics",
      year: "2021",
      authors: "A. Shennan",
      doi: "https://doi.org/10.1002/ijgo.13888",
      url: "https://doi.org/10.1002/ijgo.13888",
      source: "openalex"
    },
    {
      pmid: "s2:8230d8db2f5b642dc846b78722352b3c6eaa09e0",
      title: "FIGO good practice recommendations on cervical cerclage",
      journal: "Int J Gynaecol Obstet",
      year: "2021",
      authors: "Shennan A",
      doi: "10.1002/ijgo.13888",
      url: "https://doi.org/10.1002/ijgo.13888",
      source: "semanticscholar"
    },
    {
      pmid: "99999999",
      title: "A completely different clinical trial on progesterone",
      journal: "Lancet",
      year: "2022",
      authors: "Smith J",
      doi: "10.1016/s0140-6736(22)00001-1",
      url: "https://pubmed.ncbi.nlm.nih.gov/99999999/",
      source: "pubmed"
    }
  ];

  const deduped = deduplicateArticles(articles);
  assert.equal(deduped.length, 2, "Duplicate DOI papers across providers should collapse into 1");
  assert.equal(deduped[0].source, "pubmed", "First seen copy should be retained");
  assert.equal(deduped[1].title, "A completely different clinical trial on progesterone");
});

const RUN_LIVE = process.env.AIMED_LIVE_NETWORK === "1";
const liveTest = RUN_LIVE ? test : test.skip;

const isNetworkError = (err: unknown): boolean =>
  /\b429\b|http (4\d\d|5\d\d)|timed? ?out|aborted|throttl|enotfound|econnreset|fetch failed|eai_again/i.test(
    String(err instanceof Error ? err.message : err)
  );

liveTest("LS6. OpenAlex live search returns valid structured peer-reviewed articles", async (t) => {
  let articles: LiteratureArticle[];
  try {
    articles = await fetchOpenAlexArticles("cervical cerclage preterm birth", 3);
  } catch (err) {
    if (isNetworkError(err)) {
      t.skip(`OpenAlex unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    throw err;
  }
  assert.ok(Array.isArray(articles), "Must return an array");
  if (articles.length === 0) {
    t.skip("OpenAlex returned 0 hits for the standard probe query — verify source health");
    return;
  }
  const first = articles[0];
  assert.ok(first.title.length > 5, "Article must have a real title");
  assert.equal(first.source, "openalex");
  assert.ok(first.url.startsWith("http"), "Must have valid URL");
  assert.ok(first.studyType, "Must assign study design classification");
});

liveTest("LS7. CrossRef live search returns valid structured journal articles", async (t) => {
  let articles: LiteratureArticle[];
  try {
    articles = await fetchCrossrefArticles("cervical cerclage preterm birth", 3);
  } catch (err) {
    if (isNetworkError(err)) {
      t.skip(`CrossRef unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    throw err;
  }
  assert.ok(Array.isArray(articles), "Must return an array");
  if (articles.length === 0) {
    t.skip("CrossRef returned 0 hits for the standard probe query — verify source health");
    return;
  }
  const first = articles[0];
  assert.ok(first.title.length > 5, "Article must have a real title");
  assert.equal(first.source, "crossref");
  assert.ok(first.doi, "CrossRef hit must have a DOI");
  assert.ok(first.url.startsWith("https://doi.org/"), "Must have DOI url");
  assert.ok(first.studyType, "Must assign study design classification");
});

liveTest("LS8. Semantic Scholar live search returns valid academic papers", async (t) => {
  let articles: LiteratureArticle[];
  try {
    articles = await fetchSemanticScholarArticles("cervical cerclage preterm birth", 3);
  } catch (err) {
    if (isNetworkError(err)) {
      t.skip(`Semantic Scholar unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    throw err;
  }
  assert.ok(Array.isArray(articles), "Must return an array");
  if (articles.length === 0) {
    t.skip("Semantic Scholar returned 0 hits for the standard probe query — verify source health");
    return;
  }
  const first = articles[0];
  assert.ok(first.title.length > 5, "Article must have a real title");
  assert.equal(first.source, "semanticscholar");
  assert.ok(first.url.startsWith("http"), "Must have valid URL");
  assert.ok(first.studyType, "Must assign study design classification");
});

liveTest("LS9. PMC (Europe PMC) live search returns valid open access medical records", async (t) => {
  let articles: LiteratureArticle[];
  try {
    articles = await fetchPmcArticles("cervical cerclage preterm birth", 3);
  } catch (err) {
    if (isNetworkError(err)) {
      t.skip(`PMC unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    throw err;
  }
  assert.ok(Array.isArray(articles), "Must return an array");
  if (articles.length === 0) {
    t.skip("PMC returned 0 hits for the standard probe query — verify source health");
    return;
  }
  const first = articles[0];
  assert.ok(first.title.length > 5, "Article must have a real title");
  assert.equal(first.source, "pmc");
  assert.ok(first.url.startsWith("http"), "Must have valid URL");
  assert.ok(first.studyType, "Must assign study design classification");
});

liveTest("LS10. PubMed live search returns valid structured MEDLINE records", async (t) => {
  let articles: LiteratureArticle[];
  try {
    articles = await fetchPubMedArticles("cervical cerclage preterm birth", 3);
  } catch (err) {
    if (isNetworkError(err)) {
      t.skip(`PubMed unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    throw err;
  }
  assert.ok(Array.isArray(articles), "Must return an array");
  if (articles.length === 0) {
    t.skip("PubMed returned 0 hits for the standard probe query — verify source health");
    return;
  }
  const first = articles[0];
  assert.ok(first.title.length > 5, "Article must have a real title");
  assert.equal(first.source, "pubmed");
  assert.ok(/^\d+$/.test(first.pmid), "PubMed record must have numeric PMID");
  assert.ok(first.studyType, "Must assign study design classification");
});

liveTest("LS11. Multi-source search combines all active sources with error isolation", async (t) => {
  let merged: LiteratureArticle[];
  try {
    merged = await searchMultiSourceLiterature({
      query: "cervical cerclage preterm birth",
      maxResults: 6
    });
  } catch (err) {
    if (isNetworkError(err)) {
      t.skip(`Multi-source search unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    throw err;
  }

  assert.ok(Array.isArray(merged), "Must return an array");
  if (merged.length === 0) {
    t.skip("Multi-source search returned 0 hits — every source failed or network unavailable");
    return;
  }

  // At least one source contributed hits
  assert.ok(merged.length >= 1, `At least one source must contribute hits (got ${merged.length})`);
  const sourcesPresent = new Set(merged.map(a => a.source));
  assert.ok(sourcesPresent.size >= 1, "At least one source must be present");

  // Every record must be well-formed
  for (const art of merged) {
    assert.ok(art.title.trim().length > 0, "Title must not be empty");
    assert.ok(art.url.startsWith("http"), "URL must be http(s)");
    assert.ok(ALL_LITERATURE_SOURCES.includes(art.source), `Source must be valid (${art.source})`);
  }
});

test("LS11b. Multi-source search error isolation: simulated failing source does not break merged result", async () => {
  resetSourceCooldownsForTests();
  const originalFetch = globalThis.fetch;
  try {
    // Simulate doaj throwing a 500 error while ebi returns valid CANNED data
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("doaj.org")) {
        return new Response("Internal Server Error", { status: 500 });
      }
      const host = new URL(url).hostname;
      const key = Object.keys(CANNED).find(h => host.endsWith(h));
      const body = key ? (CANNED as Record<string, unknown>)[key] : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as FetchFn;

    const res = await searchMultiSourceLiterature({
      query: "dapagliflozin heart failure",
      maxResults: 10
    });
    assert.ok(Array.isArray(res), "Must return an array despite one source failure");
    assert.ok(res.length > 0, "Healthy sources must still populate results");
    // Verify results came from healthy sources
    assert.ok(!res.some(a => a.source === "doaj"), "Failing source must contribute 0 items");
  } finally {
    globalThis.fetch = originalFetch;
    resetSourceCooldownsForTests();
  }
});

// ---- Mandatory sources & no-repeat (offline, fetch mocked) ----

type FetchFn = typeof globalThis.fetch;

/** Routes each request to a canned JSON body by host, records the hosts that were called. */
function mockFetch(byHost: Record<string, unknown>): { calls: string[]; restore: () => void } {
  const original: FetchFn = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const host = new URL(url).hostname;
    calls.push(url);
    const key = Object.keys(byHost).find(h => host.endsWith(h));
    const body = key ? byHost[key] : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as FetchFn;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const SHARED_DOI = "10.1056/NEJMoa1911303";

const CANNED: Record<string, unknown> = {
  "eutils.ncbi.nlm.nih.gov": { esearchresult: { idlist: [] }, result: {} },
  "ebi.ac.uk": {
    resultList: {
      result: [
        { id: "31535829", source: "MED", pmid: "31535829", doi: SHARED_DOI, title: "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction", authorString: "McMurray JJV, Solomon SD", pubYear: "2019", journalTitle: "N Engl J Med", abstractText: "Randomized trial." },
        { id: "PPR1", source: "PPR", title: "A preprint on SGLT2 inhibitors in HFpEF outcomes", authorString: "Doe J", pubYear: "2024" }
      ]
    }
  },
  "doaj.org": {
    results: [
      { id: "abc123", bibjson: { title: "Dapagliflozin in patients with heart failure and reduced ejection fraction", year: "2019", journal: { title: "NEJM" }, identifier: [{ type: "doi", id: SHARED_DOI }], author: [{ name: "J McMurray" }] } },
      { id: "def456", bibjson: { title: "Open access cohort of empagliflozin in elderly heart failure", year: "2022", journal: { title: "ESC Heart Fail" }, identifier: [{ type: "eissn", id: "2055-5822" }], link: [{ type: "fulltext", url: "https://example.org/oa" }] } }
    ]
  },
  "serpapi.com": {
    organic_results: [
      { result_id: "gs1", title: "[PDF] Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction", link: "https://www.nejm.org/doi/full/10.1056/NEJMoa1911303", publication_info: { summary: "JJV McMurray, SD Solomon - New England Journal of Medicine, 2019 - Mass Medical Soc" } },
      { result_id: "gs2", title: "SGLT2 inhibitors and heart failure: a narrative review of mechanisms", link: "https://example.org/review", publication_info: { summary: "A Author - Cardiology Reviews, 2021 - example.org" }, snippet: "Review of mechanisms." }
    ]
  },
  "clinicaltrials.gov": {
    studies: [
      {
        protocolSection: {
          identificationModule: { nctId: "NCT03036124", briefTitle: "Dapagliflozin Effect on Cardiovascular Events" },
          statusModule: { overallStatus: "COMPLETED", startDateStruct: { date: "2017-02" } },
          descriptionModule: { briefSummary: "Study of dapagliflozin in patients with heart failure." }
        }
      }
    ]
  }
};

test("LS12. resolveMandatorySources always returns every source, whatever is requested", () => {
  assert.deepEqual(resolveMandatorySources(), ALL_LITERATURE_SOURCES);
  assert.equal(ALL_LITERATURE_SOURCES.length, SEARCH_SOURCE_OPTIONS.length);
  for (const id of ["pubmed", "googlescholar", "europepmc", "doaj"]) {
    assert.ok(ALL_LITERATURE_SOURCES.includes(id as LiteratureArticle["source"]), id);
  }
});

test("LS13. parseScholarSummary splits authors, venue and year", () => {
  const r = parseScholarSummary("JJV McMurray, SD Solomon - New England Journal of Medicine, 2019 - Mass Medical Soc");
  assert.equal(r.authors, "JJV McMurray, SD Solomon");
  assert.equal(r.journal, "New England Journal of Medicine");
  assert.equal(r.year, "2019");
});

test("LS14. Europe PMC, DOAJ and Google Scholar fetchers map records to canonical articles", async () => {
  process.env.SERPAPI_API_KEY = "test-key";
  const m = mockFetch(CANNED);
  try {
    const epmc = await fetchEuropePmcArticles("dapagliflozin heart failure", 5);
    assert.equal(epmc.length, 2);
    assert.equal(epmc[0].source, "europepmc");
    assert.equal(epmc[0].pmid, "31535829");
    assert.equal(epmc[0].doi, SHARED_DOI.toLowerCase());
    assert.ok(epmc[1].url.startsWith("https://europepmc.org/article/PPR/"));

    const doaj = await fetchDoajArticles("dapagliflozin heart failure", 5);
    assert.equal(doaj.length, 2);
    assert.equal(doaj[0].source, "doaj");
    assert.equal(doaj[0].url, `https://doi.org/${SHARED_DOI.toLowerCase()}`);
    assert.equal(doaj[1].url, "https://example.org/oa");

    const gs = await fetchGoogleScholarArticles("dapagliflozin heart failure", 5);
    assert.equal(gs.length, 2);
    assert.equal(gs[0].source, "googlescholar");
    assert.ok(!gs[0].title.startsWith("[PDF]"), "Scholar format tag must be stripped");
    assert.equal(gs[0].doi, SHARED_DOI.toLowerCase(), "DOI is recovered from the publisher link");
    assert.equal(gs[0].year, "2019");
  } finally {
    m.restore();
    delete process.env.SERPAPI_API_KEY;
  }
});

test("LS15. Google Scholar is skipped without SERPAPI_API_KEY (no request, no failure)", async () => {
  delete process.env.SERPAPI_API_KEY;
  delete process.env.SERPAPI_KEY;
  const m = mockFetch(CANNED);
  try {
    const gs = await fetchGoogleScholarArticles("dapagliflozin heart failure", 5);
    assert.deepEqual(gs, []);
    assert.ok(!m.calls.some(u => u.includes("serpapi.com")));
  } finally {
    m.restore();
  }
});

test("LS16. Multi-source search queries every source even when a subset is requested, and never repeats a paper", async () => {
  resetSourceCooldownsForTests();
  process.env.SERPAPI_API_KEY = "test-key";
  const m = mockFetch(CANNED);
  try {
    const merged = await searchMultiSourceLiterature({
      sources: ["pubmed"],
      query: "dapagliflozin heart failure",
      maxResults: 20
    });
    const hosts = new Set(m.calls.map(u => new URL(u).hostname));
    for (const h of ["eutils.ncbi.nlm.nih.gov", "www.ebi.ac.uk", "doaj.org", "serpapi.com", "api.openalex.org", "api.crossref.org", "api.semanticscholar.org", "clinicaltrials.gov"]) {
      assert.ok(hosts.has(h), `mandatory source host ${h} must be queried`);
    }
    // The DAPA-HF trial comes back from Europe PMC, PMC, DOAJ and Google Scholar: listed once.
    const dapa = merged.filter(a => /dapagliflozin in patients with heart failure/i.test(a.title));
    assert.equal(dapa.length, 1, "the same paper from several sources must appear once");
    const keys = merged.flatMap(a => articleIdentityKeys(a));
    assert.equal(new Set(keys).size, keys.length, "no identity key may repeat");
  } finally {
    m.restore();
    delete process.env.SERPAPI_API_KEY;
  }
});

test("LS17. excludeKeys carries across searches so a paper shown once is never shown again", async () => {
  resetSourceCooldownsForTests();
  process.env.SERPAPI_API_KEY = "test-key";
  const m = mockFetch(CANNED);
  try {
    const used = new Set<string>();
    const first = await searchMultiSourceLiterature({ query: "dapagliflozin heart failure", maxResults: 20, excludeKeys: used });
    const second = await searchMultiSourceLiterature({ query: "dapagliflozin heart failure", maxResults: 20, excludeKeys: used });
    assert.ok(first.length > 0);
    assert.equal(second.length, 0, "identical second search must return no repeated papers");
  } finally {
    m.restore();
    delete process.env.SERPAPI_API_KEY;
  }
});

test("LS18. articleIdentityKeys matches a doi:-prefixed id with the same DOI on another record", () => {
  const a = articleIdentityKeys({ pmid: `doi:${SHARED_DOI}`, title: "x" });
  const b = articleIdentityKeys({ pmid: "31535829", doi: `https://doi.org/${SHARED_DOI}`, title: "y" });
  assert.ok(a.some(k => b.includes(k)));
});

test("LS19. ClinicalTrials.gov fetcher parses NCT studies with trial registration pubType", async () => {
  const m = mockFetch(CANNED);
  try {
    const trials = await fetchClinicalTrialsArticles("dapagliflozin heart failure", 5);
    assert.ok(trials.length > 0);
    const t = trials[0];
    assert.equal(t.source, "clinicaltrials");
    assert.equal(t.pmid, "nct:nct03036124");
    assert.equal(t.pubType, "Trial Registration");
    assert.equal(t.studyType, "Clinical Trial (Registered)");
    assert.ok(t.url.includes("clinicaltrials.gov/study/NCT03036124"));
  } finally {
    m.restore();
  }
});

test("LS20. Cochrane and Preprints fetchers parse Europe PMC slices correctly", async () => {
  const m = mockFetch(CANNED);
  try {
    const cochrane = await fetchCochraneArticles("dapagliflozin heart failure", 5);
    assert.ok(Array.isArray(cochrane));

    const preprints = await fetchPreprintArticles("dapagliflozin heart failure", 5);
    assert.ok(preprints.length > 0);
    const p = preprints[0];
    assert.equal(p.source, "preprints");
    assert.equal(p.pubType, "Preprint");
    assert.equal(p.studyType, "Preprint");
  } finally {
    m.restore();
  }
});

test("LS21. sourceStatusSnapshot accurately tracks per-source execution details", async () => {
  resetSourceStatus();
  resetSourceCooldownsForTests();
  const initial = sourceStatusSnapshot();
  assert.equal(Object.keys(initial).length, 11);
  assert.equal(initial.pubmed.attempted, false);
  assert.equal(initial.pubmed.ok, false);

  const m = mockFetch(CANNED);
  try {
    await searchMultiSourceLiterature({ query: "dapagliflozin heart failure", maxResults: 10 });
    const snap = sourceStatusSnapshot();
    assert.equal(snap.clinicaltrials.attempted, true);
    assert.equal(snap.clinicaltrials.ok, true);
    assert.ok(snap.clinicaltrials.hits >= 0);
  } finally {
    m.restore();
  }
});

test("LS22. sourceStatus records concrete error and buildTruthfulMethodsText attributes causes truthfully", async () => {
  resetSourceStatus();
  resetSourceCooldownsForTests();

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("europepmc") || url.includes("ebi.ac.uk")) {
        throw new Error("The operation was aborted due to timeout");
      }
      if (url.includes("doaj.org")) {
        return new Response("Service Unavailable", { status: 503 });
      }
      const host = new URL(url).hostname;
      const key = Object.keys(CANNED).find(h => host.endsWith(h));
      const body = key ? (CANNED as Record<string, unknown>)[key] : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as FetchFn;

    await searchMultiSourceLiterature({ query: "dapagliflozin heart failure", maxResults: 10 });
    const snap = sourceStatusSnapshot();

    // (a) Error is populated with concrete message
    assert.ok(snap.europepmc.error, "Europe PMC must record error");
    assert.ok(snap.europepmc.error.includes("timeout"), `Expected error to contain timeout, got '${snap.europepmc.error}'`);
    assert.ok(snap.doaj.error, "DOAJ must record error");
    assert.ok(snap.doaj.error.includes("503"), `Expected error to contain 503, got '${snap.doaj.error}'`);

    // (b) buildTruthfulMethodsText output contains concrete cause
    const methodsText = buildTruthfulMethodsText("cardiovascular death");
    assert.ok(methodsText.includes("timeout"), "Methods text must contain 'timeout'");
    assert.ok(!methodsText.includes("Europe PMC unavailable due to rate limits"), "Methods text must NOT say 'due to rate limits' for timeout");
  } finally {
    globalThis.fetch = originalFetch;
    resetSourceStatus();
    resetSourceCooldownsForTests();
  }
});

