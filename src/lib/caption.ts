import type { Detection } from "../types";

const IRREGULAR_PLURALS: Record<string, string> = {
  person: "people",
  mouse: "mice",
  sheep: "sheep",
};

const VOWEL_SOUND_EXCEPTIONS = new Set(["hour", "honor"]);

function pluralize(label: string, count: number) {
  if (count === 1) return label;
  if (IRREGULAR_PLURALS[label]) return IRREGULAR_PLURALS[label];
  if (label.endsWith("s") || label.endsWith("x") || label.endsWith("ch")) {
    return `${label}es`;
  }
  if (label.endsWith("y") && !/[aeiou]y$/i.test(label)) {
    return `${label.slice(0, -1)}ies`;
  }
  return `${label}s`;
}

function withArticle(label: string) {
  const firstWord = label.trim().split(/\s+/)[0].toLowerCase();
  const article = /^[aeiou]/.test(firstWord) || VOWEL_SOUND_EXCEPTIONS.has(firstWord)
    ? "an"
    : "a";
  return `${article} ${label}`;
}

function joinNatural(parts: string[]) {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function horizontalPosition(detection: Detection, imageWidth: number) {
  const center = (detection.box.xmin + detection.box.xmax) / 2 / imageWidth;
  if (center < 0.34) return "on the left";
  if (center > 0.66) return "on the right";
  return "near the center";
}

export function generateAltText(
  detections: Detection[],
  imageWidth: number,
  maxLabels = 5,
) {
  const relevant = detections
    .filter((item) => item.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (relevant.length === 0) {
    return "No objects were detected with enough confidence. Add a short description in your own words.";
  }

  const groups = new Map<string, Detection[]>();
  for (const detection of relevant) {
    const list = groups.get(detection.label) ?? [];
    list.push(detection);
    groups.set(detection.label, list);
  }

  const ranked = [...groups.entries()]
    .sort(([, a], [, b]) => Math.max(...b.map((item) => item.score)) - Math.max(...a.map((item) => item.score)))
    .slice(0, maxLabels);

  const subjects = ranked.map(([label, items]) =>
    items.length === 1 ? withArticle(label) : `${items.length} ${pluralize(label, items.length)}`,
  );

  const subjectPhrase = joinNatural(subjects);
  const overview = `${subjectPhrase.charAt(0).toUpperCase()}${subjectPhrase.slice(1)} ${subjects.length === 1 ? "is" : "are"} visible.`;

  const positions = ranked
    .filter(([, items]) => items.length === 1)
    .slice(0, 3)
    .map(([label, items]) => `the ${label} is ${horizontalPosition(items[0], imageWidth)}`);

  if (positions.length < 2) return overview;
  const positionSentence = `${joinNatural(positions)}.`;
  return `${overview} ${positionSentence.charAt(0).toUpperCase()}${positionSentence.slice(1)}`;
}
