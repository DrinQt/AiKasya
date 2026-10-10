export const categories = [
  { id: "produce", en: "Fresh produce", fil: "Sariwang gulay", icon: "🥬" },
  { id: "protein", en: "Meat & eggs", fil: "Karne at itlog", icon: "🥚" },
  {
    id: "staples",
    en: "Pantry staples",
    fil: "Mga pangunahing sangkap",
    icon: "🌾",
  },
  { id: "other", en: "Other ingredients", fil: "Iba pang sangkap", icon: "🧺" },
] as const;
export function categoryOf(item: { id: string; name: string }) {
  const name = `${item.id} ${item.name}`.toLowerCase();
  if (/tomato|onion|garlic|green|vegetable|carrot/.test(name)) return "produce";
  if (/pork|chicken|beef|egg|fish/.test(name)) return "protein";
  if (/rice|oil|salt|sugar|flour/.test(name)) return "staples";
  return "other";
}
export function copy(language: "en" | "fil", en: string, fil: string) {
  return language === "fil" ? fil : en;
}
