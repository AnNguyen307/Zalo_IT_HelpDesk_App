import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";
import { embedTexts, getEmbeddingIdentity, getEmbeddingProviderStatus } from "./embeddings.mjs";
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

function lexicalTokens(value) {
  return normalizeText(value).split(/\s+/).filter((token) => token.length > 2);
}

function termFrequency(tokens) {
  const frequencies = new Map();
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
  return frequencies;
}

export function rankPlaybookLexical(query, entries) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = [...new Set(lexicalTokens(query))];
  if (!normalizedQuery || !queryTokens.length || !entries.length) return new Map(entries.map((entry) => [entry.id, 0]));
  const documents = entries.map((entry) => {
    const tokens = lexicalTokens(searchableText(entry));
    return { entry, tokens, frequencies: termFrequency(tokens) };
  });
  const averageLength = documents.reduce((sum, item) => sum + item.tokens.length, 0) / Math.max(1, documents.length);
  const documentFrequency = new Map(queryTokens.map((token) => [
    token,
    documents.filter((item) => item.frequencies.has(token)).length,
  ]));
  const k1 = 1.5;
  const b = 0.75;
  const rawScores = documents.map(({ entry, tokens, frequencies }) => {
    let bm25 = 0;
    let matched = 0;
    let fieldHits = 0;
    const title = normalizeText(entry.title);
    const keywords = normalizeText((entry.keywords || []).join(" "));
    for (const token of queryTokens) {
      const frequency = frequencies.get(token) || 0;
      if (!frequency) continue;
      matched += 1;
      if (title.includes(token)) fieldHits += 2.4;
      else if (keywords.includes(token)) fieldHits += 1.8;
      else fieldHits += 1;
      const df = documentFrequency.get(token) || 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const denominator = frequency + k1 * (1 - b + b * tokens.length / Math.max(1, averageLength));
      bm25 += idf * (frequency * (k1 + 1)) / denominator;
    }
    return {
      entry,
      bm25,
      coverage: matched / queryTokens.length,
      fieldSignal: clamp(fieldHits / Math.max(2.4, queryTokens.length * 2.4), 0, 1),
    };
  });
  const maximum = Math.max(0, ...rawScores.map((item) => item.bm25));
  return new Map(rawScores.map(({ entry, bm25, coverage, fieldSignal }) => {
    if (!bm25 || !maximum) return [entry.id, 0];
    const normalizedBm25 = bm25 / maximum;
    const phraseBonus = (entry.keywords || []).some((keyword) => {
      const phrase = normalizeText(keyword);
      return phrase.length > 3 && normalizedQuery.includes(phrase);
    }) ? 0.08 : 0;
    const idBonus = normalizedQuery.includes(normalizeText(entry.id)) ? 0.12 : 0;
    const enterpriseBonus = entry.sourceType === "enterprise-playbook" || entry.sourceType === "enterprise-infrastructure" ? 0.03 : 0;
    const score = normalizedBm25 * (0.55 + coverage * 0.35) + fieldSignal * 0.1 + phraseBonus + idBonus + enterpriseBonus;
    return [entry.id, clamp(score, 0, 1)];
  }));
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

export async function buildPlaybookIndex({ force = false } = {}) {
  if (buildPromise) return buildPromise;
  buildPromise = (async () => {
    await updatePlaybookIndexState("building", {}).catch(() => undefined);
    try {
      const playbook = await loadPlaybook({ force });
      const existing = await readIndex();
      const embedding = getEmbeddingProviderStatus();
      const embeddingIdentity = getEmbeddingIdentity();
      if (!force && existing?.sourceFingerprint === playbook.fingerprint && existing?.embeddingIdentity === embeddingIdentity) {
        await updatePlaybookIndexState("ready", { sourceFingerprint: existing.sourceFingerprint, indexedEntries: existing.records?.length || 0, error: "" }).catch(() => undefined);
        return existing;
      }
      const records = [];
      const entries = playbook.entries;
      if (embedding.enabled) {
        for (let offset = 0; offset < entries.length; offset += config.playbookEmbedBatchSize) {
          const batch = entries.slice(offset, offset + config.playbookEmbedBatchSize);
          const inputs = batch.map(searchableText);
          const embeddings = await embedTexts(inputs);
          batch.forEach((entry, index) => {
            records.push({ id: entry.id, embedding: embeddings[index] || [] });
          });
          console.log(`[Playbook] Indexed ${Math.min(offset + batch.length, entries.length)}/${entries.length}`);
        }
      } else {
        records.push(...entries.map((entry) => ({ id: entry.id })));
      }
      const index = {
        schemaVersion: 2,
        provider: embedding.provider,
        model: config.playbookEmbedModel,
        embeddingIdentity,
        retrievalMode: config.playbookRetrievalMode,
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
  const cacheKey = `${getEmbeddingIdentity()}:${query}`;
  if (queryEmbeddingCache.has(cacheKey)) return queryEmbeddingCache.get(cacheKey);
  const [embedding] = await embedTexts([query]);
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

  const lexical = rankPlaybookLexical(query, candidates);
  let semanticScores = new Map();
  let semanticUsed = false;
  if (semantic && config.playbookEmbedProvider !== "none") {
    try {
      let index = indexCache || await readIndex();
      if ((!index || index.sourceFingerprint !== playbook.fingerprint || index.embeddingIdentity !== getEmbeddingIdentity()) && config.playbookAutoIndex) {
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
    const embedding = getEmbeddingProviderStatus();
    const indexCurrent = Boolean(index && index.sourceFingerprint === playbook.fingerprint && index.embeddingIdentity === getEmbeddingIdentity());
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
      retrievalMode: config.playbookRetrievalMode,
      embeddingProvider: embedding.provider,
      embeddingConfigured: embedding.configured,
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
