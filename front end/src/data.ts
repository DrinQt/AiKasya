export type GroceryItem = {
  id: string;
  name: string;
  fil: string;
  quantity: string;
  price: number;
  checked: boolean;
};
export type PantryItem = {
  id: string;
  name: string;
  fil?: string;
  quantity: string;
  emoji: string;
};
export type Message = {
  id: string;
  role: "assistant" | "user";
  text?: string;
  key?: "chatHello" | "chatReply";
  plan?: boolean;
  localPlan?: import("./api").Plan;
};
export const groceries: GroceryItem[] = [
  {
    id: "pork",
    name: "Pork",
    fil: "Baboy",
    quantity: "300g",
    price: 120,
    checked: true,
  },
  {
    id: "tomato",
    name: "Tomatoes",
    fil: "Kamatis",
    quantity: "3 pcs",
    price: 15,
    checked: true,
  },
  {
    id: "onion",
    name: "Onions",
    fil: "Sibuyas",
    quantity: "5 pcs",
    price: 15,
    checked: true,
  },
  {
    id: "garlic",
    name: "Garlic",
    fil: "Bawang",
    quantity: "1 bulb",
    price: 10,
    checked: true,
  },
  {
    id: "greens",
    name: "Vegetables",
    fil: "Gulay",
    quantity: "1 bunch",
    price: 20,
    checked: false,
  },
  {
    id: "oil",
    name: "Cooking oil",
    fil: "Mantika",
    quantity: "1 small bottle",
    price: 35,
    checked: false,
  },
];
export const pantry: PantryItem[] = [
  { id: "rice", name: "Rice", fil: "Bigas", quantity: "1 kg", emoji: "🍚" },
  { id: "egg", name: "Eggs", fil: "Itlog", quantity: "6 pcs", emoji: "🥚" },
  {
    id: "onion",
    name: "Onions",
    fil: "Sibuyas",
    quantity: "5 pcs",
    emoji: "🧅",
  },
  {
    id: "garlic",
    name: "Garlic",
    fil: "Bawang",
    quantity: "1 bulb",
    emoji: "🧄",
  },
  {
    id: "tomato",
    name: "Tomatoes",
    fil: "Kamatis",
    quantity: "3 pcs",
    emoji: "🍅",
  },
];
export const recipes = [
  {
    id: "adobo",
    name: "Adobo",
    side: "Garlic rice + Vegetables",
    filSide: "Sinangag + Gulay",
    emoji: "🍲",
    cost: 170,
    ingredientIds: ["pork", "garlic", "oil", "greens"],
  },
  {
    id: "monggo",
    name: "Monggo",
    side: "Egg + Vegetables",
    filSide: "Itlog + Gulay",
    emoji: "🥘",
    cost: 125,
    ingredientIds: ["tomato", "onion", "greens"],
  },
];
