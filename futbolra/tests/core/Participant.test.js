const Participant = require('../../public/src/core/Participant');
const Match = require('../../public/src/core/Match');

describe('Participant', () => {
  let participant;
  let matches;

  beforeEach(() => {
    participant = new Participant({ name: 'Juan' });
    
    matches = [
      new Match({ id: 'match-1', team1: 'Real Madrid', team2: 'Barcelona', score1: 2, score2: 1, status: 'finished' }),
      new Match({ id: 'match-2', team1: 'Barcelona', team2: 'Atletico', score1: 0, score2: 0, status: 'finished' }),
      new Match({ id: 'match-3', team1: 'Ponferradina', team2: 'Eibar', score1: 1, score2: 2, status: 'finished' })
    ];
  });

  describe('constructor', () => {
    test('creates a participant with all properties', () => {
      expect(participant.name).toBe('Juan');
      expect(participant.active).toBe(true);
      expect(participant.predictions).toEqual({});
      expect(participant.points).toBe(0);
      expect(participant.eliminatedAt).toBeNull();
      expect(participant.eliminatedInMatch).toBeNull();
    });

    test('generates unique ID', () => {
      const p2 = new Participant({ name: 'Pedro' });
      expect(participant.id).not.toBe(p2.id);
    });
  });

  describe('addPrediction', () => {
    test('adds prediction for a match', () => {
      participant.addPrediction('match-1', 2, 1);
      expect(participant.predictions['match-1']).toEqual({ score1: 2, score2: 1 });
    });

    test('overwrites existing prediction', () => {
      participant.addPrediction('match-1', 1, 1);
      participant.addPrediction('match-1', 3, 0);
      expect(participant.predictions['match-1']).toEqual({ score1: 3, score2: 0 });
    });
  });

  describe('getPrediction', () => {
    test('returns prediction when exists', () => {
      participant.addPrediction('match-1', 2, 1);
      expect(participant.getPrediction('match-1')).toEqual({ score1: 2, score2: 1 });
    });

    test('returns null when not exists', () => {
      expect(participant.getPrediction('match-999')).toBeNull();
    });
  });

  describe('hasPrediction', () => {
    test('returns true when prediction exists', () => {
      participant.addPrediction('match-1', 2, 1);
      expect(participant.hasPrediction('match-1')).toBe(true);
    });

    test('returns false when prediction does not exist', () => {
      expect(participant.hasPrediction('match-999')).toBe(false);
    });
  });

  describe('eliminate', () => {
    test('sets active to false and records elimination info', () => {
      participant.eliminate('match-1');
      expect(participant.active).toBe(false);
      expect(participant.eliminatedInMatch).toBe('match-1');
      expect(participant.eliminatedAt).toBeDefined();
    });
  });

  describe('isActive', () => {
    test('returns true for active participant', () => {
      expect(participant.isActive()).toBe(true);
    });

    test('returns false for eliminated participant', () => {
      participant.eliminate('match-1');
      expect(participant.isActive()).toBe(false);
    });
  });

  describe('calculatePoints', () => {
    test('returns 0 when no predictions', () => {
      expect(participant.calculatePoints(matches)).toBe(0);
    });

    test('returns 3 points for exact score match', () => {
      participant.addPrediction('match-1', 2, 1);
      expect(participant.calculatePoints(matches)).toBe(3);
    });

    test('returns 1 point for correct result but wrong score', () => {
      participant.addPrediction('match-1', 3, 1);
      expect(participant.calculatePoints(matches)).toBe(1);
    });

    test('returns 1 point for correct draw', () => {
      participant.addPrediction('match-2', 1, 1);
      expect(participant.calculatePoints(matches)).toBe(1);
    });

    test('returns 0 points for wrong prediction', () => {
      participant.addPrediction('match-1', 0, 3);
      expect(participant.calculatePoints(matches)).toBe(0);
    });

    test('sums points across multiple matches', () => {
      participant.addPrediction('match-1', 2, 1);
      participant.addPrediction('match-2', 0, 0);
      participant.addPrediction('match-3', 2, 1);
      expect(participant.calculatePoints(matches)).toBe(6);
    });

    test('ignores predictions for unfinished matches', () => {
      const unfinishedMatches = [
        new Match({ id: 'match-1', score1: null, score2: null, status: 'scheduled' })
      ];
      participant.addPrediction('match-1', 2, 1);
      expect(participant.calculatePoints(unfinishedMatches)).toBe(0);
    });

    test('updates participant.points property', () => {
      participant.addPrediction('match-1', 2, 1);
      participant.calculatePoints(matches);
      expect(participant.points).toBe(3);
    });
  });

  describe('toJSON/fromJSON', () => {
    test('serializes and deserializes correctly', () => {
      participant.addPrediction('match-1', 2, 1);
      participant.addPrediction('match-2', 1, 1);
      participant.points = 4;
      participant.eliminate('match-3');

      const json = participant.toJSON();
      const restored = Participant.fromJSON(json);

      expect(restored.id).toBe(participant.id);
      expect(restored.name).toBe('Juan');
      expect(restored.predictions).toEqual(participant.predictions);
      expect(restored.active).toBe(false);
      expect(restored.eliminatedInMatch).toBe('match-3');
      expect(restored.points).toBe(4);
    });
  });
});