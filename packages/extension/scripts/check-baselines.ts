import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type BaselineCase = {
  name: string;
  source: string;
  type: string;
  url: string;
  actual: string;
  baseline: string;
};

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(packageRoot, "../..");
const defaultCasesPath = path.join(repoRoot, "checks", "baseline-cases.json");
const casesPath = valueArg("--cases") ?? defaultCasesPath;
const cases = JSON.parse(await readFile(casesPath, "utf8")) as BaselineCase[];

let failures = 0;
for (const testCase of cases) {
  const result = await runCase(testCase);
  if (result.ok) {
    console.log(`ok ${testCase.source}/${testCase.type}/${testCase.name}`);
    continue;
  }

  failures += 1;
  console.error(`not ok ${testCase.source}/${testCase.type}/${testCase.name}`);
  console.error(result.message);
}

if (failures > 0) {
  process.exitCode = 1;
}

async function runCase(testCase: BaselineCase): Promise<{ ok: true } | { ok: false; message: string }> {
  const actualPath = path.resolve(repoRoot, testCase.actual);
  const baselinePath = path.resolve(repoRoot, testCase.baseline);

  let actual: string;
  try {
    actual = normalizeMarkdown(await readFile(actualPath, "utf8"));
  } catch {
    return {
      ok: false,
      message: `Missing DOM output ${path.relative(repoRoot, actualPath)} for ${testCase.url}. Generate it from the current DOM extractor first.`
    };
  }

  let expected: string;
  try {
    expected = normalizeMarkdown(await readFile(baselinePath, "utf8"));
  } catch {
    return {
      ok: false,
      message: `Missing baseline ${path.relative(repoRoot, baselinePath)}. Add the reviewed expected output before checking.`
    };
  }

  if (actual === expected) {
    return { ok: true };
  }

  return {
    ok: false,
    message: formatDiff(expected, actual)
  };
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDiff(expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const max = Math.max(expectedLines.length, actualLines.length);

  for (let index = 0; index < max; index += 1) {
    if (expectedLines[index] === actualLines[index]) continue;
    const line = index + 1;
    return [
      `Baseline mismatch at line ${line}.`,
      `expected: ${expectedLines[index] ?? "<missing>"}`,
      `actual:   ${actualLines[index] ?? "<missing>"}`
    ].join("\n");
  }

  return "Baseline mismatch.";
}

function valueArg(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}
