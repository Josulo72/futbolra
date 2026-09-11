import { getStore, getDeployStore } from "@netlify/blobs";

// Porra compartida: una sola entrada JSON con jornada, participantes y bote.
const KEY = "game";

function getGameStore() {
  if (Netlify.context?.deploy?.context === "production") {
    return getStore({ name: "futbolra", consistency: "strong" });
  }
  return getDeployStore("futbolra");
}

const emptyGame = () => ({
  matches: [],
  participants: [],
  currentRound: 0,
  pot: 0,
  journeyLocked: false,
  journeyStartDate: null,
  journeyEndDate: null,
});

const isRealJourney = (matches: any[]) =>
  matches.length > 0 && matches.every((m) => /^(espn|tsdb)-/.test(String(m.id)));

function isValidParticipant(p: any) {
  return (
    p &&
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    p.name.trim().length >= 2 &&
    p.name.trim().length <= 50 &&
    typeof p.predictions === "object"
  );
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

// Aplica marcadores y eventos; al terminar un partido elimina a quien no acertó
function applyLiveUpdates(game: any, updates: Record<string, any>) {
  for (const match of game.matches) {
    const u = updates[match.id];
    if (!u || match.status === "finished") continue;
    match.status = u.status;
    if (u.score1 !== null && u.score2 !== null) {
      match.score1 = u.score1;
      match.score2 = u.score2;
    }
    if (u.events) match.events = u.events;

    // Si ya solo queda uno activo, es el ganador y no se elimina a nadie más
    const stillActive = game.participants.filter((p: any) => p.active).length;
    if (u.status === "finished" && match.score1 !== null && match.score2 !== null && stillActive > 1) {
      for (const p of game.participants) {
        if (!p.active) continue;
        const pred = p.predictions?.[match.id];
        if (!pred || pred.score1 !== match.score1 || pred.score2 !== match.score2) {
          p.active = false;
          p.eliminatedAt = new Date().toISOString();
          p.eliminatedInMatch = match.id;
        }
      }
    }
  }
  if (game.matches.some((m: any) => m.status !== "scheduled")) game.journeyLocked = true;
}

export default async (req: Request) => {
  const store = getGameStore();
  let stored = (await store.get(KEY, { type: "json" })) || emptyGame();

  if (req.method === "GET") {
    const lastCheck = stored.liveCheckedAt ? new Date(stored.liveCheckedAt).getTime() : 0;
    if (Date.now() - lastCheck >= LIVE_REFRESH_MS && stored.matches?.length) {
      const updates = await fetchLiveUpdates(stored);
      // Relee antes de escribir para no pisar altas o pronósticos recientes
      stored = (await store.get(KEY, { type: "json" })) || stored;
      applyLiveUpdates(stored, updates);
      stored.liveCheckedAt = new Date().toISOString();
      await store.setJSON(KEY, stored);
    }
    return Response.json(stored, { headers: { "Cache-Control": "no-store" } });
  }

  if (req.method !== "POST") {
    return new Response("Método no permitido", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const game = { ...emptyGame(), ...stored };

  // Nueva jornada: solo si es posterior a la guardada o si la guardada no es real
  const journey = body?.journey;
  if (journey && Array.isArray(journey.matches) && isRealJourney(journey.matches)) {
    const newer = (journey.currentRound || 0) > (game.currentRound || 0);
    if (newer || !isRealJourney(game.matches)) {
      game.matches = journey.matches;
      game.currentRound = journey.currentRound;
      game.journeyStartDate = journey.journeyStartDate || null;
      game.journeyEndDate = journey.journeyEndDate || null;
      game.journeyLocked = false;
      game.participants = game.participants.map((p: any) => ({
        ...p,
        active: true,
        eliminatedAt: null,
        eliminatedInMatch: null,
        points: 0,
      }));
    }
  }

  // Baja de un participante
  if (typeof body?.leave === "string") {
    game.participants = game.participants.filter((p: any) => p.id !== body.leave);
  }

  // Alta o actualización de un participante, sin tocar a los demás
  const participant = body?.participant;
  if (participant) {
    if (!isValidParticipant(participant)) {
      return new Response("Participante no válido", { status: 400 });
    }
    const matchIds = new Set(game.matches.map((m: any) => m.id));
    const firstMatch = game.matches
      .map((m: any) => new Date(m.date))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];
    const started = firstMatch && new Date() >= firstMatch;

    const index = game.participants.findIndex((p: any) => p.id === participant.id);
    const current = index >= 0 ? game.participants[index] : null;

    // Una vez empezada la jornada no se aceptan pronósticos nuevos
    const predictions = started
      ? current?.predictions || {}
      : Object.fromEntries(
          Object.entries(participant.predictions).filter(([id]) => matchIds.has(id))
        );

    const merged = {
      ...(current || { active: true, eliminatedAt: null, eliminatedInMatch: null, points: 0 }),
      id: participant.id,
      name: participant.name.trim(),
      predictions,
    };

    if (index >= 0) game.participants[index] = merged;
    else game.participants.push(merged);
  }

  await store.setJSON(KEY, game);
  return Response.json(game, { headers: { "Cache-Control": "no-store" } });
};

export const config = {
  path: "/api/game",
};
