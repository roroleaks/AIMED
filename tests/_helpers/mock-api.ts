import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const FIXTURE_DIR = path.resolve("tests/fixtures/literature");

interface FixtureData {
  specialty: string;
  words: Array<{ word: string; role: string }>;
  screenResponse: {
    phrases: {
      established: { phrase: string; basis: string };
      conflicting: { phrase: string; basis: string };
      gap: { phrase: string; basis: string };
    };
    corpusStats: unknown;
    sources?: unknown;
  };
  exploreResponse: Record<string, unknown> | null;
}

function loadFixture(name: string): FixtureData | null {
  const p = path.join(FIXTURE_DIR, `${name}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as FixtureData;
}

function findPresetFixture(specialty: string, words: Array<{ word: string }>): FixtureData | null {
  if (!fs.existsSync(FIXTURE_DIR)) return null;
  const files = fs.readdirSync(FIXTURE_DIR).filter((f) => f.startsWith(`PRESET-${specialty}-`) && f.endsWith(".json"));
  const tokens = words.map((w) => w.word.toLowerCase().trim()).filter(Boolean);
  let best: { score: number; data: FixtureData } | null = null;
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, f), "utf8")) as FixtureData;
    const fixText = (data.words || []).map((w) => w.word.toLowerCase()).join(" ");
    const score = tokens.reduce((acc, t) => acc + (fixText.includes(t) ? 1 : 0), 0);
    if (!best || score > best.score) {
      best = { score, data };
    }
  }
  return best?.data ?? null;
}

export async function mockEngineWithFixtures(page: Page, forcedScenario?: string) {
  await page.route("**/api/engine", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") {
      await route.continue();
      return;
    }

    const body = req.postDataJSON() as {
      stage?: string;
      specialty?: string;
      words?: Array<{ word: string; role: string }>;
      choice?: { category: string; phrase: string };
    };

    const words = body.words || [];
    const wordStr = words.map((w) => w.word.toLowerCase()).join(" ");

    let fixture: FixtureData | null = null;
    if (forcedScenario) {
      fixture = loadFixture(forcedScenario);
    } else if (wordStr.includes("homeopathy")) {
      fixture = loadFixture("ADV-HOMEO");
    } else if (body.specialty) {
      fixture = findPresetFixture(body.specialty, words) || loadFixture("ONC-1");
    } else {
      fixture = loadFixture("ONC-1");
    }

    if (body.stage === "screen" && fixture?.screenResponse) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "x-aimed-source": "fixture" },
        body: JSON.stringify(fixture.screenResponse),
      });
      return;
    }

    if (body.stage === "explore" && fixture?.exploreResponse) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "x-aimed-source": "fixture" },
        body: JSON.stringify(fixture.exploreResponse),
      });
      return;
    }

    await route.continue();
  });
}

export async function seedWorkflowToSummary(page: Page, scenarioId = "ONC-1") {
  const fix = loadFixture(scenarioId);
  if (!fix) throw new Error(`Missing fixture ${scenarioId}`);
  const screen = fix.screenResponse;
  const explore = fix.exploreResponse;
  const choice = {
    category: "established" as const,
    phrase: screen.phrases.established.phrase,
  };

  await page.goto("/");
  await page.evaluate(
    ({ fix, screen, explore, choice }) => {
      sessionStorage.setItem("aimed_specialty", JSON.stringify(fix.specialty));
      sessionStorage.setItem("cq_pico_words", JSON.stringify(fix.words));
      sessionStorage.setItem("cq_input_text", JSON.stringify(fix.words.map((w) => w.word).join(", ")));
      sessionStorage.setItem(
        "cq_screen",
        JSON.stringify({
          inputWords: fix.words.map((w) => w.word),
          source: "deterministic",
          phrases: screen.phrases,
          corpusStats: screen.corpusStats,
          specialty: fix.specialty,
          sources: screen.sources,
        })
      );
      sessionStorage.setItem("cq_choice", JSON.stringify(choice));
      sessionStorage.setItem(
        "cq_explore",
        JSON.stringify({
          ...explore,
          phrase: choice.phrase,
          category: choice.category,
          specialty: fix.specialty,
        })
      );
      sessionStorage.setItem(
        "cq_excluded",
        JSON.stringify({
          phrase: choice.phrase,
          category: choice.category,
          userExcluded: [],
          seen: [],
        })
      );
    },
    { fix, screen, explore, choice }
  );
}
