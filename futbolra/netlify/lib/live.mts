import porra from "./porra.js";

// Directo: ESPN (Madrid, Barça) y TheSportsDB (Ponferradina). Lo usan la tarea programada
// y, como respaldo, las visitas a la web.

export const KEY = "game";

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

const espnStatus = (state: string) => (state === "post" ? "finished" : state === "in" ? "live" : "scheduled");

function espnScores(comp: any) {
  const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
  return {
    score1: home?.score != null ? parseInt(home.score, 10) : null,
    score2: away?.score != null ? parseInt(away.score, 10) : null,
  };
}

async function fetchEspnSummary(eventId: string) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=${eventId}`);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const d = await res.json();
  const comp = d.header?.competitions?.[0];
  if (!comp) throw new Error("ESPN sin datos del partido");
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
  return { status: espnStatus(comp.status?.type?.state), ...espnScores(comp), events };
}

// Respaldo: marcador y estado desde la clasificación del día, sin goleadores ni tarjetas
async function fetchEspnScoreboard(eventId: string, date: string) {
  const day = new Date(date).toISOString().slice(0, 10).replace(/-/g, "");
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=${day}`);
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
  const event = ((await res.json()).events || []).find((e: any) => String(e.id) === eventId);
  if (!event) throw new Error("Partido no encontrado en el scoreboard");
  const comp = event.competitions?.[0];
  return { status: espnStatus(comp?.status?.type?.state), ...espnScores(comp), events: null };
}

async function fetchEspnLive(eventId: string, date: string) {
  try {
    return await fetchEspnSummary(eventId);
  } catch (error) {
    console.error(`Resumen de ESPN no disponible para ${eventId}:`, error);
    return fetchEspnScoreboard(eventId, date);
  }
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

async function fetchLiveUpdates(due: any[]) {
  const updates: Record<string, any> = {};
  await Promise.all(
    due.map(async (m: any) => {
      try {
        const [source, id] = String(m.id).split(/-(.+)/);
        updates[m.id] = source === "espn" ? await fetchEspnLive(id, m.date) : await fetchSportsDbLive(id);
      } catch (error) {
        console.error(`Directo no disponible para ${m.id}:`, error);
      }
    })
  );
  return updates;
}

// Consulta los partidos pendientes y guarda el marcador. Sin partidos pendientes no toca nada.
export async function refreshLive(store: any, game: any) {
  const due = porra.dueMatches(game);
  if (due.length === 0) return game;
  const updates = await fetchLiveUpdates(due);
  // Relee antes de escribir para no pisar altas o pronósticos recientes
  const fresh = { ...porra.emptyGame(), ...((await store.get(KEY, { type: "json" })) || game) };
  porra.applyLiveUpdates(fresh, updates);
  fresh.liveCheckedAt = new Date().toISOString();
  await store.setJSON(KEY, fresh);
  return fresh;
}
