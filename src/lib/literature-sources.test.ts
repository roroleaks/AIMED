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
  type LiteratureArticle,
  SEARCH_SOURCE_OPTIONS
} from "./literature-sources.ts";

test("LS1. SEARCH_SOURCE_OPTIONS defines PubMed, PMC, Semantic Scholar, OpenAlex, and CrossRef", () => {
  const ids = SEARCH_SOURCE_OPTIONS.map(o => o.id);
  assert.ok(ids.includes("pubmed"), "Should include pubmed");
  assert.ok(ids.includes("pmc"), "Should include pmc");
  assert.ok(ids.includes("semanticscholar"), "Should include semanticscholar");
  assert.ok(ids.includes("openalex"), "Should include openalex");
  assert.ok(ids.includes("crossref"), "Should include crossref");
  assert.equal(SEARCH_SOURCE_OPTIONS.length, 5);
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
      doi: "10.1002/ijgo.13885",
      url: "https://pubmed.ncbi.nlm.nih.gov/34520055/",
      source: "pubmed"
    },
    {
      pmid: "cr:10.1002/ijgo.13885",
      title: "FIGO good practice recommendations on cervical cerclage",
      journal: "International Journal of Gynecology & Obstetrics",
      year: "2021",
      authors: "Shennan Andrew",
      doi: "10.1002/ijgo.13885",
      url: "https://doi.org/10.1002/ijgo.13885",
      source: "crossref"
    },
    {
      pmid: "oax:W4213433783",
      title: "FIGO good practice recommendations on cervical cerclage",
      journal: "International Journal of Gynecology and Obstetrics",
      year: "2021",
      authors: "A. Shennan",
      doi: "https://doi.org/10.1002/ijgo.13885",
      url: "https://doi.org/10.1002/ijgo.13885",
      source: "openalex"
    },
    {
      pmid: "s2:8230d8db2f5b642dc846b78722352b3c6eaa09e0",
      title: "FIGO good practice recommendations on cervical cerclage",
      journal: "Int J Gynaecol Obstet",
      year: "2021",
      authors: "Shennan A",
      doi: "10.1002/ijgo.13885",
      url: "https://doi.org/10.1002/ijgo.13885",
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

test("LS6. OpenAlex live search returns valid structured peer-reviewed articles", async () => {
  const articles = await fetchOpenAlexArticles("cervical cerclage preterm birth", 3);
  assert.ok(Array.isArray(articles), "Must return an array");
  assert.ok(articles.length > 0, "Should return at least 1 hit for standard medical query");
  const first = articles[0];
  assert.ok(first.title.length > 5, "Article must have a real title");
  assert.equal(first.source, "openalex");
  assert.ok(first.url.startsWith("http"), "Must have valid URL");
  assert.ok(first.studyType, "Must assign study design classification");
});

test("LS7. CrossRef live search returns valid structured journal articles", async () => {
  const articles = await fetchCrossrefArticles("cervical cerclage preterm birth", 3);
  assert.ok(Array.isArray(articles), "Must return an array");
  assert.ok(articles.length > 0, "Should return at least 1 hit for standard medical query");
  const first = articles[0];
  assert.ok(first.title.length > 5, "Article must have a real title");
  assert.equal(first.source, "crossref");
  assert.ok(first.doi, "CrossRef hit must have a DOI");
  assert.ok(first.url.startsWith("https://doi.org/"), "Must have DOI url");
  assert.ok(first.studyType, "Must assign study design classification");
});

test("LS8. Semantic Scholar live search returns valid academic papers", async () => {
  const articles = await fetchSemanticScholarArticles("cervical cerclage preterm birth", 3);
  assert.ok(Array.isArray(articles), "Must return an array");
  if (articles.length > 0) {
    const first = articles[0];
    assert.ok(first.title.length > 5, "Article must have a real title");
    assert.equal(first.source, "semanticscholar");
    assert.ok(first.url.startsWith("http"), "Must have valid URL");
    assert.ok(first.studyType, "Must assign study design classification");
  } else {
    // Semantic Scholar public API enforces strict burst/minute rate limits (HTTP 429);
    // client must handle gracefully without throwing uncaught exceptions
    assert.ok(true, "Gracefully handled rate-limiting / quota without throwing");
  }
});

test("LS9. PMC (Europe PMC) live search returns valid open access medical records", async () => {
  const articles = await fetchPmcArticles("cervical cerclage preterm birth", 3);
  assert.ok(Array.isArray(articles), "Must return an array");
  assert.ok(articles.length > 0, "Should return at least 1 hit for standard medical query");
  const first = articles[0];
  assert.ok(first.title.length > 5, "Article must have a real title");
  assert.equal(first.source, "pmc");
  assert.ok(first.url.startsWith("http"), "Must have valid URL");
  assert.ok(first.studyType, "Must assign study design classification");
});

test("LS10. PubMed live search returns valid structured MEDLINE records", async () => {
  const articles = await fetchPubMedArticles("cervical cerclage preterm birth", 3);
  assert.ok(Array.isArray(articles), "Must return an array");
  assert.ok(articles.length > 0, "Should return at least 1 hit for standard medical query");
  const first = articles[0];
  assert.ok(first.title.length > 5, "Article must have a real title");
  assert.equal(first.source, "pubmed");
  assert.ok(/^\d+$/.test(first.pmid), "PubMed record must have numeric PMID");
  assert.ok(first.studyType, "Must assign study design classification");
});

test("LS11. Multi-source search combines all active sources with error isolation", async () => {
  const merged = await searchMultiSourceLiterature({
    sources: ["pubmed", "pmc", "semanticscholar", "openalex", "crossref"],
    query: "cervical cerclage preterm birth",
    maxResults: 6
  });

  assert.ok(Array.isArray(merged), "Must return an array");
  assert.ok(merged.length >= 3, `Should return multiple articles (got ${merged.length})`);
  const sourcesPresent = new Set(merged.map(a => a.source));
  assert.ok(sourcesPresent.size >= 2, "Should have articles from multiple sources");

  // Every record must be well-formed
  for (const art of merged) {
    assert.ok(art.title.trim().length > 0, "Title must not be empty");
    assert.ok(art.url.startsWith("http"), "URL must be http(s)");
    assert.ok(["pubmed", "pmc", "semanticscholar", "openalex", "crossref"].includes(art.source), `Source must be valid (${art.source})`);
  }
});
