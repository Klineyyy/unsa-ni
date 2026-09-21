// The sentences CLIP compares a photo against, for each dish. Several phrasings per dish, because a model
// reads "a photo of adobo" and "adobo, braised meat in a dark sauce" a little differently and the average is
// steadier than either.
export interface DishText {
  name: string;
  kind: string;
  alsoCalled: string[];
  visual: string;
}

export function promptsFor(d: DishText): string[] {
  const names = [d.name, ...d.alsoCalled.map((a) => a.replace(/"/g, ""))];
  return [
    ...names.map((n) => `a photo of ${n}, a Filipino dish.`),
    `${d.name}: ${d.visual}.`,
    `a plate of ${d.name}, Filipino food.`,
    `a photo of ${d.visual}.`,
  ];
}

/** For the "not a Filipino dish" class: other foods, and things that aren't food at all. */
export const OTHER_PROMPTS = [
  "a photo of pizza.",
  "a photo of sushi.",
  "a photo of a hamburger.",
  "a photo of a salad.",
  "a photo of spaghetti.",
  "a photo of a steak.",
  "a photo of a cake.",
  "a photo of fruit.",
  "a photo of a cat.",
  "a photo of a dog.",
  "a photo of a car.",
  "a photo of a person.",
  "a photo of a landscape.",
  "a photo of something that is not food.",
];
