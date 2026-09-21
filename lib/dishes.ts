import data from "@/data/dishes.json";

export interface Dish {
  id: string;
  name: string;
  kind: string;
  alsoCalled: string[];
  blurb: string;
  ingredients: string[];
  where: string;
  visual: string;
}

export const dishes = data as Dish[];
export const dishById = new Map(dishes.map((d) => [d.id, d]));
