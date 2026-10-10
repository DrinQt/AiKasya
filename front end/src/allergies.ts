export const allergenIds = [
  "peanuts",
  "treeNuts",
  "dairy",
  "eggs",
  "fish",
  "shellfish",
  "soy",
  "wheat",
  "sesame",
] as const;
export type AllergenId = (typeof allergenIds)[number];
const backendTerms: Record<AllergenId, string> = {
  peanuts: "peanut",
  treeNuts: "tree nuts",
  dairy: "milk",
  eggs: "egg",
  fish: "fish",
  shellfish: "shellfish",
  soy: "soy",
  wheat: "wheat",
  sesame: "sesame",
};
export function allergyTerms(preferences: AllergyPreferences): string[] {
  if (preferences.status !== "restricted") return [];
  return [
    ...preferences.allergens.map((id) => backendTerms[id]),
    ...preferences.custom,
  ];
}
export type AllergyPreferences = {
  status: "unknown" | "none" | "restricted";
  allergens: AllergenId[];
  custom: string[];
  other: boolean;
};
export function emptyAllergies(
  status: "unknown" | "none" = "unknown",
): AllergyPreferences {
  return { status, allergens: [], custom: [], other: false };
}
export function readAllergies(value: unknown): AllergyPreferences {
  if (!value || typeof value !== "object") return emptyAllergies();
  const saved = value as Partial<AllergyPreferences>;
  const allergens = Array.isArray(saved.allergens)
    ? [
        ...new Set(
          saved.allergens.filter((id): id is AllergenId =>
            allergenIds.includes(id),
          ),
        ),
      ]
    : [];
  const custom = Array.isArray(saved.custom)
    ? saved.custom
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 60))
        .filter(Boolean)
        .filter(
          (item, index, items) =>
            items.findIndex(
              (x) => x.toLocaleLowerCase() === item.toLocaleLowerCase(),
            ) === index,
        )
    : [];
  if (allergens.length || custom.length)
    return {
      status: "restricted",
      allergens,
      custom,
      other: custom.length > 0 || saved.other === true,
    };
  return emptyAllergies(saved.status === "none" ? "none" : "unknown");
}
