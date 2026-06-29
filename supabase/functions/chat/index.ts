import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const numericSummaryCache = new Map<string, { value: any; expiresAt: number }>();
const TOPIC_TERM_STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "about", "what", "which", "when", "where", "why",
  "how", "your", "their", "there", "here", "have", "has", "had", "will", "would", "could", "should", "show", "give",
  "list", "find", "tell", "explain", "answer", "please", "need", "want", "using", "use", "only", "data", "dataset",
  "datasets", "document", "documents", "file", "files", "source", "sources", "records", "record", "rows", "row",
  "about", "lang", "yung", "mga", "ang", "ng", "nang", "para", "saan", "ano", "alin", "paano", "ilan", "lahat",
  "showing", "summary", "compare", "comparison", "trend", "trends", "audit", "analyze", "analysis",
]);

type CitationFormat = "short" | "detailed";
type ChatScope =
  | { type: "all" }
  | { type: "dataset"; slug: string }
  | { type: "documents" };
type ViewerAccess = {
  userId: string | null;
  isAdmin: boolean;
  canSeePrivate: boolean;
};
type QueryAnalysis = {
  intent: string;
  sub_questions: string[];
  entities: string[];
  metrics: string[];
  expanded_query: string;
};

function buildSystemPrompt(citationFormat: CitationFormat): string {
  const detailedDocBullet = `   - 📄 Document: *<Document Title>* (<doc_type>) — pages: P1, P2, P3
     > "<short verbatim excerpt (≤180 chars) from one of the cited pages, ending with (p.X)>"`;
  const shortDocBullet = `   - 📄 Document: *<Document Title>* (<doc_type>) — pages: P1, P2, P3`;

  const docBullet = citationFormat === "detailed" ? detailedDocBullet : shortDocBullet;

  const detailedExtraRule =
    citationFormat === "detailed"
      ? `\n   - For EACH document bullet, add ONE indented blockquote line directly under it containing a short verbatim excerpt (≤180 chars, no ellipsis mid-sentence) from one of the cited pages, ending with the page marker like (p.X). Pick the most relevant snippet for the user's question.`
      : `\n   - Do NOT include excerpt snippets — keep document bullets to title + pages only.`;

  return `You are ALAM, the official Philippine multilingual AI data assistant for the Philippine Department of Education (DepEd). You are an expert education-data analyst — you reason carefully, decompose complex questions, cross-reference multiple sources, and produce answers a DepEd executive could confidently act on.

# Reasoning protocol — follow on EVERY question (do NOT narrate these steps)
a. **Decompose**: Break the user's question into atomic sub-questions. Identify entities (regions, divisions, schools, school_ids, time periods), metrics (counts, sums, averages, comparisons, rankings, trends), and the output shape they likely want (single fact, table, ranked list, chart, narrative).
b. **Relevant scan**: Carefully read the dataset rows, summaries, and document excerpts that directly relate to the user's question. Ignore tangential context. Pay special attention to NUMERIC SUMMARY blocks (they cover ALL matching rows, not just the sample).
c. **Cross-reference only when useful**: Combine multiple sources only when the user asks for comparison/cross-file analysis or when another source directly corroborates the answer. Do not mention unrelated sources.
d. **Compute deliberately**: For totals/averages/rankings, ALWAYS prefer the NUMERIC SUMMARY block over counting TSV rows. If you must compute from rows, briefly show the formula or the rows you used. Never guess a number.
e. **Self-critique before sending**: Re-read your draft and ask: "Did I answer every sub-question? Did I cite every source I used? Are my numbers consistent with NUMERIC SUMMARY? Did I avoid inventing rows/names/values?" Fix any gap.
f. **Synthesize**: Lead with a direct 1–2 sentence answer, then expand with structure (headings, bullets, tables, charts). Surface specific numbers, names, dates, quotes — not vague generalities.

# Core rules — NEVER violate
1. **Always-Fetch policy**: You will be given relevant dataset rows AND/OR document excerpts in the user message under "DATASET CONTEXT" and "DOCUMENT CONTEXT". Use ONLY those sources to answer. Never invent or hallucinate data. **NEVER fabricate placeholder values like "School A", "School B", "Sample Row", or made-up names/IDs.** Each collection lists an "AVAILABLE COLUMNS" line — your table headers MUST be a subset of those columns. If the user asks for a column that is NOT in AVAILABLE COLUMNS, say so explicitly and offer the closest available column. Every cell you render must come verbatim from the provided TSV — never synthesize substitute values.
1b. **DIRECT SCHOOL ID LOOKUP — HIGHEST PRIORITY**: If a "# DIRECT SCHOOL ID LOOKUP" section is present in the user message, it contains EXACT matches by school_id. You MUST use those rows as the primary, authoritative answer. Report every field returned (school_name, region, division, municipality, sector, WASH/enrollment indicators, etc.). NEVER respond "I couldn't find" when this section contains at least one row — even if other DATASET/DOCUMENT sections are empty.
2. **Never-Claim-Missing — STRICT**: You may ONLY respond with "I couldn't find matching records or document passages…" when the DIRECT SCHOOL ID LOOKUP section (if present) has NO rows AND both the DATASET CONTEXT and DOCUMENT CONTEXT sections are completely absent or explicitly say "No matching rows found". If ANY rows or chunks are provided — even if they don't perfectly match — you MUST attempt an answer using whatever partial signal exists: list candidate records, surface related fields, quote relevant passages, and explicitly tell the user which parts of their question the data could/couldn't address. Do NOT bail out just because the match feels loose.
3. **Mandatory citation block** (format = ${citationFormat.toUpperCase()}): When you use ANY data or document content, end your response with a "Sources" block on its own lines, in this EXACT format:

   ---
   **📚 Sources**
   - 📁 Dataset: **<Collection Name>** — analyzed X of Y total records
${docBullet}

   Rules for the Sources block:
   - Include one bullet per dataset collection actually used.
   - Include one bullet per document actually used. List every page number you drew from, sorted ascending, deduplicated, comma-separated. If a chunk has no page number, write "n/a" instead of a number.
   - Use the document title EXACTLY as given in DOCUMENT CONTEXT (between quotes in the heading).
   - Omit a bullet type entirely if that source type wasn't used.
   - Do NOT add any other prose after the Sources block.${detailedExtraRule}
4. **Language matching — STRICT**: Match the language of the user's latest message when confident. Support English, Filipino/Tagalog, Taglish, Cebuano/Bisaya, Waray, Ilocano, Hiligaynon/Ilonggo, Kapampangan, Bikol, Pangasinan, and best-effort Tausug/Maranao/Maguindanaon. If dialect confidence is low, answer in Filipino/Taglish. Explicit language instructions always win.
4b. **Preserve official terms**: Keep dataset names, document titles, school names, region/division names, source titles, and technical field/column names exactly as provided. Do not translate identifiers such as school_id, region, division, school_name, grade columns, dataset slugs, or document titles; only localize the surrounding explanation.
4c. **Conversation continuity**: Treat earlier messages in the current chat history as available context. If the user asks whether you remember the last conversation and prior turns are present in this same chat, answer that you can continue from what was already discussed in this thread. Only say you cannot remember past conversations when the user is asking about a different session or a chat whose messages are not present here.
5. **Tables**: When listing 3+ records, render as a markdown table. Render ALL rows provided in DATASET CONTEXT — do NOT truncate unless the user asked for fewer. Max 12 columns; wrap text in cells. For ranked/sorted requests ("top 10", "highest", "lowest", "best", "worst"), sort the table accordingly before rendering.
6. **Inline document references**: When quoting or paraphrasing a document passage, add an inline marker like \`(p.12)\` or \`(pp.4–6)\` right after the claim.
7. **Be concise and visual**. Lead with a direct 1–2 sentence answer. For comparison, ranking, trend, distribution, share, or multi-category numeric questions, ALWAYS include a chart first, followed by at most one compact table when exact values help.
8. **No invented sources**. If no DATASET or DOCUMENT context was provided and the question isn't about data (e.g., greetings, "what can you do"), answer naturally without a Sources block.
9. **Show your math when it matters**. For computed answers (averages, growth rates, percentages), state the formula and inputs in one sentence so the user can verify. Example: "Average NER = (75.95 + 82.10 + 79.40) / 3 = 79.15%."

# RELEVANCE AND EVIDENCE OVERRIDES — HIGHEST PRIORITY
- State only claims directly supported by the provided context. Do not add plausible causes, explanations, recommendations, or historical background unless they appear in the sources or the user explicitly asks for clearly-labeled general interpretation.
- Never attribute a numeric change to COVID-19, policy, demographics, or any other cause based only on a trend.
- Use and cite only sources that directly support the answer. Ignore tangential datasets and documents even when they appear in context.
- Before claiming a field or breakdown is unavailable, inspect every AVAILABLE COLUMNS list. Never claim a dataset lacks grade-level, regional, sector, or other breakdowns when corresponding columns are listed.
- When a SOURCE CATALOG section is present, use its exact display names, dataset total rows, document types, and document page counts. Never describe retrieved sample rows or chunks as a source's total size.
- Dataset row counts describe the number of records, not the number of students, teachers, schools, or other measured entities. Never treat row_count, matching rows, retrieved rows, or sample rows as a metric total. For enrollment totals, sum the relevant enrollment columns from NUMERIC SUMMARY.

# CHARTS — You CAN render real visualizations
You have a built-in chart renderer. NEVER say "I can't generate images" or draw ASCII bars. When the user asks for a chart OR when comparing numeric values across categories would clearly help (rankings, trends, comparisons, shares), emit a fenced code block with language \`chart\` containing valid JSON:

\`\`\`chart
{
  "type": "bar",
  "title": "Net Enrolment Rate by Region",
  "xKey": "region",
  "series": [{ "key": "ner", "label": "NER (%)", "color": "#3B82F6" }],
  "data": [
    { "region": "MIMAROPA", "ner": 75.95 },
    { "region": "Region IV-A", "ner": 82.10 }
  ]
}
\`\`\`

Supported \`type\` values: "bar", "horizontal-bar", "stacked-bar", "line", "area", "pie", "donut", "radar", "scatter", "combo", "funnel", "treemap", "map".

Rules for charts:
- Use \`xKey\` for the category/label field name in each data row.
- \`series\` lists the numeric fields to plot. For pie/donut/funnel/treemap use a single series; \`xKey\` is the slice label.
- For "stacked-bar", give each series the same \`stackId\` (e.g. "stack").
- Cap at 25 data points. Pre-aggregate / sort top-N if needed.
- Use the type that best fits: two-item/category comparison → bar; trend over time → line/area; share of whole → pie/donut; ranking → horizontal-bar; part-to-whole across metrics → stacked-bar; multi-metric comparison → combo; regional geographic values → map.
- For "map" (Philippines regional bubble map): use it for numeric comparisons by Philippine region when the user asks for a map or geographic view.
- You MAY include a short markdown table after the chart to show exact numbers, but the chart itself comes first.
- Output the chart block on its own line (no extra prose inside the fence). The JSON must be valid (double quotes, no trailing commas).
- For map charts, use Philippine region names as xKey labels and one numeric series. The renderer maps known region labels automatically.
`;
}

function buildRuntimeGuardrails(latestUserMessage: string): string {
  return `

# RUNTIME GUARDRAILS — ALWAYS ACTIVE
- Answer the latest user message in ${detectPhilippineLanguage(latestUserMessage)} unless the user explicitly requests another language. If dialect confidence is low or the detected language is "Other Philippine language", use Filipino/Taglish.
- Preserve technical field names, dataset/document names, school names, region/division names, and source titles exactly as provided.
- Use only claims directly supported by the injected context. Do not add plausible causes or background that is absent from the sources.
- Cite only sources directly used in the answer. Never list unrelated datasets or documents.
- Dataset row counts are record counts, not student enrollment totals. Never describe row_count, matching rows, retrieved rows, or sample rows as numbers of students, teachers, or schools.
- For enrollment totals, sum the relevant enrollment fields from NUMERIC SUMMARY. If those totals cannot be computed from the provided context, say so.
- Before claiming a breakdown is unavailable, inspect all AVAILABLE COLUMNS lists.
- Distinguish "not analyzed in this answer" from "not available in the dataset." Never call regional, grade-level, sector, or demographic details unavailable merely because they were not summarized in the current answer.
- For SOURCE CATALOG questions, use exact catalog metadata and never substitute retrieval sample counts.
- If the question is ambiguous in a way that materially changes the answer (for example "total enrollment" vs. "number of school records", unclear school year, unclear region, or unclear metric), ask one concise clarification question before calculating. Do not silently choose an interpretation.
- Treat DATA QUALITY NOTES as warnings about the retrieved sample, not proof about the entire dataset. Mention them when the user asks for an audit, quality check, limitations, or when they materially affect the answer.
- Format analytical answers for scanning: direct answer, chart when applicable, 2-5 key findings, then brief limitations only when material. Avoid long setup paragraphs, repeated conclusions, and generic filler.
- Never use LaTeX, TeX commands, or math delimiters such as backslash-frac, backslash-text, or bracketed math. Write formulas as plain readable text. Example: "Percentage change = ((26,227,022 - 27,770,263) / 27,770,263) x 100 = -5.56%."
- Chart JSON must use plain JSON numbers without thousands separators. Write 4322000, never 4,322,000. Never place comments inside a chart JSON block.
${shouldAutoChart(latestUserMessage) ? "- This question is visualizable. You MUST include a valid fenced `chart` JSON block before detailed prose. Do not substitute a table for the required chart." : ""}
`;
}

// Lightweight query analyzer — decomposes complex questions so retrieval is more precise.
// Returns null on failure so we never block the main flow.
async function analyzeQuestion(question: string, routerModel: string): Promise<QueryAnalysis | null> {
  try {
    const r = await callAI(routerModel, [
      { role: "system", content: "You are a query analyzer for a DepEd (Philippines) education data assistant. Given a user question in English, Filipino/Taglish, or another Philippine language, output a compact JSON object that helps a retrieval system find relevant rows and document passages. Reply with ONLY a JSON object." },
      { role: "user", content: `Question: "${question}"\n\nReturn JSON with keys:\n- intent: one of "lookup" | "aggregate" | "compare" | "trend" | "rank" | "explain" | "list" | "other"\n- sub_questions: array of 1-4 atomic sub-questions covering everything the user asked\n- entities: array of named entities mentioned (regions, divisions, school names/ids, sectors, time periods, programs)\n- metrics: array of numeric fields/quantities the user cares about (e.g. "enrollment", "NER", "teacher count", "WASH score")\n- expanded_query: a single richer search string paraphrasing the question with likely DepEd data terms and synonyms across English, Filipino, and relevant Philippine languages` },
    ], false, undefined, { response_format: { type: "json_object" }, temperature: 0 });
    if (!r.ok) return null;
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(txt);
    return {
      intent: String(parsed.intent ?? "other"),
      sub_questions: Array.isArray(parsed.sub_questions) ? parsed.sub_questions.map(String).slice(0, 4) : [],
      entities: Array.isArray(parsed.entities) ? parsed.entities.map(String).slice(0, 12) : [],
      metrics: Array.isArray(parsed.metrics) ? parsed.metrics.map(String).slice(0, 8) : [],
      expanded_query: String(parsed.expanded_query ?? question),
    };
  } catch (e) {
    console.warn("analyzeQuestion failed", e);
    return null;
  }
}


async function callAI(model: string, messages: any[], stream = false, tools?: any[], extra: Record<string, unknown> = {}) {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream, ...(tools && { tools, tool_choice: "auto" }), ...extra }),
  });
}

function isAggregationIntent(text: string): boolean {
  return /\b(how many|how much|total|totals|sum|count|average|avg|mean|median|max|min|maximum|minimum|compare|comparison|difference|change|increase|decrease|trend|ilan|kabuuan|kabuuang|ikumpara|kumpara|pagkakaiba|pagbabago|pagtaas|pagbaba|lahat(?:\s+ng)?|buo|buong(?:\s+listahan)?|complete(?:\s+list)?|kompleto|everything|every|entire|each|per\s+(?:region|province|division|district|municipality|school|barangay)|kada\s+(?:rehiyon|lalawigan|division|district|bayan))\b/.test(text);
}

function normalizeTopicText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function buildTopicTerms(question: string, analysis: QueryAnalysis | null): string[] {
  const raw = [question, analysis?.expanded_query ?? "", analysis?.entities.join(" ") ?? "", analysis?.metrics.join(" ") ?? ""]
    .filter(Boolean)
    .join(" ");
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const token of normalizeTopicText(raw).split(" ")) {
    if (token.length < 3) continue;
    if (/^\d+$/.test(token)) continue;
    if (TOPIC_TERM_STOP_WORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    ordered.push(token);
  }
  return ordered.slice(0, 24);
}

function scoreTopicRelevance(text: string, terms: string[]): number {
  if (!text || terms.length === 0) return 0;
  const haystack = ` ${normalizeTopicText(text)} `;
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(` ${term} `)) score += term.length >= 7 ? 3 : 2;
    else if (haystack.includes(term)) score += 1;
  }
  return score;
}

function isLikelyFollowUpQuestion(text: string): boolean {
  const normalized = normalizeTopicText(text);
  if (normalized.length <= 80 && /\b(this|that|those|these|it|they|them|same|continue|also|include|add|use both|broaden|expand|again)\b/.test(normalized)) return true;
  if (normalized.length <= 60 && /\b(eto|iyan|yan|yun|ito|same|dagdag|isama|gamitin|pareho|ulit|balikan)\b/.test(normalized)) return true;
  return false;
}

async function resolveViewerAccess(supabase: any, authHeader: string | null): Promise<ViewerAccess> {
  let userId: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(authHeader.slice(7));
    userId = data.user?.id ?? null;
  }
  if (!userId) return { userId: null, isAdmin: false, canSeePrivate: false };

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = ((roles ?? []) as Array<{ role: string }>).some((row) => row.role === "admin" || row.role === "super_admin");
  return { userId, isAdmin, canSeePrivate: isAdmin };
}

async function getNumericSummary(supabase: any, collectionId: string, sheet: string | null) {
  const key = `${collectionId}:${sheet ?? "*"}`;
  const cached = numericSummaryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const { data } = await supabase.rpc("dataset_numeric_summary", { p_collection_id: collectionId, p_sheet: sheet });
  const value = data ?? {};
  numericSummaryCache.set(key, { value, expiresAt: Date.now() + 10 * 60_000 });
  return value;
}

function isSourceCatalogQuestion(text: string): boolean {
  return /\b(what|which|list|show|ano|alin|ilista|ipakita)\b[\s\S]{0,80}\b(datasets?|documents?|files?|sources?|koleksiyon|dokumento|archivo)\b|\b(available|magagamit)\b[\s\S]{0,60}\b(datasets?|documents?|files?|sources?)\b/i.test(text);
}

function isDocumentQuestion(text: string): boolean {
  return /\b(document|documents|pdf|docx|memo|memorandum|order|policy|policies|guideline|guidelines|annex|circular|issuance|report|manual|documento|dokumento|patakaran|alituntunin|kautusan)\b/i.test(text);
}

type PhilippineLanguage =
  | "English"
  | "Filipino/Taglish"
  | "Cebuano/Bisaya"
  | "Waray"
  | "Ilocano"
  | "Hiligaynon/Ilonggo"
  | "Other Philippine language";

function detectPhilippineLanguage(text: string): PhilippineLanguage {
  const lower = text.toLowerCase();
  const explicitLanguage = detectExplicitLanguageRequest(lower);
  if (explicitLanguage) return explicitLanguage;

  const dialectScores: Array<[PhilippineLanguage, number]> = [
    ["Cebuano/Bisaya", countMatches(lower, /\b(unsa|ngano|kinsa|asa|pila|kanus-a|kasabot|kabalo|tubag|tubaga|palihug|ug|nimo|inyong|kini|kana|mao|eskwelahan|rehiyon)\b/g)],
    ["Waray", countMatches(lower, /\b(maaram|hain|pira|san-o|hin|iton|ini|ito|nga|baton|eskwelahan|rehiyon)\b/g)],
    ["Ilocano", countMatches(lower, /\b(ania|apay|asino|sadino|mano|kaano|ammom|sungbat|daytoy|dayta|iti|dagiti|iskuela|rehion)\b/g)],
    ["Hiligaynon/Ilonggo", countMatches(lower, /\b(ngaa|sin-o|diin|pila|san-o|kabalo|sabat|ini|ina|eskwelahan|rehiyon)\b/g)],
    ["Other Philippine language", countMatches(lower, /\b(kapampangan|bikol|bicol|pangasinan|tausug|maranao|maguindanaon|chavacano|aklanon|kinaray-a|surigaonon)\b/g)],
  ];
  dialectScores.sort((a, b) => b[1] - a[1]);
  const [topLanguage, topScore] = dialectScores[0];
  const secondScore = dialectScores[1]?.[1] ?? 0;
  if (topScore >= 2 && topScore > secondScore) return topLanguage;

  const filipinoScore = countMatches(lower, /\b(ano|alin|paano|ilan|magkano|kailan|saan|bakit|pwede|maaari|gusto|sagutin|ipakita|ilista|yung|ang|mga|ng|nasa|para|mula|kumpara|kabuuan|paaralan|rehiyon|lalawigan|dokumento)\b/g);
  if (filipinoScore >= 2) return "Filipino/Taglish";

  const englishScore = countMatches(lower, /\b(what|which|how|many|much|when|where|why|show|list|compare|rank|top|highest|lowest|total|average|trend|explain|answer|only|dataset|document|school|region|division|enrollment)\b/g);
  if (englishScore >= 2) return "English";

  return topScore >= 1 || filipinoScore >= 1 ? "Filipino/Taglish" : "English";
}

function detectExplicitLanguageRequest(text: string): PhilippineLanguage | null {
  const hasAnswerVerb = /\b(answer|reply|respond|explain|use|sagutin|isagot|ipaliwanag|i-explain|tubag|tubaga|baton|sabat|sungbat)\b/.test(text);
  if (/\b(in|using)\s+english\b|\benglish\s+only\b|\banswer\s+in\s+english\b/.test(text)) return "English";
  if (hasAnswerVerb && /\b(filipino|tagalog|taglish)\b/.test(text)) return "Filipino/Taglish";
  if (hasAnswerVerb && /\b(bisaya|cebuano)\b/.test(text)) return "Cebuano/Bisaya";
  if (hasAnswerVerb && /\bwaray\b/.test(text)) return "Waray";
  if (hasAnswerVerb && /\bilocano\b/.test(text)) return "Ilocano";
  if (hasAnswerVerb && /\b(hiligaynon|ilonggo)\b/.test(text)) return "Hiligaynon/Ilonggo";
  if (hasAnswerVerb && /\b(kapampangan|bikol|bicol|pangasinan|tausug|maranao|maguindanaon|chavacano|aklanon|kinaray-a|surigaonon)\b/.test(text)) return "Other Philippine language";
  return null;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function isCasualMessage(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[!?.,'"]/g, "").replace(/\s+/g, " ").trim();
  if (normalized.length > 60) return false;
  return /^(hi|hello|hey|hello there|good morning|good afternoon|good evening|morning|kumusta|kamusta|salamat|thank you|thanks|thank you alam|thanks alam|ok|okay|nice|great|test)$/i.test(normalized);
}

function shouldAutoChart(text: string): boolean {
  return /\b(compare|comparison|versus|vs\.?|difference|change|increase|decrease|trend|over time|rank|ranking|top\s+\d+|highest|lowest|distribution|share|percentage|proportion|per region|by region|by year|by grade|ikumpara|kumpara|pagkakaiba|pagbabago|pagtaas|pagbaba|trend|ranggo|pinakamataas|pinakamababa|bahagdan|porsyento|kada rehiyon)\b/i.test(text);
}

function isDirectYearComparison(text: string): boolean {
  const years = text.match(/\b20\d{2}(?:-\d{2,4})?\b/g) ?? [];
  return /\b(compare|comparison|versus|vs\.?|ikumpara|kumpara|ihambing)\b/i.test(text) && new Set(years).size >= 2;
}

function needsGroupedRowAnalysis(text: string): boolean {
  return /\b(rank|ranking|top\s+\d+|highest|lowest|distribution|share|proportion|per\s+(?:region|province|division|district|municipality|school|barangay|grade|sector)|by\s+(?:region|province|division|district|municipality|school|barangay|grade|sector)|kada\s+(?:rehiyon|lalawigan|division|district|bayan|paaralan|baitang)|pinakamataas|pinakamababa)\b/i.test(text);
}

function detectGroupKey(text: string): string | null {
  const groups: Array<[RegExp, string]> = [
    [/\b(?:by|per|kada)\s+(?:region|rehiyon)|\bregions?\b/i, "region"],
    [/\b(?:by|per|kada)\s+(?:province|lalawigan)|\bprovinces?\b/i, "province"],
    [/\b(?:by|per|kada)\s+division|\bdivisions?\b/i, "division"],
    [/\b(?:by|per|kada)\s+district|\bdistricts?\b/i, "district"],
    [/\b(?:by|per|kada)\s+(?:municipality|bayan)|\bmunicipalit(?:y|ies)\b/i, "municipality"],
    [/\b(?:by|per|kada)\s+barangay|\bbarangays?\b/i, "barangay"],
    [/\b(?:by|per|kada)\s+sector|\bsectors?\b/i, "sector"],
    [/\b(?:by|per|kada)\s+grade|\bgrades?\b/i, "grade"],
    [/\b(?:by|per|kada)\s+school|\bschools?\b/i, "school_name"],
  ];
  return groups.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function detectRowLimit(q: string): number {
  const text = q.toLowerCase();
  if (isAggregationIntent(text)) return 500;
  const m =
    text.match(/\b(?:top|first|atleast|at\s*least|show|give\s*me|provide(?:\s*me)?|list|need|kailangan|magbigay(?:\s*ng)?|ipakita|hanggang|up\s*to)\s+(\d{1,5})\b/) ||
    text.match(/\b(\d{1,5})\s+(?:records?|rows?|entries?|items?|candidates?|schools?|kandidato|paaralan|datos|results?)\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n > 0) return Math.min(n, 20000);
  }
  return 200;
}

function packRowsTSV(rows: Record<string, any>[], charBudget: number, priorityHints: string[] = [], maxColumns = 32): { tsv: string; columns: string[]; allColumns: string[]; included: number } {
  if (rows.length === 0) return { tsv: "", columns: [], allColumns: [], included: 0 };
  const colCounts: Record<string, number> = {};
  for (const r of rows) for (const k of Object.keys(r ?? {})) colCounts[k] = (colCounts[k] ?? 0) + 1;
  const hintsLower = priorityHints.map((h) => h.toLowerCase());
  const isPriority = (col: string) => {
    const c = col.toLowerCase();
    if (/^(school_?name|school_?id|name|id|region|division|district|municipality|province|barangay|sector)$/i.test(col)) return true;
    return hintsLower.some((h) => h.length >= 3 && (c.includes(h) || h.includes(c)));
  };
  // Sort: priority columns first (by frequency), then the rest by frequency.
  const sorted = Object.entries(colCounts).sort((a, b) => {
    const pa = isPriority(a[0]) ? 1 : 0;
    const pb = isPriority(b[0]) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return b[1] - a[1];
  });
  const allColumns = sorted.map(([k]) => k);
  const columns = sorted.slice(0, maxColumns).map(([k]) => k);
  const header = columns.join("\t");
  let out = header;
  let included = 0;
  const esc = (v: any) => (v === null || v === undefined ? "" : String(v).replace(/[\t\n\r]/g, " ").slice(0, 200));
  for (const r of rows) {
    const line = "\n" + columns.map((c) => esc(r[c])).join("\t");
    if (out.length + line.length > charBudget) break;
    out += line;
    included++;
  }
  return { tsv: out, columns, allColumns, included };
}

function summarizeDataQuality(rows: Record<string, any>[]): string[] {
  if (rows.length === 0) return [];
  const issues: string[] = [];
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row ?? {}))));
  const missing = columns
    .map((column) => ({ column, count: rows.filter((row) => row?.[column] === null || row?.[column] === undefined || String(row?.[column]).trim() === "").length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  if (missing.length > 0) issues.push(`Missing values in retrieved sample: ${missing.map((item) => `${item.column} (${item.count}/${rows.length})`).join(", ")}`);
  const fingerprints = rows.map((row) => JSON.stringify(row));
  const duplicateCount = fingerprints.length - new Set(fingerprints).size;
  if (duplicateCount > 0) issues.push(`Potential exact duplicate rows in retrieved sample: ${duplicateCount}`);
  const sparseColumns = columns.filter((column) => rows.filter((row) => Object.prototype.hasOwnProperty.call(row ?? {}, column)).length < rows.length);
  if (sparseColumns.length > 0) issues.push(`Columns not present in every retrieved row: ${sparseColumns.slice(0, 12).join(", ")}`);
  return issues;
}


async function embedQuery(question: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: question, dimensions: 1536 }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

// Enrich dataset rows with school_name/region/division from the Schools Master
// whenever a row has a school_id (or similar) but is missing school_name. This
// prevents the model from inventing "School A/B/C" when the upstream dataset
// only stores numeric IDs.
async function enrichRowsWithSchoolNames(rows: Record<string, any>[], supabase: any): Promise<Record<string, any>[]> {
  if (!rows || rows.length === 0) return rows;
  // Detect a school id field once
  const sample = rows.find((r) => r && typeof r === "object") ?? {};
  const idKey = Object.keys(sample).find((k) => /^(school[_\s-]?id|deped[_\s-]?school[_\s-]?id|beis[_\s-]?id|sch[_\s-]?id)$/i.test(k));
  const nameKey = Object.keys(sample).find((k) => /^(school[_\s-]?name|name[_\s-]?of[_\s-]?school)$/i.test(k));
  if (!idKey) return rows;

  // Collect unique IDs that need enrichment (no usable name present)
  const idsNeeded = new Set<string>();
  for (const r of rows) {
    const id = r?.[idKey];
    if (id === null || id === undefined || id === "") continue;
    const hasName = nameKey && r[nameKey] && String(r[nameKey]).trim() !== "";
    if (!hasName) idsNeeded.add(String(id).trim());
  }
  if (idsNeeded.size === 0) return rows;

  // Batch fetch from schools master (cap to 500 unique ids to keep query small)
  const idList = Array.from(idsNeeded).slice(0, 500);
  const { data: schools } = await supabase
    .from("schools")
    .select("school_id,school_name,region,division,district,municipality,province,barangay,sector")
    .in("school_id", idList);
  if (!schools || schools.length === 0) return rows;

  const map = new Map<string, any>();
  for (const s of schools) map.set(String(s.school_id), s);

  return rows.map((r) => {
    const id = r?.[idKey];
    if (id === null || id === undefined) return r;
    const s = map.get(String(id).trim());
    if (!s) return r;
    return {
      ...r,
      school_name: r.school_name || s.school_name,
      region: r.region || s.region,
      division: r.division || s.division,
      district: r.district || s.district,
      municipality: r.municipality || s.municipality,
      province: r.province || s.province,
      barangay: r.barangay || s.barangay,
      sector: r.sector || s.sector,
    };
  });
}

async function classifyAndRoute(
  userQuestion: string,
  supabase: any,
  fetchLimit: number,
  viewer: ViewerAccess,
  routerModel: string,
  queryEmbedding: number[] | null,
  topicTerms: string[],
  stickyCollectionSlugs: string[] = [],
  scope: ChatScope = { type: "all" },
): Promise<{ collections: any[]; rows: { collection: string; collection_id: string; name: string; total: number; data: any[]; ids: string[]; sheet: string | null; numericSummary: any; groupedSummary: any }[] }> {

  if (scope.type === "documents") return { collections: [], rows: [] };

  let colQuery = supabase.from("collections").select("id,name,slug,description,parser_summary,ai_parsed_context,row_count,is_public");
  if (!viewer.canSeePrivate) colQuery = colQuery.eq("is_public", true);
  if (scope.type === "dataset") colQuery = colQuery.eq("slug", scope.slug);
  const { data: cols } = await colQuery;
  if (!cols || cols.length === 0) return { collections: [], rows: [] };

  const colSummary = cols.map((c: any) => `- ${c.slug}: ${c.name}${c.parser_summary || c.ai_parsed_context || c.description ? " — " + (c.parser_summary || c.ai_parsed_context || c.description) : ""} (${c.row_count} rows)`).join("\n");
  const pickResp = await callAI(routerModel, [
    { role: "system", content: "Select only the dataset collections directly needed to answer a Philippine DepEd user question in English, Filipino/Taglish, or another Philippine language. Prefer precision over recall. Include multiple datasets only for explicit comparisons, cross-dataset questions, or when each dataset directly supports a requested part. Do not include loosely related collections. Reply with a JSON object {\"slugs\": [...]}, max 3 slugs, ranked best-first, no prose. If truly nothing fits, reply {\"slugs\": []}." },
    { role: "user", content: `Available collections:\n${colSummary}\n\nUser question (may include expanded synonyms): "${userQuestion}"\n\nReturn JSON: {"slugs": [...]}` },
  ], false, undefined, { response_format: { type: "json_object" } });

  let chosen: string[] = [];
  try {
    const j = await pickResp.json();
    const txt = j.choices?.[0]?.message?.content ?? "{}";
    chosen = JSON.parse(txt).slugs ?? [];
  } catch { chosen = []; }
  if (scope.type === "dataset") chosen = [scope.slug];
  if (scope.type === "all") {
    const normalizedQuestion = userQuestion.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const explicitlyMentioned = cols
      .filter((c: any) => {
        const cleanName = String(c.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const cleanSlug = String(c.slug ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        return (cleanName.length >= 4 && normalizedQuestion.includes(cleanName))
          || (cleanSlug.length >= 4 && normalizedQuestion.includes(cleanSlug));
      })
      .map((c: any) => c.slug);
    chosen = [...explicitlyMentioned, ...chosen.filter((slug) => !explicitlyMentioned.includes(slug))];
  }

  if (scope.type === "all") {
    for (const sticky of stickyCollectionSlugs) {
      const stickyCollection = cols.find((c: any) => c.slug === sticky);
      if (!stickyCollection) continue;
      if (scoreTopicRelevance(`${stickyCollection.name} ${stickyCollection.slug} ${stickyCollection.parser_summary || stickyCollection.ai_parsed_context || stickyCollection.description || ""}`, topicTerms) <= 0) continue;
      if (!chosen.includes(sticky)) chosen.push(sticky);
    }
  }

  const scoredCollections = cols
    .map((c: any) => ({
      ...c,
      topicScore: scoreTopicRelevance(
        `${c.name} ${c.slug} ${c.parser_summary || c.ai_parsed_context || c.description || ""}`,
        topicTerms,
      ),
    }))
    .sort((a: any, b: any) => (b.topicScore - a.topicScore) || ((b.row_count ?? 0) - (a.row_count ?? 0)));

  for (const candidate of scoredCollections.slice(0, 4)) {
    if (candidate.topicScore <= 0) continue;
    if (!chosen.includes(candidate.slug)) chosen.push(candidate.slug);
  }

  if (chosen.length === 0) {
    const bestTopicMatch = scoredCollections.find((c: any) => c.topicScore > 0);
    chosen = bestTopicMatch
      ? [bestTopicMatch.slug]
      : [...cols].sort((a: any, b: any) => (b.row_count ?? 0) - (a.row_count ?? 0)).slice(0, 1).map((c: any) => c.slug);
  }

  chosen = chosen
    .map((slug) => scoredCollections.find((c: any) => c.slug === slug))
    .filter(Boolean)
    .sort((a: any, b: any) => (b.topicScore - a.topicScore) || ((b.row_count ?? 0) - (a.row_count ?? 0)))
    .slice(0, 4)
    .map((c: any) => c.slug);

  const selectedCols = cols.filter((c: any) => chosen.includes(c.slug));

  const rows: { collection: string; collection_id: string; name: string; total: number; data: any[]; ids: string[]; sheet: string | null; numericSummary: any; groupedSummary: any }[] = [];
  const aggregation = isAggregationIntent(userQuestion.toLowerCase());
  const groupKey = needsGroupedRowAnalysis(userQuestion) ? detectGroupKey(userQuestion) : null;
  const baseNumericSummaries = aggregation
    ? new Map((await Promise.all(selectedCols.map(async (c: any) => [c.id, await getNumericSummary(supabase, c.id, null)] as const))))
    : new Map<string, any>();

  for (const c of selectedCols) {
    const { data: sheetList } = await supabase
      .from("dataset_rows").select("sheet_name").eq("collection_id", c.id).not("sheet_name", "is", null).limit(2000);
    const sheets = Array.from(new Set((sheetList ?? []).map((s: any) => s.sheet_name).filter(Boolean))) as string[];
    const qLower = userQuestion.toLowerCase();
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const matchedSheet = sheets.find((s) => qLower.includes(s.toLowerCase()) || norm(qLower).includes(norm(s))) ?? null;

    const tsQuery = userQuestion.replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8).join(" | ");

    // True total — no text filter for aggregation
    let total = c.row_count ?? 0;
    if (matchedSheet || !aggregation) {
      let totalQ = supabase.from("dataset_rows").select("id", { count: "exact", head: true }).eq("collection_id", c.id);
      if (matchedSheet) totalQ = totalQ.eq("sheet_name", matchedSheet);
      if (!aggregation && tsQuery) totalQ = totalQ.textSearch("search_vector", tsQuery, { type: "plain", config: "simple" });
      const { count: matchedTotal } = await totalQ;
      total = matchedTotal ?? total;
    }

    const fetched: any[] = [];
    const ids: string[] = [];

    if (aggregation) {
      // Paginate to overcome 1000-row PostgREST cap
      for (let off = 0; off < fetchLimit; off += 1000) {
        const pageSize = Math.min(1000, fetchLimit - off);
        let q = supabase.from("dataset_rows").select("id,data,sheet_name").eq("collection_id", c.id).order("id", { ascending: true }).range(off, off + pageSize - 1);
        if (matchedSheet) q = q.eq("sheet_name", matchedSheet);
        const { data: page } = await q;
        if (!page || page.length === 0) break;
        for (const r of page) { fetched.push({ ...r.data, ...(r.sheet_name && { _sheet: r.sheet_name }) }); if (r.id) ids.push(r.id); }
        if (page.length < pageSize) break;
      }
    } else {
      // Hybrid: vector + tsvector, dedup by id
      const seen = new Set<string>();
      if (queryEmbedding) {
        const { data: vec } = await supabase.rpc("match_dataset_rows", {
          query_embedding: queryEmbedding as any,
          p_collection_id: c.id,
          p_sheet: matchedSheet,
          match_count: 150,
        });
        for (const r of vec ?? []) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          fetched.push({ ...r.data, ...(r.sheet_name && { _sheet: r.sheet_name }) });
          ids.push(r.id);
        }
      }
      let q = supabase.from("dataset_rows").select("id,data,sheet_name").eq("collection_id", c.id).limit(Math.min(fetchLimit, 200));
      if (matchedSheet) q = q.eq("sheet_name", matchedSheet);
      if (tsQuery) q = q.textSearch("search_vector", tsQuery, { type: "plain", config: "simple" });
      const { data: kw } = await q;
      for (const r of kw ?? []) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        fetched.push({ ...r.data, ...(r.sheet_name && { _sheet: r.sheet_name }) });
        ids.push(r.id);
      }
      if (fetched.length === 0) {
        let fb = supabase.from("dataset_rows").select("id,data,sheet_name").eq("collection_id", c.id).limit(Math.min(fetchLimit, 200));
        if (matchedSheet) fb = fb.eq("sheet_name", matchedSheet);
        const { data: fbRows } = await fb;
        for (const r of fbRows ?? []) {
          fetched.push({ ...r.data, ...(r.sheet_name && { _sheet: r.sheet_name }) });
          if (r.id) ids.push(r.id);
        }
      }
    }

    // DB-side numeric summary over ALL rows
    let numericSummary: any = {};
    try {
      numericSummary = matchedSheet
        ? await getNumericSummary(supabase, c.id, matchedSheet)
        : baseNumericSummaries.get(c.id) ?? await getNumericSummary(supabase, c.id, null);
    } catch (e) { console.warn("numeric_summary failed", e); }

    let groupedSummary: any = [];
    if (groupKey) {
      try {
        const { data } = await supabase.rpc("dataset_grouped_numeric_summary", {
          p_collection_id: c.id,
          p_group_key: groupKey,
          p_sheet: matchedSheet,
        });
        groupedSummary = data ?? [];
      } catch (e) { console.warn("grouped_numeric_summary failed", e); }
    }

    if (fetched.length > 0) {
      // Auto-enrich rows that contain a school_id but no school_name — joins
      // against the Schools Master so the model never has to invent names.
      const enriched = await enrichRowsWithSchoolNames(fetched, supabase);
      rows.push({ collection: c.slug, collection_id: c.id, name: c.name, total, data: enriched, ids, sheet: matchedSheet, numericSummary, groupedSummary });
    }
  }


  return { collections: selectedCols, rows };
}

async function searchSchools(userQuestion: string, supabase: any, fetchLimit: number): Promise<any[]> {
  const q = userQuestion.toLowerCase();
  const schoolish = /school|deped|region|division|district|municipal|province|barangay|sector|elementary|secondary|senior high|junior high|paaralan|rehiyon|lalawigan|bayan/i.test(q);
  if (!schoolish) return [];

  const tokens = userQuestion.replace(/[^\w\s]/g, " ").split(/\s+/).filter((t) => t.length > 2).slice(0, 6);
  if (tokens.length === 0) {
    const { data } = await supabase.from("schools").select("school_id,school_name,region,division,district,municipality,province,barangay,sector,school_management").limit(fetchLimit);
    return data ?? [];
  }

  const cols = ["school_name", "region", "division", "district", "municipality", "province", "barangay", "sector", "school_management", "school_subclassification"];
  const orParts: string[] = [];
  for (const t of tokens) {
    for (const c of cols) orParts.push(`${c}.ilike.%${t}%`);
  }
  const { data } = await supabase
    .from("schools")
    .select("school_id,school_name,region,division,district,municipality,province,barangay,sector,school_management")
    .or(orParts.join(","))
    .limit(fetchLimit);
  return data ?? [];
}

// Extract candidate school IDs (5-9 digit numbers) from a question
function extractSchoolIds(text: string): string[] {
  const matches = text.match(/\b\d{5,9}\b/g) ?? [];
  return Array.from(new Set(matches));
}

// Direct lookup by school_id across the schools master AND every dataset_rows collection.
async function lookupSchoolIds(
  ids: string[],
  supabase: any,
  viewer: ViewerAccess,
  scope: ChatScope = { type: "all" },
): Promise<{ schoolMaster: any[]; datasetMatches: { collection_id: string; collection_name: string; collection_slug: string; rows: any[] }[] }> {
  if (ids.length === 0) return { schoolMaster: [], datasetMatches: [] };

  // 1) Schools master
  const { data: master } = await supabase
    .from("schools")
    .select("*")
    .in("school_id", ids);

  // 2) dataset_rows — JSONB match on data->>'school_id'
  let colQ = supabase.from("collections").select("id,name,slug,is_public");
  if (!viewer.canSeePrivate) colQ = colQ.eq("is_public", true);
  if (scope.type === "documents") return { schoolMaster: master ?? [], datasetMatches: [] };
  if (scope.type === "dataset") colQ = colQ.eq("slug", scope.slug);
  const { data: cols } = await colQ;

  const datasetMatches: { collection_id: string; collection_name: string; collection_slug: string; rows: any[] }[] = [];
  for (const c of cols ?? []) {
    const orFilter = ids.map((id) => `data->>school_id.eq.${id}`).join(",");
    const { data: hits, error: hitsErr } = await supabase
      .from("dataset_rows")
      .select("data,sheet_name")
      .eq("collection_id", c.id)
      .or(orFilter)
      .limit(50);
    if (hitsErr) console.warn("lookupSchoolIds error", c.slug, hitsErr.message);
    if (hits && hits.length > 0) {
      datasetMatches.push({
        collection_id: c.id,
        collection_name: c.name,
        collection_slug: c.slug,
        rows: hits.map((h: any) => ({ ...h.data, ...(h.sheet_name && { _sheet: h.sheet_name }) })),
      });
    }
  }

  return { schoolMaster: master ?? [], datasetMatches };
}

// Chunk shape used downstream — includes id + document_id so we can validate page mapping.
type DocChunk = {
  id: string;
  document_id: string;
  page: number | null;
  content: string;
  section: string | null;
  chunk_index: number;
};
type DocResult = { docId: string; docTitle: string; docType: string; totalPages: number; chunks: DocChunk[] };

async function loadSourceCatalog(supabase: any, viewer: ViewerAccess) {
  let collectionsQuery = supabase
    .from("collections")
    .select("name,row_count,description,is_public")
    .order("name", { ascending: true });
  let documentsQuery = supabase
    .from("documents")
    .select("title,doc_type,total_pages,is_public")
    .order("title", { ascending: true });
  if (!viewer.canSeePrivate) {
    collectionsQuery = collectionsQuery.eq("is_public", true);
    documentsQuery = documentsQuery.eq("is_public", true);
  }
  const [{ data: collections }, { data: documents }] = await Promise.all([collectionsQuery, documentsQuery]);
  return { collections: collections ?? [], documents: documents ?? [] };
}

// Search relevant document chunks using HYBRID retrieval (vector + tsvector).
async function searchDocuments(
  userQuestion: string,
  supabase: any,
  viewer: ViewerAccess,
  queryEmbedding: number[] | null,
  topicTerms: string[],
  scope: ChatScope = { type: "all" },
): Promise<DocResult[]> {
  if (scope.type === "dataset") return [];
  let docsQuery = supabase
    .from("documents")
    .select("id,title,doc_type,total_pages,parser_summary,ai_parsed_context,is_public");
  if (!viewer.canSeePrivate) docsQuery = docsQuery.eq("is_public", true);
  const { data: docs } = await docsQuery;
  if (!docs || docs.length === 0) return [];

  const qLower = userQuestion.toLowerCase();
  const titleMatched = docs.filter((d: any) => {
    const t = (d.title || "").toLowerCase();
    if (!t) return false;
    return t.split(/\s+/).some((w: string) => w.length >= 4 && qLower.includes(w));
  });
  const scoredDocs = docs
    .map((d: any) => ({
      ...d,
      topicScore: scoreTopicRelevance(
        `${d.title} ${d.doc_type || ""} ${d.parser_summary || d.ai_parsed_context || ""}`,
        topicTerms,
      ),
    }))
    .sort((a: any, b: any) => (b.topicScore - a.topicScore) || ((b.total_pages ?? 0) - (a.total_pages ?? 0)));
  const semanticMatches = scoredDocs.filter((d: any) => d.topicScore > 0).slice(0, 4);
  const targetDocs = titleMatched.length > 0 ? titleMatched : semanticMatches.length > 0 ? semanticMatches : docs;
  const targetIds: string[] = targetDocs.map((d: any) => d.id);

  const tsQuery = userQuestion.replace(/[^\w\s]/g, " ").split(/\s+/).filter((t) => t.length > 2).slice(0, 8).join(" | ");

  // 1) Vector search across targeted docs (one call total)
  const grouped = new Map<string, any[]>();
  const seen = new Set<string>();
  if (queryEmbedding && targetIds.length > 0) {
    const { data: vec } = await supabase.rpc("match_document_chunks", {
      query_embedding: queryEmbedding as any,
      p_document_ids: targetIds as any,
      match_count: 16,
    });
    for (const c of vec ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const arr = grouped.get(c.document_id) ?? [];
      arr.push(c);
      grouped.set(c.document_id, arr);
    }
  }

  // 2) Keyword search per doc (small, for recall)
  for (const d of targetDocs) {
    let q = supabase
      .from("document_chunks")
      .select("id,document_id,page_number,content,section_title,chunk_index")
      .eq("document_id", d.id)
      .order("chunk_index", { ascending: true })
      .limit(8);
    if (tsQuery) q = q.textSearch("search_vector", tsQuery, { type: "plain", config: "simple" });
    const { data: kw } = await q;
    for (const c of kw ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const arr = grouped.get(c.document_id) ?? [];
      arr.push(c);
      grouped.set(c.document_id, arr);
    }
    if (!grouped.has(d.id) && titleMatched.includes(d)) {
      const { data: fb } = await supabase
        .from("document_chunks")
        .select("id,document_id,page_number,content,section_title,chunk_index")
        .eq("document_id", d.id)
        .order("chunk_index", { ascending: true })
        .limit(6);
      for (const c of fb ?? []) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        const arr = grouped.get(c.document_id) ?? [];
        arr.push(c);
        grouped.set(c.document_id, arr);
      }
    }
  }

  const results: DocResult[] = [];
  for (const d of targetDocs) {
    const chunks = grouped.get(d.id) ?? [];
    if (chunks.length === 0) continue;
    // Sort by chunk_index for readability
    chunks.sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0));
    results.push({
      docId: d.id,
      docTitle: d.title,
      docType: d.doc_type,
      totalPages: d.total_pages ?? 0,
      chunks: chunks.slice(0, 16).map((c: any) => ({
        id: c.id,
        document_id: c.document_id,
        page: c.page_number,
        content: c.content,
        section: c.section_title,
        chunk_index: c.chunk_index,
      })),
    });
  }
  return results;
}



// Validate that every chunk's page_number matches the authoritative DB value
// and falls within the parent document's known page range. Drop or correct mismatches.
async function validateDocumentChunks(
  docResults: DocResult[],
  supabase: any,
): Promise<{ validated: DocResult[]; report: { total: number; corrected: number; dropped: number; outOfRange: number } }> {
  const report = { total: 0, corrected: 0, dropped: 0, outOfRange: 0 };
  if (docResults.length === 0) return { validated: docResults, report };

  // Collect all chunk IDs across all documents and re-fetch authoritative rows in one query
  const allIds = docResults.flatMap((d) => d.chunks.map((c) => c.id));
  report.total = allIds.length;
  if (allIds.length === 0) return { validated: docResults, report };

  const { data: authoritative } = await supabase
    .from("document_chunks")
    .select("id,document_id,page_number,chunk_index")
    .in("id", allIds);

  const authMap = new Map<string, { document_id: string; page_number: number | null; chunk_index: number }>();
  for (const a of authoritative ?? []) {
    authMap.set(a.id, { document_id: a.document_id, page_number: a.page_number, chunk_index: a.chunk_index });
  }

  const validated: DocResult[] = docResults.map((d) => {
    const cleaned: DocChunk[] = [];
    for (const c of d.chunks) {
      const truth = authMap.get(c.id);
      if (!truth) {
        // Chunk no longer exists in DB → drop
        report.dropped++;
        console.warn(`[chunk-validator] dropped chunk ${c.id} (not found in DB)`);
        continue;
      }
      if (truth.document_id !== d.docId) {
        // Cross-document leak (shouldn't happen with our query, but defend)
        report.dropped++;
        console.warn(`[chunk-validator] dropped chunk ${c.id} (document_id mismatch: expected ${d.docId}, got ${truth.document_id})`);
        continue;
      }
      // Correct page number drift
      if (c.page !== truth.page_number) {
        report.corrected++;
        console.warn(`[chunk-validator] corrected chunk ${c.id} page: ${c.page} → ${truth.page_number}`);
        c.page = truth.page_number;
      }
      // Range check: page must fit within total_pages (when known)
      if (d.totalPages > 0 && typeof c.page === "number" && (c.page < 1 || c.page > d.totalPages)) {
        report.outOfRange++;
        console.warn(`[chunk-validator] chunk ${c.id} page ${c.page} out of range [1..${d.totalPages}] for doc "${d.docTitle}" — setting to null`);
        c.page = null;
      }
      // Correct chunk_index drift (defensive)
      if (c.chunk_index !== truth.chunk_index) {
        c.chunk_index = truth.chunk_index;
      }
      cleaned.push(c);
    }
    return { ...d, chunks: cleaned };
  }).filter((d) => d.chunks.length > 0);

  return { validated, report };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, conversation_id, citation_format, scope: rawScope } = await req.json();
    const citationFormat: CitationFormat = citation_format === "detailed" ? "detailed" : "short";
    const scope: ChatScope =
      rawScope?.type === "dataset" && typeof rawScope.slug === "string"
        ? { type: "dataset", slug: rawScope.slug }
        : rawScope?.type === "documents"
          ? { type: "documents" }
          : { type: "all" };
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
    const userQ = lastUser?.content ?? "";

    // Identify user + access level from JWT (optional)
    const auth = req.headers.get("Authorization");
    const viewer = await resolveViewerAccess(supabase, auth);
    const userId = viewer.userId;

    // Rate limiting
    const tier = userId ? "user" : "guest";
    const { data: cfg } = await supabase.from("rate_limit_config").select("requests_per_minute").eq("tier", tier).maybeSingle();
    const limit = cfg?.requests_per_minute ?? (userId ? 30 : 5);
    const ident = userId ?? (req.headers.get("x-forwarded-for") ?? "anon");
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { data: rl } = await supabase.from("rate_limits").select("*").eq("identifier", ident).eq("tier", tier).maybeSingle();
    if (rl && rl.window_start > windowStart) {
      if (rl.count >= limit) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await supabase.from("rate_limits").update({ count: rl.count + 1 }).eq("id", rl.id);
    } else {
      await supabase.from("rate_limits").upsert({ identifier: ident, tier, count: 1, window_start: new Date().toISOString() }, { onConflict: "identifier,tier" });
    }

    // Load admin-configured AI settings (model, temperature, max_tokens, optional system prompt override)
    const { data: aiSettings } = await supabase
      .from("ai_settings")
      .select("chat_model,router_model,temperature,max_tokens,system_prompt_override")
      .eq("id", 1)
      .maybeSingle();
    // Chat function calls OpenAI directly — coerce non-OpenAI model names (e.g. "gemini-*") to safe defaults.
    const sanitizeOpenAIModel = (m: string | undefined | null, fallback: string) => {
      if (!m) return fallback;
      const low = m.toLowerCase();
      if (low.startsWith("gpt-") || low.startsWith("o1") || low.startsWith("o3") || low.startsWith("openai/")) {
        return low.startsWith("openai/") ? m.slice("openai/".length) : m;
      }
      console.warn(`Configured model "${m}" is not an OpenAI model; falling back to ${fallback}`);
      return fallback;
    };
    const chatModel = sanitizeOpenAIModel(aiSettings?.chat_model, "gpt-4o");
    const routerModel = sanitizeOpenAIModel(aiSettings?.router_model, "gpt-4o-mini");
    const temperature = typeof aiSettings?.temperature === "number" ? aiSettings.temperature : 0.2;
    const maxTokens = typeof aiSettings?.max_tokens === "number" ? aiSettings.max_tokens : 4000;
    const systemPromptOverride = aiSettings?.system_prompt_override?.trim() || null;

    const t0 = Date.now();
    const casualMessage = isCasualMessage(userQ);

    const followUpQuestion = !casualMessage && isLikelyFollowUpQuestion(userQ);
    const priorUserTurns = followUpQuestion
      ? messages
          .slice(0, -1)
          .filter((m: any) => m.role === "user")
          .slice(-2)
          .map((m: any) => String(m.content ?? ""))
      : [];
    const lastAssistant = followUpQuestion ? [...messages].reverse().find((m: any) => m.role === "assistant") : null;
    const assistantHint = followUpQuestion && lastAssistant
      ? String(lastAssistant.content ?? "").slice(0, 500)
      : "";
    const retrievalQuery = casualMessage
      ? userQ
      : [
          ...priorUserTurns,
          userQ,
          assistantHint ? `Previous answer context: ${assistantHint}` : "",
        ].filter(Boolean).join("\n");

    // Determine how many rows the user wants (dynamic based on their question)
    const fetchLimit = detectRowLimit(retrievalQuery);

    // Sticky collections: pull the slugs used in the most recent assistant
    // citations for this conversation so follow-ups stay on the same dataset.
    let stickyCollectionSlugs: string[] = [];
    if (conversation_id && followUpQuestion) {
      const { data: prevMsgs } = await supabase
        .from("messages")
        .select("citations,role,created_at")
        .eq("conversation_id", conversation_id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(3);
      const slugSet = new Set<string>();
      for (const m of prevMsgs ?? []) {
        for (const c of (m.citations ?? []) as any[]) {
          if (c?.collection && typeof c.collection === "string") {
            // citations store collection NAME (not slug). Resolve both ways below.
            slugSet.add(c.collection);
          }
        }
      }
      if (slugSet.size > 0) {
        const { data: matchCols } = await supabase
          .from("collections")
          .select("slug,name")
          .or(Array.from(slugSet).map((s) => `name.eq.${s.replace(/,/g, "\\,")}`).join(","));
        stickyCollectionSlugs = (matchCols ?? []).map((c: any) => c.slug).filter(Boolean);
      }
    }

    // Decompose the question to drive smarter retrieval
    const sourceCatalogQuestion = !casualMessage && isSourceCatalogQuestion(userQ);
    const directYearComparison = isDirectYearComparison(userQ);
    const aggregationFastPath = isAggregationIntent(userQ);
    const analysis: QueryAnalysis | null = casualMessage || sourceCatalogQuestion || directYearComparison || aggregationFastPath ? null : await analyzeQuestion(retrievalQuery, routerModel);
    const enrichedRetrievalQuery = analysis
      ? [retrievalQuery, analysis.expanded_query, analysis.entities.join(" "), analysis.metrics.join(" "), analysis.sub_questions.join(" ")].filter(Boolean).join("\n")
      : retrievalQuery;
    const topicTerms = buildTopicTerms(userQ, analysis);
    // One embedding request per question. The previous implementation embedded
    // both the raw and enriched queries, adding latency without improving routing.
    const enrichedEmbedding = casualMessage || sourceCatalogQuestion || directYearComparison || aggregationFastPath ? null : await embedQuery(enrichedRetrievalQuery);
    const shouldSearchDocuments = !casualMessage && (scope.type === "documents" || (scope.type === "all" && isDocumentQuestion(userQ)));
    const sourceCatalog = sourceCatalogQuestion ? await loadSourceCatalog(supabase, viewer) : null;

    // Route + fetch dataset context (collections + schools + documents + direct school_id lookup, in parallel)
    const schoolIdCandidates = extractSchoolIds(retrievalQuery);
    const [{ collections, rows }, schoolRows, rawDocResults, idLookup] = await Promise.all([
      casualMessage || sourceCatalogQuestion
        ? Promise.resolve({ collections: [], rows: [] })
        : classifyAndRoute(enrichedRetrievalQuery, supabase, fetchLimit, viewer, routerModel, enrichedEmbedding, topicTerms, stickyCollectionSlugs, scope),
      casualMessage || scope.type === "documents" || sourceCatalogQuestion ? Promise.resolve([]) : searchSchools(enrichedRetrievalQuery, supabase, fetchLimit),
      shouldSearchDocuments && !sourceCatalogQuestion
        ? searchDocuments(enrichedRetrievalQuery, supabase, viewer, enrichedEmbedding, topicTerms, scope)
        : Promise.resolve([]),
      casualMessage ? Promise.resolve({ schoolMaster: [], datasetMatches: [] }) : lookupSchoolIds(schoolIdCandidates, supabase, viewer, scope),
    ]);




    // Validate every chunk's page mapping against authoritative DB rows BEFORE building the prompt.
    const { validated: docResults, report: validationReport } = await validateDocumentChunks(rawDocResults, supabase);
    if (validationReport.total > 0) {
      console.log(`[chunk-validator] checked=${validationReport.total} corrected=${validationReport.corrected} dropped=${validationReport.dropped} outOfRange=${validationReport.outOfRange}`);
    }

    // Build context — TSV-packed rows + DB-computed numeric summary across ALL rows.
    const MAX_CONTEXT_CHARS = 220_000; // ~55k tokens cap for dataset+doc context
    const PER_COLLECTION_BUDGET = 80_000; // ~20k tokens per collection
    let datasetContext = "";
    const citations: { collection: string; record_count: number; total?: number }[] = [];
    const auditSources: any[] = [];

    datasetContext += `\n\n# DISPLAY RULE\nUse clean collection and document names only. Do not mention collection slugs, random suffixes, UUIDs, or backend identifiers in the final answer.\n`;
    datasetContext += `\n\n# RESPONSE LANGUAGE\nAnswer the user's latest message in ${detectPhilippineLanguage(userQ)} unless the user explicitly requests another language. If dialect confidence is low or the detected language is "Other Philippine language", use Filipino/Taglish. Preserve dataset names, document titles, school names, region/division names, and technical field names exactly as provided.\n`;
    if (casualMessage) {
      datasetContext += `\n\n# CASUAL MESSAGE FAST PATH\nThis is a greeting or casual acknowledgement. Reply briefly and naturally to the latest message only. Do not continue the previous topic, analyze data, mention sources, or ask unnecessary questions.\n`;
    }

    if (sourceCatalog) {
      datasetContext += `\n\n# SOURCE CATALOG\nUse these metadata totals exactly. Dataset row_count is the full uploaded dataset size, not a retrieved sample count.\n`;
      datasetContext += `\n## Datasets (${sourceCatalog.collections.length})\n`;
      for (const c of sourceCatalog.collections) {
        datasetContext += `- ${c.name}: ${Number(c.row_count ?? 0).toLocaleString("en-US")} total rows${c.description ? ` — ${c.description}` : ""}\n`;
      }
      datasetContext += `\n## Documents (${sourceCatalog.documents.length})\n`;
      for (const d of sourceCatalog.documents) {
        datasetContext += `- ${d.title}: type ${d.doc_type || "other"}, ${Number(d.total_pages ?? 0).toLocaleString("en-US")} total pages\n`;
      }
      datasetContext += `\nFor this catalog question, do not report retrieved rows, matching rows, sample rows, chunks, or pages available. Report only the exact metadata above.\n`;
    }

    if (scope.type !== "all") {
      const scopedDatasetName = scope.type === "dataset" ? rows[0]?.name ?? collections.find((c: any) => c.slug === scope.slug)?.name ?? "the selected dataset" : "";
      datasetContext += `\n\n# USER SELECTED SCOPE\nUse only ${scope.type === "documents" ? "uploaded documents" : `"${scopedDatasetName}"`} unless the user explicitly asks to broaden the scope. Do not mention internal slugs or random suffixes in the final answer.\n`;
    }

    // Priority column hints: derive from the combined retrieval query so columns
    // the user explicitly asks about (e.g. "include the school") are kept in TSV
    // even when other columns are more frequent.
    const priorityHints = Array.from(new Set([
      ...(retrievalQuery.toLowerCase().match(/\b[a-z][a-z_]{2,}\b/g) ?? []),
      ...((analysis?.entities ?? []).flatMap((e) => e.toLowerCase().match(/\b[a-z][a-z_]{2,}\b/g) ?? [])),
      ...((analysis?.metrics ?? []).flatMap((e) => e.toLowerCase().match(/\b[a-z][a-z_]{2,}\b/g) ?? [])),
    ])).filter((w) => !["the","and","for","with","this","that","please","include","show","give","need","summary","table","format","entries","entry","records","record","rows","row","atleast","least","data","details"].includes(w));

    // Inject the analyzer hint at the top so the model sees a clear plan for the question
    if (analysis) {
      datasetContext += `\n\n# QUESTION ANALYSIS (planning hint — use this to structure your answer; do NOT echo it verbatim)\n- Intent: ${analysis.intent}\n- Sub-questions: ${analysis.sub_questions.map((s) => `\n  • ${s}`).join("")}\n- Entities of interest: ${analysis.entities.join(", ") || "(none detected)"}\n- Metrics of interest: ${analysis.metrics.join(", ") || "(none detected)"}\nMake sure your final answer addresses EVERY sub-question above.\n`;
    }


    // PRIORITY: direct school_id matches — always inject first, before any other context
    const hasIdHits = idLookup.schoolMaster.length > 0 || idLookup.datasetMatches.length > 0;
    if (schoolIdCandidates.length > 0) {
      datasetContext += `\n\n# DIRECT SCHOOL ID LOOKUP\n(User mentioned School ID(s): ${schoolIdCandidates.join(", ")}. The following are EXACT matches by school_id from the database. Use these as the authoritative answer.)\n`;
      if (!hasIdHits) {
        datasetContext += `\nNo records found for: ${schoolIdCandidates.join(", ")}\n`;
      }
      if (idLookup.schoolMaster.length > 0) {
        const { tsv, included } = packRowsTSV(idLookup.schoolMaster, PER_COLLECTION_BUDGET, priorityHints, 80);
        datasetContext += `\n## Schools Master — ${included} exact match(es)\n\`\`\`tsv\n${tsv}\n\`\`\`\n`;
        citations.push({ collection: "Schools Master (ID match)", record_count: idLookup.schoolMaster.length });
      }
      for (const m of idLookup.datasetMatches) {
        const { tsv, included, columns, allColumns } = packRowsTSV(m.rows, PER_COLLECTION_BUDGET, priorityHints, 80);
        datasetContext += `\n### AVAILABLE COLUMNS (${allColumns.length})\n${allColumns.join(", ")}\n`;
        datasetContext += `\n### TSV COLUMNS SHOWN (${columns.length})\n${columns.join(", ")}\n`;
        datasetContext += `\n## Collection: ${m.collection_name} (slug: ${m.collection_slug}) — ${included} exact match(es) by school_id\n\`\`\`tsv\n${tsv}\n\`\`\`\n`;
        citations.push({ collection: `${m.collection_name} (ID match)`, record_count: m.rows.length });
      }
    }

    if (rows.length > 0 || schoolRows.length > 0) {
      datasetContext += `\n\n# DATASET CONTEXT\n(Render the provided rows in your table — do not truncate the sample. For totals/counts/sums/averages, USE the "NUMERIC SUMMARY" block (it covers ALL matching rows in the DB), not the TSV sample. When the matching row count exceeds the sample size, explicitly tell the user the totals are computed from all M matching rows, while only N rows are shown.)\n`;
      for (const r of rows) {
        const { tsv, included, columns, allColumns } = packRowsTSV(r.data, PER_COLLECTION_BUDGET, priorityHints, 40);
        datasetContext += `\n## Collection: ${r.name} (slug: ${r.collection})${r.sheet ? ` — sheet: ${r.sheet}` : ""} — rows shown: ${included} of ${r.data.length} fetched, matching rows in DB: ${r.total}\n`;
        datasetContext += `\n### AVAILABLE COLUMNS (${allColumns.length})\n${allColumns.join(", ")}\n`;
        datasetContext += `\n### TSV COLUMNS SHOWN (${columns.length})\n${columns.join(", ")}\n`;
        if (r.numericSummary && Object.keys(r.numericSummary).length > 0) {
          datasetContext += `\n### NUMERIC SUMMARY (computed in DB over ALL ${r.total} matching rows)\n\`\`\`json\n${JSON.stringify(r.numericSummary)}\n\`\`\`\n`;
        }
        if (Array.isArray(r.groupedSummary) && r.groupedSummary.length > 0) {
          datasetContext += `\n### GROUPED NUMERIC SUMMARY (computed in DB over ALL ${r.total} matching rows)\nUse this block for rankings, distributions, and by-group comparisons. Do not estimate from sample rows.\n\`\`\`json\n${JSON.stringify(r.groupedSummary)}\n\`\`\`\n`;
        }
        const qualityNotes = summarizeDataQuality(r.data);
        if (qualityNotes.length > 0) {
          datasetContext += `\n### DATA QUALITY NOTES (retrieved sample only)\n${qualityNotes.map((note) => `- ${note}`).join("\n")}\n`;
        }
        datasetContext += `\n### SAMPLE ROWS — TSV (${included} of ${r.data.length} fetched; ${r.total} matching in DB)\n\`\`\`tsv\n${tsv}\n\`\`\`\n`;
        citations.push({ collection: r.name, record_count: r.data.length, total: r.total });
        auditSources.push({ type: "dataset", collection: r.collection, name: r.name, row_ids: r.ids?.slice(0, 200) ?? [], record_count: r.data.length, total: r.total });
      }
      if (schoolRows.length > 0) {
        const { tsv, included } = packRowsTSV(schoolRows, PER_COLLECTION_BUDGET, priorityHints);
        datasetContext += `\n## Collection: Schools Master — rows shown: ${included} of ${schoolRows.length} fetched\n\`\`\`tsv\n${tsv}\n\`\`\`\n`;
        citations.push({ collection: "Schools Master", record_count: schoolRows.length });
      }
    } else if (collections.length > 0) {
      datasetContext += `\n\n# DATASET CONTEXT\n(No matching rows found across ${collections.length} candidate collection(s).)\n`;
    }



    // Append document (PDF/DOCX) context — separate from tabular data.
    // All chunks here have been validated against the DB for correct page mapping.
    if (docResults.length > 0) {
      datasetContext += `\n\n# DOCUMENT CONTEXT\n(Excerpts from official DepEd documents. Page numbers have been validated against the source. Quote or summarize these passages when answering. ALWAYS add an inline page marker like (p.X) right after a claim, and list every page used in the final Sources block.)\n`;
      for (const d of docResults) {
        const pages = Array.from(new Set(d.chunks.map((c) => c.page).filter((p): p is number => typeof p === "number"))).sort((a, b) => a - b);
        const pagesLabel = pages.length > 0 ? pages.join(", ") : "n/a";
        const totalLabel = d.totalPages > 0 ? ` of ${d.totalPages}` : "";
        datasetContext += `\n## Document: "${d.docTitle}" (${d.docType}) — pages available: ${pagesLabel}${totalLabel}\n`;
        for (const c of d.chunks) {
          const pageTag = c.page ? `[p.${c.page}]` : `[p.n/a]`;
          const sectionTag = c.section ? ` — **${c.section}**` : "";
          datasetContext += `\n${pageTag}${sectionTag}\n${c.content}\n`;
        }
        citations.push({ collection: `doc:${d.docTitle}`, record_count: d.chunks.length });
        auditSources.push({ type: "document", document_id: d.docId, document_title: d.docTitle, chunk_ids: d.chunks.map((c) => c.id), pages });
      }
    }

    // Keep internal collection slugs out of user-facing model context.
    datasetContext = datasetContext
      .replace(/\s+\(slug:\s*[^)]+\)/g, "")
      .replace(/dataset with slug "[^"]+"/g, "selected dataset");

    // Hard cap context size to fit within model's 128k token window (leave room for system+history+completion)
    if (datasetContext.length > MAX_CONTEXT_CHARS) {
      datasetContext = datasetContext.slice(0, MAX_CONTEXT_CHARS) + "\n\n[...context truncated to fit token budget. NUMERIC SUMMARY blocks above already cover all matching rows.]\n";
    }

    // Inject context into the last user message
    const enriched = messages.map((m: any, i: number) =>
      i === messages.length - 1 && m.role === "user"
        ? { ...m, content: m.content + datasetContext }
        : m
    );

    // Also trim prior chat history if it's huge — keep only last 6 turns
    const trimmedHistory = casualMessage
      ? [enriched[enriched.length - 1]]
      : enriched.length > 6 ? [enriched[0], ...enriched.slice(-6)] : enriched;

    const systemPrompt = `${systemPromptOverride ?? buildSystemPrompt(citationFormat)}${buildRuntimeGuardrails(userQ)}`;
    const aiResp = await callAI(chatModel, [
      { role: "system", content: systemPrompt },
      ...trimmedHistory,
    ], true, undefined, { max_tokens: maxTokens, temperature });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500;
      const msg = aiResp.status === 429 ? "Rate limits exceeded, please try again later."
                : aiResp.status === 402 ? "AI credits exhausted. Add funds in Workspace settings."
                : "AI gateway error";
      // log analytics error
      await supabase.from("chat_analytics").insert({ user_id: userId, conversation_id, was_error: true, latency_ms: Date.now() - t0 });
      return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Stream upstream + inject custom thinking & citation events
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const stream = new ReadableStream({
      async start(controller) {
        // thinking events
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ _thinking: rows.length > 0 ? `Found ${rows.reduce((s, r) => s + r.data.length, 0)} relevant rows` : "Searching datasets…" })}\n\n`));
        await new Promise((r) => setTimeout(r, 80));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ _thinking: "Analyzing & composing response…" })}\n\n`));
        // citations up front
        for (const c of citations) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ _citation: c })}\n\n`));
        }
        const reader = aiResp.body!.getReader();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (line.trim()) controller.enqueue(encoder.encode(line + "\n"));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();

        // analytics (fire-and-forget)
        await supabase.from("chat_analytics").insert({
          user_id: userId,
          conversation_id,
          collections_used: citations.map((c) => c.collection),
          latency_ms: Date.now() - t0,
        });
        if (userId && auditSources.length > 0) {
          const { data: profile } = await supabase.from("profiles").select("email,full_name").eq("id", userId).maybeSingle();
          const actorName = profile?.full_name || profile?.email?.split("@")[0] || "Authenticated user";
          await supabase.from("audit_logs").insert({
            event_type: "CONTEXT_USED_IN_CHAT",
            actor_user_id: userId,
            actor_display_name: actorName,
            entity_type: "conversation",
            entity_id: conversation_id ?? null,
            entity_name: "Chat conversation",
            metadata: { sources: auditSources, conversation_id },
          });
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("chat error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
