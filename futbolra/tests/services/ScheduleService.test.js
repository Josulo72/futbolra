const { ScheduleService } = require('../../public/src/services/ScheduleService');
const GameManager = require('../../public/src/core/GameManager');
const Match = require('../../public/src/core/Match');

describe('ScheduleService', () => {
  let scheduleService;
  let gameManager;

  beforeEach(() => {
    scheduleService = new ScheduleService();
    gameManager = new GameManager();
    scheduleService.setGameManager(gameManager);
  });

  describe('getNextWeekendDate', () => {
    test('returns Saturday when today is Monday', () => {
      const monday = new Date('2026-09-14T10:00:00Z');
      jest.useFakeTimers().setSystemTime(monday);
      
      const nextWeekend = scheduleService.getNextWeekendDate();
      expect(nextWeekend.getDay()).toBe(6);
      expect(nextWeekend.getHours()).toBe(0);
      
      jest.useRealTimers();
    });

    test('returns Saturday when today is Friday', () => {
      const friday = new Date('2026-09-18T10:00:00Z');
      jest.useFakeTimers().setSystemTime(friday);
      
      const nextWeekend = scheduleService.getNextWeekendDate();
      expect(nextWeekend.getDay()).toBe(6);
      
      jest.useRealTimers();
    });

    test('returns next Saturday when today is Saturday', () => {
      const saturday = new Date('2026-09-19T10:00:00Z');
      jest.useFakeTimers().setSystemTime(saturday);
      
      const nextWeekend = scheduleService.getNextWeekendDate();
      expect(nextWeekend.getDay()).toBe(6);
      expect(nextWeekend.getTime()).toBeGreaterThan(saturday.getTime());
      
      jest.useRealTimers();
    });

    test('returns next Saturday when today is Sunday', () => {
      const sunday = new Date('2026-09-20T10:00:00Z');
      jest.useFakeTimers().setSystemTime(sunday);
      
      const nextWeekend = scheduleService.getNextWeekendDate();
      expect(nextWeekend.getDay()).toBe(6);
      expect(nextWeekend.getTime()).toBeGreaterThan(sunday.getTime());
      
      jest.useRealTimers();
    });
  });

  describe('generateNextJourney', () => {
    test('creates 3 matches with correct team order', () => {
      const matches = gameManager.generateNextJourney();
      
      expect(matches.length).toBe(3);
      expect(matches[0].team1).toBe('Real Madrid');
      expect(matches[1].team1).toBe('FC Barcelona');
      expect(matches[2].team1).toBe('SD Ponferradina');
    });

    test('sets all matches as weekend matches', () => {
      const matches = gameManager.generateNextJourney();
      matches.forEach(match => {
        expect(match.weekendMatch).toBe(true);
        expect(match.isWeekend()).toBe(true);
      });
    });

    test('sets consecutive dates starting from Saturday', () => {
      const matches = gameManager.generateNextJourney();
      
      const dates = matches.map(m => new Date(m.date).getDay());
      expect(dates[0]).toBe(6);
      expect(dates[1]).toBe(0);
      expect(dates[2]).toBe(1);
    });
  });

  describe('getJourneyStatus', () => {
    test('returns empty when no matches', () => {
      expect(scheduleService.getJourneyStatus()).toBe('empty');
    });

    test('returns open when before first match and not locked', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      
      gameManager.initializeJourney([{
        id: 'match-1',
        date: futureDate.toISOString(),
        weekendMatch: true
      }]);
      
      expect(scheduleService.getJourneyStatus()).toBe('open');
    });

    test('returns locked when before first match but locked', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      
      gameManager.initializeJourney([{
        id: 'match-1',
        date: futureDate.toISOString(),
        weekendMatch: true
      }]);
      gameManager.lockJourney();
      
      expect(scheduleService.getJourneyStatus()).toBe('locked');
    });

    test('returns live when during journey', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      gameManager.initializeJourney([{
        id: 'match-1',
        date: pastDate.toISOString(),
        weekendMatch: true
      }, {
        id: 'match-2',
        date: futureDate.toISOString(),
        weekendMatch: true
      }]);
      
      expect(scheduleService.getJourneyStatus()).toBe('live');
    });

    test('usa las fechas aunque los partidos no estén en orden', () => {
      // Orden fijo Madrid, Barça, Ponfe: el último del array puede ser el primero en jugarse
      const inTwoDays = new Date();
      inTwoDays.setDate(inTwoDays.getDate() + 2);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      gameManager.initializeJourney([{
        id: 'match-madrid',
        date: inTwoDays.toISOString(),
        weekendMatch: true
      }, {
        id: 'match-ponfe',
        date: yesterday.toISOString(),
        weekendMatch: true
      }]);

      expect(scheduleService.getJourneyStatus()).toBe('live');
      expect(scheduleService.isJourneyActive()).toBe(true);
    });

    test('returns finished when after last match', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      
      gameManager.initializeJourney([{
        id: 'match-1',
        date: pastDate.toISOString(),
        weekendMatch: true
      }]);
      
      expect(scheduleService.getJourneyStatus()).toBe('finished');
    });
  });

  describe('canMakePredictions', () => {
    test('returns true when journey open and not active', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      
      gameManager.initializeJourney([{
        id: 'match-1',
        date: futureDate.toISOString(),
        weekendMatch: true
      }]);
      
      expect(scheduleService.canMakePredictions()).toBe(true);
    });

    test('returns false when journey locked', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      
      gameManager.initializeJourney([{
        id: 'match-1',
        date: futureDate.toISOString(),
        weekendMatch: true
      }]);
      gameManager.lockJourney();
      
      expect(scheduleService.canMakePredictions()).toBe(false);
    });

    test('returns false when journey active', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      gameManager.initializeJourney([{
        id: 'match-1',
        date: pastDate.toISOString(),
        weekendMatch: true
      }, {
        id: 'match-2',
        date: futureDate.toISOString(),
        weekendMatch: true
      }]);
      
      expect(scheduleService.canMakePredictions()).toBe(false);
    });
  });

  describe('getNextResetTime', () => {
    test('returns next Tuesday 6AM', () => {
      const wednesday = new Date('2026-09-16T10:00:00Z');
      jest.useFakeTimers().setSystemTime(wednesday);
      
      const nextReset = scheduleService.getNextResetTime();
      expect(nextReset.getDay()).toBe(2);
      expect(nextReset.getHours()).toBe(6);
      
      jest.useRealTimers();
    });

    test('returns today 6AM if today is Tuesday before 6AM', () => {
      // Use local date for Tuesday 4AM
      const tuesdayEarly = new Date();
      tuesdayEarly.setDate(15);
      tuesdayEarly.setMonth(8); // September (0-indexed)
      tuesdayEarly.setFullYear(2026);
      tuesdayEarly.setHours(4, 0, 0, 0);
      jest.useFakeTimers().setSystemTime(tuesdayEarly);
      
      const nextReset = scheduleService.getNextResetTime();
      expect(nextReset.getDay()).toBe(2);
      expect(nextReset.getHours()).toBe(6);
      expect(nextReset.getDate()).toBe(tuesdayEarly.getDate());
      
      jest.useRealTimers();
    });

    test('returns next Tuesday if today is Tuesday after 6AM', () => {
      const tuesdayLate = new Date();
      tuesdayLate.setDate(15);
      tuesdayLate.setMonth(8);
      tuesdayLate.setFullYear(2026);
      tuesdayLate.setHours(8, 0, 0, 0);
      jest.useFakeTimers().setSystemTime(tuesdayLate);
      
      const nextReset = scheduleService.getNextResetTime();
      expect(nextReset.getDay()).toBe(2);
      expect(nextReset.getDate()).toBe(tuesdayLate.getDate() + 7);
      
      jest.useRealTimers();
    });
  });

  describe('formatTimeUntilReset', () => {
    test('formats days and hours', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T10:00:00Z'));
      
      const formatted = scheduleService.formatTimeUntilReset();
      expect(formatted).toMatch(/\d+d \d+h/);
      
      jest.useRealTimers();
    });
  });

  describe('validateWeekendMatches', () => {
    test('returns true when all matches are weekend', () => {
      const matches = [
        new Match({ date: '2026-09-19T16:00:00Z', weekendMatch: true }),
        new Match({ date: '2026-09-20T16:00:00Z', weekendMatch: true }),
        new Match({ date: '2026-09-21T16:00:00Z', weekendMatch: true })
      ];
      
      expect(scheduleService.validateWeekendMatches(matches)).toBe(true);
    });

    test('returns false when any match is not weekend', () => {
      const matches = [
        new Match({ date: '2026-09-19T16:00:00Z', weekendMatch: true }),
        new Match({ date: '2026-09-22T16:00:00Z', weekendMatch: false }),
        new Match({ date: '2026-09-21T16:00:00Z', weekendMatch: true })
      ];
      
      expect(scheduleService.validateWeekendMatches(matches)).toBe(false);
    });
  });
});