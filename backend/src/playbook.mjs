import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";
import { clamp, normalizeText, nowIso } from "./utils.mjs";
import { loadPublishedManagedPlaybook, updatePlaybookIndexState } from "./playbook-governance.mjs";

let playbookCache = null;
let playbookCacheMtime = 0;
let indexCache = null;
let queryEmbeddingCache = new Map();
let buildPromise = null;
let queuedReindex = null;
let playbookCacheCheckedAt = 0;

function normalizeEntry(entry) {
  return {
    ...entry,
    id: String(entry.id || entry.slug || "").trim(),
    title: String(entry.title || "").trim(),
    category: String(entry.category || "other").trim(),
    audience: String(entry.audience || "technician").trim(),
    risk: String(entry.risk || "medium").trim(),
    priority: String(entry.priority || "normal").trim(),
    summary: String(entry.summary || "").trim(),
    steps: Array.isArray(entry.steps) ? entry.steps.map(String).filter(Boolean) : [],
    requiredQuestions: Array.isArray(entry.requiredQuestions) ? entry.requiredQuestions.map(String).filter(Boolean) : [],
    forbiddenSteps: Array.isArray(entry.forbiddenSteps) ? entry.forbiddenSteps.map(String).filter(Boolean) : [],
    keywords: Array.isArray(entry.keywords) ? entry.keywords.map(String).filter(Boolean) : [],
    sourceRefs: Array.isArray(entry.sourceRefs) ? entry.sourceRefs : [],
    active: entry.active !== false,
    approved: entry.approved !== false,
    autoEligible: Boolean(entry.autoEligible),
    sourceType: String(entry.sourceType || "playbook"),
    version: String(entry.version || "1.0"),
  };
}

function searchableText(entry) {
  return [
    entry.id,
    entry.title,
    entry.category,
    entry.summary,
    ...(entry.symptoms || []),
    ...(entry.keywords || []),
    ...(entry.requiredQuestions || []),
    ...(entry.steps || []),
    ...(entry.forbiddenSteps || []),
    entry.content || "",
  ].filter(Boolean).join("\n").slice(0, config.playbookMaxEntryChars);
}

async function fileFingerprint(filePath) {
  const body = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(body).digest("hex");
}

export function invalidatePlaybookCache() {
  playbookCache = null;
  playbookCacheMtime = 0;
  playbookCacheCheckedAt = 0;
  indexCache = null;
  queryEmbeddingCache.clear();
}

async function loadFilePlaybook({ force = false } = {}) {
  const stat = await fs.stat(config.playbookFile);
  if (!force && playbookCache && playbookCache.source === "file" && stat.mtimeMs === playbookCacheMtime) return playbookCache;
  const raw = JSON.parse(await fs.readFile(config.playbookFile, "utf8"));
  const entries = (Array.isArray(raw) ? raw : raw.entries || [])
    .map(normalizeEntry)
    .filter((entry) => entry.id && entry.title && entry.active && entry.approved);
  playbookCache = {
    metadata: Array.isArray(raw) ? {} : { ...raw, entries: undefined },
    entries,
    fingerprint: await fileFingerprint(config.playbookFile),
    loadedAt: nowIso(),
    source: "file",
  };
  playbookCacheMtime = stat.mtimeMs;
  playbookCacheCheckedAt = Date.now();
  return playbookCache;
}

export async function loadPlaybook({ force = false } = {}) {
  const cacheFresh = playbookCache && Date.now() - playbookCacheCheckedAt < config.playbookGovernanceCacheMs;
  if (!force && cacheFresh) return playbookCache;
  if (config.playbookGovernanceEnabled && config.dbProvider === "sqlserver") {
    try {
      const managed = await loadPublishedManagedPlaybook();
      if (managed?.entries?.length) {
        playbookCache = { ...managed, entries: managed.entries.map(normalizeEntry).filter((entry) => entry.id && entry.title && entry.active && entry.approved) };
        playbookCacheMtime = 0;
        playbookCacheCheckedAt = Date.now();
        return playbookCache;
      }
    } catch (error) {
      console.warn(`[Playbook] Managed source unavailable, using file fallback: ${error.message}`);
    }
  }
  return loadFilePlaybook({ force });
}

function lexicalScore(query, entry) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;
  const haystack = normalizeText(searchableText(entry));
  const tokens = [...new Set(normalizedQuery.split(/\s+/).filter((token) => token.length > 2))];
  if (!tokens.length) return 0;
  let weightedHits = 0;
  for (const token of tokens) {
    if (normalizeText(entry.title).includes(token)) weightedHits += 2.4;
    else if (normalizeText((entry.keywords || []).join(" ")).includes(token)) weightedHits += 1.8;
    else if (haystack.includes(token)) weightedHits += 1;
  }
  const phraseBonus = (entry.keywords || []).some((keyword) => {
    const phrase = normalizeText(keyword);
    return phrase.length > 3 && normalizedQuery.includes(phrase);
  }) ? 0.35 : 0;
  const idBonus = normalizedQuery.includes(normalizeText(entry.id)) ? 0.5 : 0;
  const enterpriseBonus = entry.sourceType === "enterprise-playbook" || entry.sourceType === "enterprise-infrastructure" ? 0.08 : 0;
  return clamp(weightedHits / Math.max(5, tokens.length * 1.8) + phraseBonus + idBonus + enterpriseBonus, 0, 1);
}

function audienceAllowed(entry, audience) {
  if (audience === "all") return true;
  if (entry.audience === "both") return true;
  return entry.audience === audience;
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let a = 0;
  let b = 0;
  for (let index = 0; index < left.length; index += 1) {
    const x = Number(left[index]) || 0;
    const y = Number(right[index]) || 0;
    dot += x * y;
    a += x * x;
    b += y * y;
  }
  return a && b ? dot / Math.sqrt(a * b) : 0;
}

async function readIndex() {
  try {
    const parsed = JSON.parse(await fs.readFile(config.playbookIndexFile, "utf8"));
    indexCache = parsed;
    return parsed;
  } catch {
    indexCache = null;
    return null;
  }
}

async function ollamaEmbed(inputs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.playbookEmbedTimeoutMs);
  try {
    const response = await fetch(`${config.ollamaBaseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.playbookEmbedModel,
        input: inputs,
        truncate: true,
        keep_alive: config.ollamaKeepAlive,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `Ollama embed HTTP ${response.status}`);
    if (!Array.isArray(body.embeddings)) throw new Error("Ollama không trả về embeddings hợp lệ");
    return body.embeddings;
  } finally {
    clearTimeout(timer);
  }
}

export async function buildPlaybookIndex({ force = false } = {}) {
  if (buildPromise) return buildPromise;
  buildPromise = (async () => {
    await updatePlaybookIndexState("building", {}).catch(() => undefined);
    try {
      const playbook = await loadPlaybook({ force });
      const existing = await readIndex();
      if (!force && existing?.sourceFingerprint === playbook.fingerprint && existing?.model === config.playbookEmbedModel) {
        await updatePlaybookIndexState("ready", { sourceFingerprint: existing.sourceFingerprint, indexedEntries: existing.records?.length || 0, error: "" }).catch(() => undefined);
        return existing;
      }
      const records = [];
      const entries = playbook.entries;
      for (let offset = 0; offset < entries.length; offset += config.playbookEmbedBatchSize) {
        const batch = entries.slice(offset, offset + config.playbookEmbedBatchSize);
        const inputs = batch.map(searchableText);
        const embeddings = await ollamaEmbed(inputs);
        batch.forEach((entry, index) => {
          records.push({ id: entry.id, embedding: embeddings[index] || [] });
        });
        console.log(`[Playbook] Indexed ${Math.min(offset + batch.length, entries.length)}/${entries.length}`);
      }
      const index = {
        schemaVersion: 1,
        model: config.playbookEmbedModel,
        generatedAt: nowIso(),
        sourceFingerprint: playbook.fingerprint,
        dimensions: records[0]?.embedding?.length || 0,
        records,
      };
      await fs.mkdir(path.dirname(config.playbookIndexFile), { recursive: true });
      await fs.writeFile(config.playbookIndexFile, `${JSON.stringify(index)}\n`, "utf8");
      indexCache = index;
      queryEmbeddingCache.clear();
      await updatePlaybookIndexState("ready", { sourceFingerprint: index.sourceFingerprint, indexedEntries: records.length, error: "" }).catch(() => undefined);
      return index;
    } catch (error) {
      await updatePlaybookIndexState("failed", { error: error.message }).catch(() => undefined);
      throw error;
    }
  })();
  try {
    return await buildPromise;
  } finally {
    buildPromise = null;
  }
}

async function queryEmbedding(query) {
  const cacheKey = `${config.playbookEmbedModel}:${query}`;
  if (queryEmbeddingCache.has(cacheKey)) return queryEmbeddingCache.get(cacheKey);
  const [embedding] = await ollamaEmbed([query]);
  queryEmbeddingCache.set(cacheKey, embedding);
  if (queryEmbeddingCache.size > 100) queryEmbeddingCache.delete(queryEmbeddingCache.keys().next().value);
  return embedding;
}

export function queuePlaybookReindex({ requestedBy = "system" } = {}) {
  invalidatePlaybookCache();
  if (queuedReindex) return queuedReindex;
  queuedReindex = (async () => {
    await updatePlaybookIndexState("queued", { requestedBy }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await updatePlaybookIndexState("building", { requestedBy }).catch(() => undefined);
    try {
      const index = await buildPlaybookIndex({ force: true });
      await updatePlaybookIndexState("ready", {
        requestedBy,
        sourceFingerprint: index.sourceFingerprint,
        indexedEntries: index.records.length,
        error: "",
      }).catch(() => undefined);
      return index;
    } catch (error) {
      await updatePlaybookIndexState("failed", { requestedBy, error: error.message }).catch(() => undefined);
      console.error(`[Playbook] Automatic reindex failed: ${error.message}`);
      throw error;
    } finally {
      queuedReindex = null;
    }
  })();
  queuedReindex.catch(() => undefined);
  return queuedReindex;
}

export async function searchPlaybook(query, {
  audience = "employee",
  category = "",
  limit = config.playbookTopK,
  minScore = config.playbookMinScore,
  semantic = config.playbookSemantic,
} = {}) {
  if (!config.playbookEnabled) return [];
  const playbook = await loadPlaybook();
  let candidates = playbook.entries.filter((entry) => audienceAllowed(entry, audience));
  if (category) candidates = candidates.filter((entry) => entry.category === category || entry.category === "other");

  const lexical = new Map(candidates.map((entry) => [entry.id, lexicalScore(query, entry)]));
  let semanticScores = new Map();
  let semanticUsed = false;
  if (semantic && config.agentMode === "ollama") {
    try {
      let index = indexCache || await readIndex();
      if ((!index || index.sourceFingerprint !== playbook.fingerprint || index.model !== config.playbookEmbedModel) && config.playbookAutoIndex) {
        index = await buildPlaybookIndex();
      }
      if (index?.records?.length) {
        const vector = await queryEmbedding(query);
        const candidateIds = new Set(candidates.map((entry) => entry.id));
        semanticScores = new Map(index.records
          .filter((record) => candidateIds.has(record.id))
          .map((record) => [record.id, clamp(cosineSimilarity(vector, record.embedding), 0, 1)]));
        semanticUsed = true;
      }
    } catch (error) {
      console.warn(`[Playbook] Semantic search unavailable: ${error.message}`);
    }
  }

  return candidates
    .map((entry) => {
      const lexicalValue = lexical.get(entry.id) || 0;
      const semanticValue = semanticScores.get(entry.id) || 0;
      const score = semanticUsed
        ? clamp(lexicalValue * config.playbookLexicalWeight + semanticValue * (1 - config.playbookLexicalWeight), 0, 1)
        : lexicalValue;
      return { ...entry, score, lexicalScore: lexicalValue, semanticScore: semanticValue, semanticUsed };
    })
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const sourceRank = (value) => value === "enterprise-playbook" ? 3 : value === "enterprise-infrastructure" ? 2 : 1;
      return sourceRank(b.sourceType) - sourceRank(a.sourceType);
    })
    .slice(0, limit);
}

export async function getPlaybookStatus({ force = false } = {}) {
  try {
    const playbook = await loadPlaybook({ force });
    const index = force ? await readIndex() : (indexCache || await readIndex());
    const byAudience = {};
    const byCategory = {};
    for (const entry of playbook.entries) {
      byAudience[entry.audience] = (byAudience[entry.audience] || 0) + 1;
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    }
    const indexCurrent = Boolean(index && index.sourceFingerprint === playbook.fingerprint && index.model === config.playbookEmbedModel);
    return {
      enabled: config.playbookEnabled,
      name: playbook.metadata.name || "Enterprise Playbook",
      version: playbook.metadata.version || "",
      file: playbook.source === "sqlserver-governance" ? "SQL Server / helpdesk.playbook_*" : path.relative(config.backendRoot, config.playbookFile).replaceAll("\\", "/"),
      source: playbook.source || "file",
      totalEntries: playbook.entries.length,
      byAudience,
      byCategory,
      semanticEnabled: config.playbookSemantic,
      embedModel: config.playbookEmbedModel,
      indexExists: Boolean(index),
      indexCurrent,
      indexedEntries: index?.records?.length || 0,
      indexGeneratedAt: index?.generatedAt || null,
      ready: config.playbookEnabled && playbook.entries.length > 0,
      security: playbook.metadata.security || {},
      error: null,
      checkedAt: nowIso(),
    };
  } catch (error) {
    return {
      enabled: config.playbookEnabled,
      ready: false,
      totalEntries: 0,
      error: String(error?.message || error),
      checkedAt: nowIso(),
    };
  }
}
