import { getStore } from "@netlify/blobs";
import porra from "../lib/porra.js";
import { KEY, refreshLive } from "../lib/live.mts";

// Actualiza el directo sin depender de que alguien tenga la web abierta.
// Las tareas programadas solo corren en producción.
export default async () => {
  const store = getStore({ name: "futbolra", consistency: "strong" });
  const game = { ...porra.emptyGame(), ...((await store.get(KEY, { type: "json" })) || {}) };
  await refreshLive(store, game);
};

export const config = {
  schedule: "*/2 * * * *",
};
