const { FixturesService } = require('../../public/src/services/FixturesService');

// Respuestas mínimas con la forma de ESPN y TheSportsDB
const espnEvent = (id, date, home, away) => ({
  id,
  date,
  competitions: [{
    competitors: [
      { homeAway: 'home', team: { displayName: home, logos: [{ href: `${home}.png` }] } },
      { homeAway: 'away', team: { displayName: away, logos: [{ href: `${away}.png` }] } }
    ]
  }]
});

const tsdbEvent = (id, dateEvent, strTime, home, away) => ({
  idEvent: id, dateEvent, strTime, strHomeTeam: home, strAwayTeam: away
});

const jsonResponse = (body) => ({ ok: true, json: async () => body });

const fetchFor = (byTeamId) => async (url) => {
  const id = url.match(/teams\/(\d+)\/|id=(\d+)/);
  const teamId = id[1] || id[2];
  return jsonResponse(byTeamId[teamId]);
};

// Viernes 25 de septiembre de 2026, 18:38 hora española
const NOW = new Date('2026-09-25T16:38:00Z');

describe('FixturesService', () => {
  describe('weekendKey', () => {
    test('sábado, domingo y lunes comparten fin de semana', () => {
      expect(FixturesService.weekendKey(new Date('2026-09-26T19:00:00Z'))).toBe('2026-09-26');
      expect(FixturesService.weekendKey(new Date('2026-09-27T16:15:00Z'))).toBe('2026-09-26');
      expect(FixturesService.weekendKey(new Date('2026-09-28T20:00:00Z'))).toBe('2026-09-26');
    });

    test('usa la hora española para decidir el día', () => {
      // Viernes 22:30 UTC es sábado 00:30 en Madrid
      expect(FixturesService.weekendKey(new Date('2026-09-25T22:30:00Z'))).toBe('2026-09-26');
      expect(FixturesService.isWeekendDate(new Date('2026-09-25T22:30:00Z'))).toBe(true);
    });

    test('entre semana no hay fin de semana', () => {
      expect(FixturesService.weekendKey(new Date('2026-09-30T19:00:00Z'))).toBeNull();
      expect(FixturesService.isWeekendDate(new Date('2026-09-30T19:00:00Z'))).toBe(false);
    });
  });

  describe('sameWeekend', () => {
    test('true si todos los partidos caen en el mismo fin de semana', () => {
      expect(FixturesService.sameWeekend([
        '2026-10-10T19:00:00Z', '2026-10-10T16:30:00Z', '2026-10-11T16:15:00Z'
      ])).toBe(true);
    });

    test('false si mezcla fines de semana o falta alguna fecha', () => {
      expect(FixturesService.sameWeekend([
        '2026-10-10T19:00:00Z', '2026-10-10T16:30:00Z', '2026-09-27T16:15:00Z'
      ])).toBe(false);
      expect(FixturesService.sameWeekend(['2026-10-10T19:00:00Z', null])).toBe(false);
      expect(FixturesService.sameWeekend([])).toBe(false);
    });
  });

  describe('getNextJourney', () => {
    test('espera al primer fin de semana en el que juegan los tres', async () => {
      // LaLiga para por selecciones: Madrid y Barça vuelven el 10 de octubre.
      // La Ponferradina juega el 27 de septiembre y el 11 de octubre.
      const service = new FixturesService(fetchFor({
        86: { events: [
          espnEvent('m1', '2026-10-10T19:00Z', 'Real Madrid', 'Villarreal'),
          espnEvent('m2', '2026-10-17T19:00Z', 'Getafe', 'Real Madrid')
        ] },
        83: { events: [
          espnEvent('b1', '2026-10-10T16:30Z', 'Barcelona', 'Getafe'),
          espnEvent('b2', '2026-10-18T19:00Z', 'Sevilla', 'Barcelona')
        ] },
        134697: { events: [
          tsdbEvent('p1', '2026-09-27', '16:15:00', 'Pontevedra', 'Ponferradina'),
          tsdbEvent('p2', '2026-10-11', '16:15:00', 'Ponferradina', 'Real Avilés'),
          tsdbEvent('p3', '2026-10-18', '16:15:00', 'Ponferradina', 'Lugo')
        ] }
      }));

      const journey = await service.getNextJourney(NOW);

      expect(journey.map(m => m.id)).toEqual(['espn-m1', 'espn-b1', 'tsdb-p2']);
      expect(journey[2].team1).toBe('Ponferradina');
      expect(journey[2].team2).toBe('Real Avilés');
      expect(FixturesService.sameWeekend(journey.map(m => m.date))).toBe(true);
      expect(journey[0].time).toBe('21:00');
    });

    test('en una semana normal coge el siguiente partido de cada uno', async () => {
      const service = new FixturesService(fetchFor({
        86: { events: [espnEvent('m1', '2026-09-26T19:00Z', 'Real Madrid', 'Villarreal')] },
        83: { events: [espnEvent('b1', '2026-09-27T19:00Z', 'Barcelona', 'Getafe')] },
        134697: { events: [tsdbEvent('p1', '2026-09-26', '14:00:00', 'Ponferradina', 'Lugo')] }
      }));

      const journey = await service.getNextJourney(NOW);
      expect(journey.map(m => m.id)).toEqual(['espn-m1', 'espn-b1', 'tsdb-p1']);
    });

    test('ignora partidos entre semana y ya jugados', async () => {
      const service = new FixturesService(fetchFor({
        86: { events: [
          espnEvent('m0', '2026-09-19T19:00Z', 'Real Madrid', 'Espanyol'),
          espnEvent('mc', '2026-09-30T19:00Z', 'Real Madrid', 'Juventus'),
          espnEvent('m1', '2026-10-10T19:00Z', 'Real Madrid', 'Villarreal')
        ] },
        83: { events: [
          espnEvent('bc', '2026-10-01T19:00Z', 'Barcelona', 'PSG'),
          espnEvent('b1', '2026-10-10T16:30Z', 'Barcelona', 'Getafe')
        ] },
        134697: { events: [
          tsdbEvent('pc', '2026-09-30', '19:00:00', 'Ponferradina', 'Celta'),
          tsdbEvent('p2', '2026-10-11', '16:15:00', 'Ponferradina', 'Real Avilés')
        ] }
      }));

      const journey = await service.getNextJourney(NOW);
      expect(journey.map(m => m.id)).toEqual(['espn-m1', 'espn-b1', 'tsdb-p2']);
    });

    test('falla con un mensaje claro si no coinciden nunca', async () => {
      const service = new FixturesService(fetchFor({
        86: { events: [espnEvent('m1', '2026-10-10T19:00Z', 'Real Madrid', 'Villarreal')] },
        83: { events: [espnEvent('b1', '2026-10-10T16:30Z', 'Barcelona', 'Getafe')] },
        134697: { events: [tsdbEvent('p1', '2026-09-27', '16:15:00', 'Pontevedra', 'Ponferradina')] }
      }));

      await expect(service.getNextJourney(NOW)).rejects.toThrow('No hay un fin de semana en el que jueguen todos');
    });

    test('falla si un equipo no tiene partidos de fin de semana', async () => {
      const service = new FixturesService(fetchFor({
        86: { events: [espnEvent('m1', '2026-10-10T19:00Z', 'Real Madrid', 'Villarreal')] },
        83: { events: [espnEvent('b1', '2026-10-10T16:30Z', 'Barcelona', 'Getafe')] },
        134697: { events: [] }
      }));

      await expect(service.getNextJourney(NOW)).rejects.toThrow('SD Ponferradina');
    });

    test('propaga errores HTTP', async () => {
      const service = new FixturesService(async () => ({ ok: false, status: 500 }));
      await expect(service.getNextJourney(NOW)).rejects.toThrow('HTTP 500');
    });
  });
});
