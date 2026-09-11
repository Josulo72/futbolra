const validators = require('../../public/src/utils/validators');

describe('validators', () => {
  describe('isValidScore', () => {
    test('returns true for valid scores', () => {
      expect(validators.isValidScore(0)).toBe(true);
      expect(validators.isValidScore(1)).toBe(true);
      expect(validators.isValidScore(10)).toBe(true);
      expect(validators.isValidScore(20)).toBe(true);
    });

    test('returns false for negative scores', () => {
      expect(validators.isValidScore(-1)).toBe(false);
    });

    test('returns false for scores above 20', () => {
      expect(validators.isValidScore(21)).toBe(false);
      expect(validators.isValidScore(100)).toBe(false);
    });

    test('returns false for non-integers', () => {
      expect(validators.isValidScore(1.5)).toBe(false);
      expect(validators.isValidScore('2')).toBe(false);
    });
  });

  describe('isValidMatchId', () => {
    test('returns true for valid IDs', () => {
      expect(validators.isValidMatchId('match-1')).toBe(true);
      expect(validators.isValidMatchId('abc123')).toBe(true);
    });

    test('returns false for empty strings', () => {
      expect(validators.isValidMatchId('')).toBe(false);
    });

    test('returns false for non-strings', () => {
      expect(validators.isValidMatchId(null)).toBe(false);
      expect(validators.isValidMatchId(123)).toBe(false);
    });
  });

  describe('isValidParticipantName', () => {
    test('returns true for valid names', () => {
      expect(validators.isValidParticipantName('Juan')).toBe(true);
      expect(validators.isValidParticipantName('María García')).toBe(true);
      expect(validators.isValidParticipantName('A'.repeat(50))).toBe(true);
    });

    test('returns false for too short names', () => {
      expect(validators.isValidParticipantName('A')).toBe(false);
      expect(validators.isValidParticipantName('')).toBe(false);
      expect(validators.isValidParticipantName('  ')).toBe(false);
    });

    test('returns false for too long names', () => {
      expect(validators.isValidParticipantName('A'.repeat(51))).toBe(false);
    });

    test('returns false for non-strings', () => {
      expect(validators.isValidParticipantName(null)).toBe(false);
      expect(validators.isValidParticipantName(123)).toBe(false);
    });
  });

  describe('isValidPrediction', () => {
    test('returns true for valid predictions', () => {
      expect(validators.isValidPrediction(0, 0)).toBe(true);
      expect(validators.isValidPrediction(2, 1)).toBe(true);
      expect(validators.isValidPrediction(10, 5)).toBe(true);
    });

    test('returns false for invalid scores', () => {
      expect(validators.isValidPrediction(-1, 0)).toBe(false);
      expect(validators.isValidPrediction(0, 21)).toBe(false);
      expect(validators.isValidPrediction(1.5, 2)).toBe(false);
    });
  });

  describe('isWeekend', () => {
    test('returns true for Saturday', () => {
      expect(validators.isWeekend(new Date('2026-09-19'))).toBe(true);
    });

    test('returns true for Sunday', () => {
      expect(validators.isWeekend(new Date('2026-09-20'))).toBe(true);
    });

    test('returns true for Monday', () => {
      expect(validators.isWeekend(new Date('2026-09-21'))).toBe(true);
    });

    test('returns false for Tuesday-Friday', () => {
      expect(validators.isWeekend(new Date('2026-09-15'))).toBe(false);
      expect(validators.isWeekend(new Date('2026-09-16'))).toBe(false);
      expect(validators.isWeekend(new Date('2026-09-17'))).toBe(false);
      expect(validators.isWeekend(new Date('2026-09-18'))).toBe(false);
    });

    test('returns false for invalid date', () => {
      expect(validators.isWeekend(null)).toBe(false);
      expect(validators.isWeekend('not a date')).toBe(false);
    });
  });

  describe('isDateInFuture', () => {
    test('returns true for future dates', () => {
      const future = new Date();
      future.setDate(future.getDate() + 1);
      expect(validators.isDateInFuture(future)).toBe(true);
    });

    test('returns false for past dates', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      expect(validators.isDateInFuture(past)).toBe(false);
    });

    test('returns false for invalid dates', () => {
      expect(validators.isDateInFuture(null)).toBe(false);
      expect(validators.isDateInFuture('not a date')).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    test('trims and truncates', () => {
      expect(validators.sanitizeString('  hello  ')).toBe('hello');
      expect(validators.sanitizeString('A'.repeat(150))).toBe('A'.repeat(100));
    });

    test('handles non-strings', () => {
      expect(validators.sanitizeString(null)).toBe('');
      expect(validators.sanitizeString(123)).toBe('');
      expect(validators.sanitizeString(undefined)).toBe('');
    });
  });
});