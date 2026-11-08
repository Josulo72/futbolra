import porra from "./porra.js";

// Directo: ESPN (Madrid, Barça) y Flashscore (Ponferradina). Lo usan la tarea programada
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

// Reloj del partido: la web calcula el minuto a partir del inicio de la parte en curso
function espnClock(comp: any) {
  const st = comp?.status;
  if (st?.type?.state !== "in") return null;
  if (String(st.type?.name || "").includes("HALFTIME")) return { label: "Descanso" };
  const period = Number(st.period);
  const secs = Number(st.clock);
  if ((period !== 1 && period !== 2) || !Number.isFinite(secs)) return { label: "En juego" };
  const inHalf = period === 2 ? Math.max(0, secs - 2700) : secs;
  return { half: period, start: Date.now() - inHalf * 1000 };
}

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
  return { status: espnStatus(comp.status?.type?.state), ...espnScores(comp), events, clock: espnClock(comp) };
}

// Respaldo: marcador y estado desde la clasificación del día, sin goleadores ni tarjetas
async function fetchEspnScoreboard(eventId: string, date: string) {
  const day = new Date(date).toISOString().slice(0, 10).replace(/-/g, "");
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=${day}`);
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
  const event = ((await res.json()).events || []).find((e: any) => String(e.id) === eventId);
  if (!event) throw new Error("Partido no encontrado en el scoreboard");
  const comp = event.competitions?.[0];
  return { status: espnStatus(comp?.status?.type?.state), ...espnScores(comp), events: null, clock: espnClock(comp) };
}

async function fetchEspnLive(eventId: string, date: string) {
  try {
    return await fetchEspnSummary(eventId);
  } catch (error) {
    console.error(`Resumen de ESPN no disponible para ${eventId}:`, error);
    return fetchEspnScoreboard(eventId, date);
  }
}

// ---------- Flashscore (Ponferradina): marcador, goles, tarjetas y partes ----------

const FS_FEED = "https://global.flashscore.ninja/2/x/feed/";
const FS_HEADERS = { "x-fsign": "SW9D1eZo", "User-Agent": "Mozilla/5.0" };
const FS_TEAM = "ponferradina";
const MADRID_TZ = "Europe/Madrid";

async function fsFeed(name: string) {
  const res = await fetch(FS_FEED + name, { headers: FS_HEADERS });
  if (!res.ok) throw new Error(`Flashscore ${res.status}`);
  return res.text();
}

// Registros "~" con campos "CLAVE÷valor¬"
function fsRecords(text: string) {
  return text.split("~").map((rec) => {
    const fields: Record<string, string[]> = {};
    for (const part of rec.split("¬")) {
      const i = part.indexOf("÷");
      if (i > 0) (fields[part.slice(0, i)] ||= []).push(part.slice(i + 1));
    }
    return fields;
  });
}

const madridDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: MADRID_TZ }).format(d);

// Busca el partido en la lista del día de Flashscore
async function findFlashscoreMatch(date: string) {
  const when = new Date(date);
  const offset = Math.round((Date.parse(madridDay(when)) - Date.parse(madridDay(new Date()))) / 86400000);
  const recs = fsRecords(await fsFeed(`f_1_${offset}_1_es_1`));
  const match = recs.find((r) => {
    const teams = `${r.AE?.[0] || ""} ${r.AF?.[0] || ""}`.toLowerCase();
    const start = Number(r.AD?.[0]) * 1000;
    return r.AA && teams.includes(FS_TEAM) && Math.abs(start - when.getTime()) < 6 * 3600 * 1000;
  });
  if (!match) throw new Error("Partido no encontrado en Flashscore");
  return match;
}

function fsIncident(kind: string) {
  const k = kind.toLowerCase();
  if (k.includes("own goal")) return { type: "goal", label: "Gol en propia puerta" };
  if (k.includes("penalty") && !k.includes("missed")) return { type: "goal", label: "Gol de penalti" };
  if (k === "goal") return { type: "goal", label: "Gol" };
  if (k.includes("red")) return { type: "card", label: "Tarjeta roja" };
  if (k.includes("yellow")) return { type: "card", label: "Tarjeta amarilla" };
  return null;
}

async function fetchFlashscoreLive(date: string) {
  const m = await findFlashscoreMatch(date);
  const ab = m.AB?.[0];
  const status = ab === "3" ? "finished" : ab === "1" ? "scheduled" : "live";
  const num = (v?: string[]) => (v?.[0] != null && v[0] !== "" ? parseInt(v[0], 10) : null);
  const score1 = num(m.AG);
  const score2 = num(m.AH);
  const teams: Record<string, string> = { "1": m.AE?.[0] || "", "2": m.AF?.[0] || "" };

  const events: any[] = [];
  if (status !== "scheduled") {
    events.push({ id: "fs-start", type: "period", minute: "0", description: "Comienza el partido" });
    const recs = fsRecords(await fsFeed(`df_sui_1_${m.AA[0]}`));
    for (const r of recs) {
      const period = (r.AC?.[0] || "").toLowerCase();
      if (period === "2nd half") {
        events.push({ id: "fs-ht", type: "period", minute: "45", description: "Final de la primera parte" });
        events.push({ id: "fs-2h", type: "period", minute: "46", description: "Comienza la segunda parte" });
      }
      if (!r.III) continue;
      const info = fsIncident(r.IK?.[0] || "");
      if (!info) continue;
      const team = teams[r.IA?.[0] || ""];
      const who = [r.IF?.[0], team && `(${team})`].filter(Boolean).join(" ");
      events.push({
        id: `fs-${r.III[0]}`,
        type: info.type,
        minute: (r.IB?.[0] || "").replace(/'$/, ""),
        description: `${info.label}${who ? `: ${who}` : ""}`,
      });
    }
    if (status === "finished") {
      events.push({ id: "fs-end", type: "period", minute: "90", description: "Final del partido" });
    }
  }
  // AC: 12 primera parte, 13 segunda, 38 descanso. AO: inicio de la parte en curso
  const stage = m.AC?.[0];
  const periodStart = Number(m.AO?.[0]) * 1000;
  let clock: any = null;
  if (status === "live") {
    if (stage === "38") clock = { label: "Descanso" };
    else if ((stage === "12" || stage === "13") && periodStart) clock = { half: stage === "12" ? 1 : 2, start: periodStart };
    else clock = { label: "En juego" };
  }
  return { status, score1, score2, events, clock };
}

async function fetchLiveUpdates(due: any[]) {
  const updates: Record<string, any> = {};
  await Promise.all(
    due.map(async (m: any) => {
      try {
        const [source, id] = String(m.id).split(/-(.+)/);
        updates[m.id] = source === "espn" ? await fetchEspnLive(id, m.date) : await fetchFlashscoreLive(m.date);
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
