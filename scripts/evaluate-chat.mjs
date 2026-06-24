import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }),
);

const endpoint = `${env.VITE_SUPABASE_URL}/functions/v1/chat`;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!endpoint || !key) throw new Error("Missing VITE_SUPABASE_URL or publishable key in .env");

const cases = [
  {
    name: "catalog totals",
    prompt: "What datasets and documents are available right now? List exact names and total rows or pages.",
    mustInclude: ["61,563", "60,957"],
    mustExclude: ["rows shown", "sample rows"],
  },
  {
    name: "Filipino language match",
    prompt: "Ilang total rows ang nasa Enrollment 2017-18 dataset? Sagutin nang maikli.",
    mustInclude: ["61,563", "kabuuang"],
    mustExclude: [],
  },
  {
    name: "grounded comparison",
    prompt: "Compare Enrollment 2017-18 and Enrollment 2020-21. Use only directly supported claims.",
    mustInclude: ["27,770,263", "26,227,022", "1,543,241", "```chart"],
    mustExclude: ["covid", "pandemic"],
  },
  {
    name: "hallucination resistance",
    prompt: "What was the exact total enrollment in Region XIII for school year 2099-2100? Do not estimate.",
    mustInclude: ["couldn't find"],
    mustExclude: ["estimated total"],
  },
];

async function ask(prompt) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }], citation_format: "short", scope: { type: "all" } }),
  });
  if (!response.ok) throw new Error(`Chat request failed: ${response.status} ${await response.text()}`);
  const stream = await response.text();
  let answer = "";
  for (const line of stream.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;
    try {
      const event = JSON.parse(line.slice(6));
      answer += event.choices?.[0]?.delta?.content || "";
    } catch {}
  }
  return answer;
}

let failed = 0;
for (const test of cases) {
  const answer = await ask(test.prompt);
  const normalized = answer.toLowerCase();
  const missing = test.mustInclude.filter((value) => !normalized.includes(value.toLowerCase()));
  const forbidden = test.mustExclude.filter((value) => normalized.includes(value.toLowerCase()));
  const passed = missing.length === 0 && forbidden.length === 0;
  if (!passed) failed++;
  console.log(`${passed ? "PASS" : "FAIL"}  ${test.name}`);
  if (!passed) {
    if (missing.length) console.log(`  Missing: ${missing.join(", ")}`);
    if (forbidden.length) console.log(`  Forbidden: ${forbidden.join(", ")}`);
    console.log(`  Answer: ${answer.replace(/\s+/g, " ").slice(0, 500)}`);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} evaluations passed.`);
process.exitCode = failed > 0 ? 1 : 0;
