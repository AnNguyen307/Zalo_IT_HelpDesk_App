const SYSTEM_ICON_PATTERN = /(?:[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})?)*)/gu;

export function plainSystemText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(SYSTEM_ICON_PATTERN, "")
    .replace(/[\uFE0E\uFE0F\u200D]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n|\n[ \t]+/g, "\n")
    .trim();
  return text || fallback;
}
