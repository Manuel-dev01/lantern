/**
 * The memories the landing page is built around.
 *
 * Plain data in a plain module, deliberately: the showcase that animates them
 * is a client component, and a value exported from a "use client" file is a
 * client reference on the server, not an array. Importing it into the page
 * gave `undefined.text` at build time.
 *
 * These are real memories from the product - the same ones that seeded the
 * constellation - not invented marketing copy. The hue and position describe
 * the light behind each: a kitchen in Lagos is not the same colour as a roof
 * at six o'clock.
 */
export interface Memory {
  to: string;
  from: string;
  place: string;
  text: string;
  short: string;
  hue: number;
  chroma: number;
  y: number;
  tall: boolean;
}

export const MEMORIES: Memory[] = [
  {
    to: "Mum",
    from: "Emmanuel",
    place: "kitchen, lagos",
    text: "Her kitchen in Lagos, always too hot, always smelling of fried plantain.",
    short: "Her kitchen in Lagos, always too hot, always smelling of fried plantain.",
    hue: 78,
    chroma: 0.12,
    y: 46,
    tall: true,
  },
  {
    to: "Aunty Ngozi",
    from: "Chidinma",
    place: "front room, enugu",
    text:
      "The front room in Enugu where she sewed. A treadle machine by the window, scraps of ankara on the floor, the fan turning slow in the heat.",
    short: "The front room in Enugu where she sewed.",
    hue: 62,
    chroma: 0.1,
    y: 40,
    tall: true,
  },
  {
    to: "Tobi",
    from: "Kemi",
    place: "the roof",
    text:
      "The roof of the block of flats we grew up in, where we went to get away from everyone. Cracked concrete, a water tank, aerials, and the whole city going orange at six o\u2019clock.",
    short: "The roof of the block of flats we grew up in, where we went to get away from everyone.",
    hue: 45,
    chroma: 0.15,
    y: 74,
    tall: false,
  },
];
