const GameManager = require('../../public/src/core/GameManager');
const Match = require('../../public/src/core/Match');
const Participant = require('../../public/src/core/Participant');

describe('GameManager', () => {
  let gameManager;
  let matchesData;

  beforeEach(() => {
    gameManager = new GameManager();
    
    matchesData = [
      {
        id: 'match-1',
        team1: 'Real Madrid',
        team2: 'Opponent 1',
        team1Logo: '/logos/rm.png',
        team2Logo: '/logos/opp1.png',
        date: '2026-09-14T16:00:00Z',
        time: '18:00',
        round: 1,
        weekendMatch: true
      },
      {
        id: 'match-2',
        team1: 'FC Barcelona',
        team2: 'Opponent 2',
        team1Logo: '/logos/barca.png',
        team2Logo: '/logos/opp2.png',
        date: '2026-09-15T16:00:00Z',
        time: '20:00',
        round: 1,
        weekendMatch: true
      },
      {
        id: 'match-3',
        team1: 'SD Ponferradina',
        team2: 'Opponent 3',
        team1Logo: '/logos/ponfe.png',
        team2Logo: '/logos/opp3.png',
        date: '2026-09-16T16:00:00Z',
        time: '21:00',
        round: 1,
        weekendMatch: true
      }
    ];
  });

  describe('initializeJourney', () => {
    test('initializes matches correctly', () => {
      gameManager.initializeJourney(matchesData);
      expect(gameManager.matches.length).toBe(3);
      expect(gameManager.currentRound).toBe(1);
      expect(gameManager.journeyLocked).toBe(false);
    });

    test('resets all participants', () => {
      const p1 = gameManager.addParticipant('Juan');
      const p2 = gameManager.addParticipant('Pedro');
      p1.eliminate('match-1');
      p1.points = 5;

      gameManager.initializeJourney(matchesData);

      expect(p1.active).toBe(true);
      expect(p1.eliminatedAt).toBeNull();
      expect(p1.eliminatedInMatch).toBeNull();
      expect(p1.points).toBe(0);
      expect(p2.active).toBe(true);
    });

    test('sets journey start and end dates', () => {
      gameManager.initializeJourney(matchesData);
      expect(gameManager.journeyStartDate).toBeInstanceOf(Date);
      expect(gameManager.journeyEndDate).toBeInstanceOf(Date);
    });
  });

  describe('addParticipant', () => {
    test('adds participant and returns it', () => {
      const participant = gameManager.addParticipant('Juan');
      expect(gameManager.participants.length).toBe(1);
      expect(participant.name).toBe('Juan');
    });

    test('generates unique IDs for each participant', () => {
      const p1 = gameManager.addParticipant('Juan');
      const p2 = gameManager.addParticipant('Pedro');
      expect(p1.id).not.toBe(p2.id);
    });
  });

  describe('removeParticipant', () => {
    test('removes participant by ID', () => {
      const p1 = gameManager.addParticipant('Juan');
      const p2 = gameManager.addParticipant('Pedro');
      
      gameManager.removeParticipant(p1.id);
      
      expect(gameManager.participants.length).toBe(1);
      expect(gameManager.participants[0].id).toBe(p2.id);
    });
  });

  describe('getParticipant', () => {
    test('returns participant by ID', () => {
      const p1 = gameManager.addParticipant('Juan');
      const found = gameManager.getParticipant(p1.id);
      expect(found).toBe(p1);
    });

    test('returns undefined for non-existent ID', () => {
      expect(gameManager.getParticipant('non-existent')).toBeUndefined();
    });
  });

  describe('getActiveParticipants', () => {
    test('returns only active participants', () => {
      const p1 = gameManager.addParticipant('Juan');
      const p2 = gameManager.addParticipant('Pedro');
      p2.eliminate('match-1');
      
      const active = gameManager.getActiveParticipants();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe(p1.id);
    });
  });

  describe('makePrediction', () => {
    beforeEach(() => {
      gameManager.initializeJourney(matchesData);
    });

    test('allows prediction before journey locked', () => {
      const participant = gameManager.addParticipant('Juan');
      const result = gameManager.makePrediction(participant.id, 'match-1', 2, 1);
      
      expect(result).toBe(participant);
      expect(participant.predictions['match-1']).toEqual({ score1: 2, score2: 1 });
    });

    test('throws error when journey is locked', () => {
      const participant = gameManager.addParticipant('Juan');
      gameManager.lockJourney();
      
      expect(() => gameManager.makePrediction(participant.id, 'match-1', 2, 1))
        .toThrow('La jornada ya ha comenzado');
    });

    test('throws error for non-existent participant', () => {
      expect(() => gameManager.makePrediction('non-existent', 'match-1', 2, 1))
        .toThrow('Participante no encontrado');
    });

    test('throws error for non-existent match', () => {
      const participant = gameManager.addParticipant('Juan');
      expect(() => gameManager.makePrediction(participant.id, 'non-existent', 2, 1))
        .toThrow('Partido no encontrado');
    });

    test('throws error when match is live', () => {
      const participant = gameManager.addParticipant('Juan');
      const match = gameManager.getMatch('match-1');
      match.status = 'live';
      
      expect(() => gameManager.makePrediction(participant.id, 'match-1', 2, 1))
        .toThrow('ya ha comenzado');
    });

    test('throws error when match is finished', () => {
      const participant = gameManager.addParticipant('Juan');
      const match = gameManager.getMatch('match-1');
      match.status = 'finished';
      
      expect(() => gameManager.makePrediction(participant.id, 'match-1', 2, 1))
        .toThrow('ya ha comenzado');
    });
  });

  describe('lockJourney/unlockJourney', () => {
    test('lockJourney sets journeyLocked to true', () => {
      gameManager.lockJourney();
      expect(gameManager.isJourneyLocked()).toBe(true);
    });

    test('unlockJourney sets journeyLocked to false', () => {
      gameManager.lockJourney();
      gameManager.unlockJourney();
      expect(gameManager.isJourneyLocked()).toBe(false);
    });
  });

  describe('updateMatchScore and processEliminations', () => {
    beforeEach(() => {
      gameManager.initializeJourney(matchesData);
    });

    test('updates match score and sets status to finished', () => {
      const match = gameManager.updateMatchScore('match-1', 2, 1);
      expect(match.score1).toBe(2);
      expect(match.score2).toBe(1);
      expect(match.status).toBe('finished');
    });

    test('eliminates participants with wrong prediction', () => {
      const p1 = gameManager.addParticipant('Juan');
      const p2 = gameManager.addParticipant('Pedro');
      
      p1.addPrediction('match-1', 2, 1);
      p2.addPrediction('match-1', 1, 2);
      
      gameManager.updateMatchScore('match-1', 2, 1);
      
      expect(p1.active).toBe(true);
      expect(p2.active).toBe(false);
      expect(p2.eliminatedInMatch).toBe('match-1');
    });

    test('eliminates participants with no prediction', () => {
      const p1 = gameManager.addParticipant('Juan');
      const p2 = gameManager.addParticipant('Pedro');
      
      p1.addPrediction('match-1', 2, 1);
      
      gameManager.updateMatchScore('match-1', 2, 1);
      
      expect(p1.active).toBe(true);
      expect(p2.active).toBe(false);
    });

    test('eliminates participant with wrong prediction when match finishes', () => {
      const p1 = gameManager.addParticipant('Juan');
      p1.addPrediction('match-1', 1, 2);
      
      gameManager.updateMatchScore('match-1', 2, 1);
      
      expect(p1.active).toBe(false);
    });
  });

  describe('checkWinner', () => {
    beforeEach(() => {
      gameManager.initializeJourney(matchesData);
    });

    test('returns winner when only one active participant', () => {
      const p1 = gameManager.addParticipant('Juan');
      const p2 = gameManager.addParticipant('Pedro');
      const p3 = gameManager.addParticipant('Maria');
      
      p2.eliminate('match-1');
      p3.eliminate('match-1');
      
      const winner = gameManager.checkWinner();
      expect(winner).toBe(p1);
    });

    test('returns null when multiple active participants', () => {
      const p1 = gameManager.addParticipant('Juan');
      const p2 = gameManager.addParticipant('Pedro');
      
      expect(gameManager.checkWinner()).toBeNull();
    });

    test('returns null when no active participants', () => {
      const p1 = gameManager.addParticipant('Juan');
      const p2 = gameManager.addParticipant('Pedro');
      
      p1.eliminate('match-1');
      p2.eliminate('match-1');
      
      expect(gameManager.checkWinner()).toBeNull();
    });
  });

  describe('generateNextJourney', () => {
    test('generates 3 matches with correct teams', () => {
      const matches = gameManager.generateNextJourney();
      
      expect(matches.length).toBe(3);
      expect(matches[0].team1).toBe('Real Madrid');
      expect(matches[1].team1).toBe('FC Barcelona');
      expect(matches[2].team1).toBe('SD Ponferradina');
    });

    test('increments round number', () => {
      gameManager.generateNextJourney();
      expect(gameManager.currentRound).toBe(1);
      
      gameManager.generateNextJourney();
      expect(gameManager.currentRound).toBe(2);
    });

    test('sets weekendMatch to true for all matches', () => {
      const matches = gameManager.generateNextJourney();
      matches.forEach(match => {
        expect(match.weekendMatch).toBe(true);
      });
    });

    test('sets dates for weekend (Sat-Mon)', () => {
      const matches = gameManager.generateNextJourney();
      
      matches.forEach(match => {
        expect(match.isWeekend()).toBe(true);
      });
    });
  });

  describe('toJSON/fromJSON', () => {
    test('serializes and deserializes correctly', () => {
      gameManager.initializeJourney(matchesData);
      gameManager.addParticipant('Juan');
      gameManager.addParticipant('Pedro');
      gameManager.pot = 100;
      gameManager.lockJourney();
      
      const json = gameManager.toJSON();
      const restored = GameManager.fromJSON(json);
      
      expect(restored.matches.length).toBe(3);
      expect(restored.participants.length).toBe(2);
      expect(restored.currentRound).toBe(1);
      expect(restored.pot).toBe(100);
      expect(restored.journeyLocked).toBe(true);
      expect(restored.journeyStartDate).toBeInstanceOf(Date);
    });
  });
});