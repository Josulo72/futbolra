// Partidos reales: ESPN para Real Madrid y Barcelona, TheSportsDB para la Ponferradina.
const FIXTURE_TEAMS = [
  { name: 'Real Madrid', source: 'espn', id: '86' },
  { name: 'FC Barcelona', source: 'espn', id: '83' },
  { name: 'SD Ponferradina', source: 'thesportsdb', id: '134697' }
];

const ESPN_URL = (id) => `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams/${id}/schedule?fixture=true`;
const SPORTSDB_URL = (id) => `https://www.thesportsdb.com/api/v1/json/123/eventsnext.php?id=${id}`;

class FixturesService {
  constructor(fetchFn) {
    this.fetchFn = fetchFn || ((...args) => fetch(...args));
  }

  // Sábado, domingo o lunes
  static isWeekendDate(date) {
    const day = date.getDay();
    return day === 6 || day === 0 || day === 1;
  }

  async getJson(url) {
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.json();
  }

  async fetchEspnNext(team, now) {
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
    return this.pickNext(events, now, team);
  }

  async fetchSportsDbNext(team, now) {
    const data = await this.getJson(SPORTSDB_URL(team.id));
    const events = (data.events || []).map(e => ({
      id: `tsdb-${e.idEvent}`,
      date: new Date(`${e.dateEvent}T${e.strTime || '00:00:00'}Z`),
      team1: e.strHomeTeam,
      team2: e.strAwayTeam,
      team1Logo: e.strHomeTeamBadge || '',
      team2Logo: e.strAwayTeamBadge || ''
    }));
    return this.pickNext(events, now, team);
  }

  pickNext(events, now, team) {
    const next = events
      .filter(e => !isNaN(e.date) && e.date >= now && FixturesService.isWeekendDate(e.date))
      .sort((a, b) => a.date - b.date)[0];
    if (!next) throw new Error(`No hay próximo partido de fin de semana para ${team.name}`);
    return next;
  }

  // Devuelve los 3 partidos en orden: Madrid, Barça, Ponferradina
  async getNextJourney(now = new Date()) {
    const results = await Promise.all(FIXTURE_TEAMS.map(team =>
      team.source === 'espn' ? this.fetchEspnNext(team, now) : this.fetchSportsDbNext(team, now)
    ));
    return results.map(r => ({
      id: r.id,
      team1: r.team1,
      team2: r.team2,
      team1Logo: r.team1Logo,
      team2Logo: r.team2Logo,
      date: r.date.toISOString(),
      time: r.date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }),
      weekendMatch: true
    }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FixturesService, FIXTURE_TEAMS };
}
