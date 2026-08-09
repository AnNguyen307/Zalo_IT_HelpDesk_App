const REDACTION_RULES = [
  {
    type: "credential",
    pattern: /\b(?:password|mật\s*khẩu|mat\s*khau|otp|token|api[_ -]?key|secret)\s*[:=]\s*[^\s,;]+/giu,
  },
  {
    type: "bearer_token",
    pattern: /\bbearer\s+[a-z0-9._~+\/-]+=*/giu,
  },
  {
    type: "email",
    pattern: /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/giu,
  },
  {
    type: "phone",
    pattern: /(?<!\d)(?:\+?84|0)(?:[ .-]?\d){9,10}(?!\d)/gu,
  },
  {
    type: "ip_address",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu,
  },
];

function redactString(value, counts) {
  let result = String(value || "");
  for (const rule of REDACTION_RULES) {
    result = result.replace(rule.pattern, () => {
      counts[rule.type] = (counts[rule.type] || 0) + 1;
      return `<REDACTED_${rule.type.toUpperCase()}>`;
    });
  }
  return result;
}

function redactValue(value, counts, seen) {
  if (typeof value === "string") return redactString(value, counts);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, counts, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, counts, seen)]));
}

export function redactSensitiveData(value, { enabled = true } = {}) {
  if (!enabled) {
    return {
      value: structuredClone(value),
      summary: { applied: false, replacementCount: 0, replacementsByType: {} },
    };
  }
  const counts = {};
  const redacted = redactValue(value, counts, new WeakSet());
  const replacementCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    value: redacted,
    summary: { applied: true, replacementCount, replacementsByType: counts },
  };
}
