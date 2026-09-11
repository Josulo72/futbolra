import { getStore, getDeployStore } from "@netlify/blobs";
import porra from "../lib/porra.js";

// Porra compartida: una sola entrada JSON con jornada, participantes y bote.
const KEY = "game";

function getGameStore() {
  if (Netlify.context?.deploy?.context === "production") {
    return getStore({ name: "futbolra", consistency: "strong" });
  }
  return getDeployStore("futbolra");
}

// ---------- Directo: ESPN (Madrid, Barça) y TheSportsDB (Ponferradina) ----------

const LIVE_REFRESH_MS = 45 * 1000;
const MATCH_WINDOW_MS = 4 * 60 * 60 * 1000; // margen para partidos largos o retrasados

function espnEventLabel(typeText: string) {
  const t = typeText.toLowerCase();
  if (t.includes("own goal")) return { type: "goal", label: "Gol en propia puerta" };
  if (t.includes("penalty") && (t.includes("scored") || t.includes("goal"))) return { type: "goal", label: "Gol de penalti" };
  if (t.startsWith("goal")) return { type: "goal", label: "Gol" };
  if (t.includes("red card")) return { type: "card", label: "Tarjeta roja" };
  if (t.includes("yellow card")) return { type: "card", label: "Tarjeta amarilla" };
  if (t === "kickoff") return { type: "period", label: "Comienza el partido" };
  if (t === "halftime") return { type: "period", label: "Descanso" };
  if (t === "start 2nd half") return { type: "period", label: "Comienza la segunda parte" };
  if (t.includes("end regular time") || t.includes("full time") || t === "end game") {
    return { type: "period", label: "Final del partido" };
  }
  return null;
}

async function fetchEspnLive(eventId: string) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=${eventId}`);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const d = await res.json();
  const comp = d.header?.competitions?.[0];
  const state = comp?.status?.type?.state;
  const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
  const events = (d.keyEvents || [])
    .map((k: any) => {
      const info = espnEventLabel(k.type?.text || "");
      if (!info) return null;
      const player = k.participants?.[0]?.athlete?.displayName;
      const team = k.team?.displayName;
      const who = [player, team && `(${team})`].filter(Boolean).join(" ");
      return {
        id: `espn-${k.id}`,
        type: info.type,
        minute: (k.clock?.displayValue || "").replace(/'$/, ""),
        description: info.type === "period" ? info.label : `${info.label}${who ? `: ${who}` : ""}`,
      };
    })
    .filter(Boolean);
  return {
    status: state === "post" ? "finished" : state === "in" ? "live" : "scheduled",
    score1: home?.score != null ? parseInt(home.score, 10) : null,
    score2: away?.score != null ? parseInt(away.score, 10) : null,
    events,
  };
}

async function fetchSportsDbLive(eventId: string) {
  const res = await fetch(`https://www.thesportsdb.com/api/v1/json/123/lookupevent.php?id=${eventId}`);
  if (!res.ok) throw new Error(`TheSportsDB ${res.status}`);
  const e = (await res.json()).events?.[0];
  if (!e) throw new Error("Evento no encontrado");
  const status = String(e.strStatus || "").toUpperCase();
  const finished = ["FT", "AET", "PEN", "MATCH FINISHED"].includes(status);
  const notStarted = ["NS", "", "NOT STARTED", "TBD"].includes(status);
  const hasScore = e.intHomeScore != null && e.intAwayScore != null;
  return {
    status: finished ? "finished" : notStarted ? "scheduled" : "live",
    score1: hasScore ? parseInt(e.intHomeScore, 10) : null,
    score2: hasScore ? parseInt(e.intAwayScore, 10) : null,
    events: null, // la clave gratuita no da goleadores ni tarjetas
  };
}

async function fetchLiveUpdates(game: any) {
  const now = Date.now();
  const due = game.matches.filter((m: any) => {
    if (m.status === "finished" || !m.date) return false;
    const start = new Date(m.date).getTime();
    return now >= start && now <= start + MATCH_WINDOW_MS;
  });
  const updates: Record<string, any> = {};
  await Promise.all(
    due.map(async (m: any) => {
      try {
        const [source, id] = String(m.id).split(/-(.+)/);
        updates[m.id] = source === "espn" ? await fetchEspnLive(id) : await fetchSportsDbLive(id);
      } catch (error) {
        console.error(`Directo no disponible para ${m.id}:`, error);
      }
    })
  );
  return updates;
}

const json = (data: any, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export default async (req: Request) => {
  const store = getGameStore();
  let game = { ...porra.emptyGame(), ...((await store.get(KEY, { type: "json" })) || {}) };

  if (porra.seedParticipants(game)) await store.setJSON(KEY, game);

  if (req.method === "GET") {
    const lastCheck = game.liveCheckedAt ? new Date(game.liveCheckedAt).getTime() : 0;
    if (Date.now() - lastCheck >= LIVE_REFRESH_MS && game.matches?.length) {
      const updates = await fetchLiveUpdates(game);
      // Relee antes de escribir para no pisar altas o pronósticos recientes
      game = { ...porra.emptyGame(), ...((await store.get(KEY, { type: "json" })) || game) };
      porra.applyLiveUpdates(game, updates);
      game.liveCheckedAt = new Date().toISOString();
      await store.setJSON(KEY, game);
    }
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
