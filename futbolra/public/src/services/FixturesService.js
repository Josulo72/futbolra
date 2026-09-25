// Partidos reales: ESPN para Real Madrid y Barcelona, TheSportsDB para la Ponferradina.
const FIXTURE_TEAMS = [
  { name: 'Real Madrid', source: 'espn', id: '86' },
  { name: 'FC Barcelona', source: 'espn', id: '83' },
  { name: 'SD Ponferradina', source: 'thesportsdb', id: '134697' }
];

const ESPN_URL = (id) => `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams/${id}/schedule?fixture=true`;
const SPORTSDB_URL = (id) => `https://www.thesportsdb.com/api/v1/json/123/eventsnext.php?id=${id}`;

const MADRID_TZ = 'Europe/Madrid';
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

class FixturesService {
  constructor(fetchFn) {
    this.fetchFn = fetchFn || ((...args) => fetch(...args));
  }

  // Fecha y día de la semana en hora española, que es la que decide en qué fin de semana cae un partido
  static madridParts(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: MADRID_TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const get = (type) => parts.find(p => p.type === type)?.value;
    return {
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      weekday: WEEKDAY_INDEX[get('weekday')]
    };
  }

  // Sábado, domingo o lunes
  static isWeekendDate(date) {
    const { weekday } = FixturesService.madridParts(date);
    return weekday === 6 || weekday === 0 || weekday === 1;
  }

  // Sábado que abre el fin de semana del partido (YYYY-MM-DD). El domingo y el lunes
  // pertenecen al mismo fin de semana que el sábado anterior.
  static weekendKey(date) {
    const { year, month, day, weekday } = FixturesService.madridParts(date);
    const back = weekday === 6 ? 0 : weekday === 0 ? 1 : weekday === 1 ? 2 : null;
    if (back === null) return null;
    return new Date(Date.UTC(year, month - 1, day) - back * DAY_MS).toISOString().slice(0, 10);
  }

  // Los tres partidos tienen que ser del mismo fin de semana
  static sameWeekend(dates) {
    const keys = dates.map(d => FixturesService.weekendKey(new Date(d)));
    return keys.length > 0 && keys.every(k => k !== null && k === keys[0]);
  }

  async getJson(url) {
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.json();
  }

  async fetchEspnEvents(team, now) {
    const data = await this.getJson(ESPN_URL(team.id));
    const events = (data.events || [])
      .map(e => {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find(c => c.homeAway === 'home');
        const away = comp?.competitors?.find(c => c.homeAway === 'away');
        if (!home || !away) return null;
        return {
          id: `espn-${e.id}`,
          date: new Date(e.date),
          team1: home.team.displayName,
          team2: away.team.displayName,
          team1Logo: home.team.logos?.[0]?.href || '',
          team2Logo: away.team.logos?.[0]?.href || ''
        };
      })
      .filter(Boolean);
    return this.upcomingWeekend(events, now, team);
  }

  async fetchSportsDbEvents(team, now) {
    const data = await this.getJson(SPORTSDB_URL(team.id));
    const events = (data.events || []).map(e => ({
      id: `tsdb-${e.idEvent}`,
      date: new Date(`${e.dateEvent}T${e.strTime || '00:00:00'}Z`),
      team1: e.strHomeTeam,
      team2: e.strAwayTeam,
      team1Logo: e.strHomeTeamBadge || '',
      team2Logo: e.strAwayTeamBadge || ''
    }));
    return this.upcomingWeekend(events, now, team);
  }

  // Próximos partidos de fin de semana del equipo, por fecha
  upcomingWeekend(events, now, team) {
    const next = events
      .filter(e => !isNaN(e.date) && e.date >= now && FixturesService.isWeekendDate(e.date))
      .sort((a, b) => a.date - b.date);
    if (next.length === 0) throw new Error(`No hay próximo partido de fin de semana para ${team.name}`);
    return next;
  }

  // Primer fin de semana en el que juegan todos los equipos, y el partido de cada uno en él.
  // Así la jornada nunca mezcla fines de semana: si LaLiga para por selecciones y la
  // Ponferradina no, se espera al fin de semana en que vuelven los tres.
  pickCommonWeekend(eventsByTeam) {
    const keyed = eventsByTeam.map(events =>
      events.map(e => ({ ...e, weekend: FixturesService.weekendKey(e.date) }))
    );
    const candidates = [...new Set(keyed[0].map(e => e.weekend))].sort();
    for (const weekend of candidates) {
      const picks = keyed.map(events => events.find(e => e.weekend === weekend));
      if (picks.every(Boolean)) return picks;
    }
    const names = FIXTURE_TEAMS.map(t => t.name).join(', ');
    throw new Error(`No hay un fin de semana en el que jueguen todos: ${names}`);
  }

  // Devuelve los 3 partidos en orden: Madrid, Barça, Ponferradina
  async getNextJourney(now = new Date()) {
    const eventsByTeam = await Promise.all(FIXTURE_TEAMS.map(team =>
      team.source === 'espn' ? this.fetchEspnEvents(team, now) : this.fetchSportsDbEvents(team, now)
    ));
    return this.pickCommonWeekend(eventsByTeam).map(r => ({
      id: r.id,
      team1: r.team1,
      team2: r.team2,
      team1Logo: r.team1Logo,
      team2Logo: r.team2Logo,
      date: r.date.toISOString(),
      time: r.date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: MADRID_TZ }),
      weekendMatch: true
    }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FixturesService, FIXTURE_TEAMS };
}
