const Match = require('../../src/core/Match');

describe('Match', () => {
  let match;

  beforeEach(() => {
    match = new Match({
      team1: 'Real Madrid',
      team2: 'FC Barcelona',
      team1Logo: '/logos/real-madrid.png',
      team2Logo: '/logos/fc-barcelona.png',
      date: '2026-09-14T16:00:00Z',
      time: '18:00',
      round: 1,
      weekendMatch: true
    });
  });

  describe('constructor', () => {
    test('creates a match with all properties', () => {
      expect(match.team1).toBe('Real Madrid');
      expect(match.team2).toBe('FC Barcelona');
      expect(match.round).toBe(1);
      expect(match.weekendMatch).toBe(true);
      expect(match.status).toBe('scheduled');
      expect(match.score1).toBeNull();
      expect(match.score2).toBeNull();
    });

    test('generates unique ID', () => {
      const match2 = new Match({});
      expect(match.id).not.toBe(match2.id);
    });
  });

  describe('isWeekend', () => {
    test('returns true for Saturday', () => {
      const saturday = new Match({ date: '2026-09-12T16:00:00Z' });
      expect(saturday.isWeekend()).toBe(true);
    });

    test('returns true for Sunday', () => {
      const sunday = new Match({ date: '2026-09-13T16:00:00Z' });
      expect(sunday.isWeekend()).toBe(true);
    });

    test('returns true for Monday', () => {
      const monday = new Match({ date: '2026-09-14T16:00:00Z' });
      expect(monday.isWeekend()).toBe(true);
    });

    test('returns false for Tuesday', () => {
      const tuesday = new Match({ date: '2026-09-15T16:00:00Z' });
      expect(tuesday.isWeekend()).toBe(false);
    });

    test('returns false for Wednesday', () => {
      const wednesday = new Match({ date: '2026-09-16T16:00:00Z' });
      expect(wednesday.isWeekend()).toBe(false);
    });

    test('returns false when no date', () => {
      const noDate = new Match({});
      expect(noDate.isWeekend()).toBe(false);
    });
  });

  describe('isLive', () => {
    test('returns true when status is live', () => {
      match.status = 'live';
      expect(match.isLive()).toBe(true);
    });

    test('returns false when status is scheduled', () => {
      match.status = 'scheduled';
      expect(match.isLive()).toBe(false);
    });

    test('returns false when status is finished', () => {
      match.status = 'finished';
      expect(match.isLive()).toBe(false);
    });
  });

  describe('isFinished', () => {
    test('returns true when status is finished', () => {
      match.status = 'finished';
      expect(match.isFinished()).toBe(true);
    });

    test('returns false when status is scheduled', () => {
      match.status = 'scheduled';
      expect(match.isFinished()).toBe(false);
    });
  });

  describe('getScore', () => {
    test('returns null when scores are null', () => {
      expect(match.getScore()).toBeNull();
    });

    test('returns formatted score when both scores set', () => {
      match.score1 = 2;
      match.score2 = 1;
      expect(match.getScore()).toBe('2-1');
    });
  });

  describe('getWinner', () => {
    test('returns null when scores are null', () => {
      expect(match.getWinner()).toBeNull();
    });

    test('returns team1 when team1 wins', () => {
      match.score1 = 2;
      match.score2 = 1;
      expect(match.getWinner()).toBe('Real Madrid');
    });

    test('returns team2 when team2 wins', () => {
      match.score1 = 1;
      match.score2 = 3;
      expect(match.getWinner()).toBe('FC Barcelona');
    });

    test('returns draw when tied', () => {
      match.score1 = 2;
      match.score2 = 2;
      expect(match.getWinner()).toBe('draw');
    });
  });

  describe('updateScore', () => {
    test('updates scores and sets status to finished', () => {
      match.updateScore(3, 1);
      expect(match.score1).toBe(3);
      expect(match.score2).toBe(1);
      expect(match.status).toBe('finished');
    });
  });

  describe('addEvent', () => {
    test('adds event with timestamp and unique ID', () => {
      match.addEvent({ type: 'goal', minute: 23, description: 'Gol de Benzema' });
      expect(match.events.length).toBe(1);
      expect(match.events[0]).toHaveProperty('id');
      expect(match.events[0]).toHaveProperty('timestamp');
      expect(match.events[0].type).toBe('goal');
      expect(match.events[0].minute).toBe(23);
    });
  });

  describe('toJSON/fromJSON', () => {
    test('serializes and deserializes correctly', () => {
      match.score1 = 2;
      match.score2 = 1;
      match.status = 'finished';
      match.addEvent({ type: 'goal', minute: 45, description: 'Gol' });

      const json = match.toJSON();
      const restored = Match.fromJSON(json);

      expect(restored.id).toBe(match.id);
      expect(restored.team1).toBe(match.team1);
      expect(restored.team2).toBe(match.team2);
      expect(restored.score1).toBe(2);
      expect(restored.score2).toBe(1);
      expect(restored.status).toBe('finished');
      expect(restored.events.length).toBe(1);
    });
  });
});