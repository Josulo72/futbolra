import { getStore, getDeployStore } from "@netlify/blobs";
import porra from "../lib/porra.js";
import { KEY, refreshLive } from "../lib/live.mts";

// Porra compartida: una sola entrada JSON con jornada, participantes y bote.

function getGameStore() {
  if (Netlify.context?.deploy?.context === "production") {
    return getStore({ name: "futbolra", consistency: "strong" });
  }
  return getDeployStore("futbolra");
}

// Respaldo de la tarea programada: si lleva 5 minutos sin actualizar, lo hace la visita
const LIVE_BACKUP_MS = 5 * 60 * 1000;

const json = (data: any, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export default async (req: Request) => {
  const store = getGameStore();
  let game = { ...porra.emptyGame(), ...((await store.get(KEY, { type: "json" })) || {}) };

  if (porra.seedParticipants(game)) await store.setJSON(KEY, game);

  if (req.method === "GET") {
    const lastCheck = game.liveCheckedAt ? new Date(game.liveCheckedAt).getTime() : 0;
    if (Date.now() - lastCheck >= LIVE_BACKUP_MS) game = await refreshLive(store, game);
    return json(porra.publicGame(game));
  }

  if (req.method !== "POST") {
    return new Response("Método no permitido", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  let result: any = {};
  try {
    if (body?.journey) porra.applyJourney(game, body.journey);
    if (body?.join) porra.addParticipant(game, body.join);
    if (body?.predictions) {
      porra.submitPredictions(game, body.predictions.participantId, body.predictions.predictions);
    }
    if (body?.admin) result = porra.adminAction(game, body.admin) || {};
  } catch (error: any) {
    if (error instanceof porra.PorraError) {
      // Guarda aunque falle cuando cuenta (intentos de código fallidos)
      if (error.persist) await store.setJSON(KEY, game);
      return json({ error: error.message }, error.status);
    }
    throw error;
  }

  await store.setJSON(KEY, game);
  return json({ ...porra.publicGame(game), ...(result.token ? { adminToken: result.token } : {}) });
};

export const config = {
  path: "/api/game",
};
