const formatters = require('../../src/utils/formatters');

describe('formatters', () => {
  describe('formatDate', () => {
    test('formats date correctly', () => {
      const date = new Date('2026-09-14T16:00:00Z');
      const formatted = formatters.formatDate(date);
      expect(formatted).toContain('lunes');
      expect(formatted).toContain('14');
      expect(formatted).toContain('septiembre');
      expect(formatted).toContain('2026');
    });

    test('returns empty string for null', () => {
      expect(formatters.formatDate(null)).toBe('');
    });
  });

  describe('formatTime', () => {
    test('formats time correctly', () => {
      const date = new Date('2026-09-14T16:00:00Z');
      const formatted = formatters.formatTime(date);
      expect(formatted).toMatch(/\d{2}:\d{2}/);
    });

    test('returns empty string for null', () => {
      expect(formatters.formatTime(null)).toBe('');
    });
  });

  describe('formatDateTime', () => {
    test('combines date and time', () => {
      const date = new Date('2026-09-14T16:00:00Z');
      const formatted = formatters.formatDateTime(date);
      expect(formatted).toContain('a las');
    });
  });

  describe('formatScore', () => {
    test('formats score correctly', () => {
      expect(formatters.formatScore(2, 1)).toBe('2 - 1');
      expect(formatters.formatScore(0, 0)).toBe('0 - 0');
    });

    test('returns vs for null scores', () => {
      expect(formatters.formatScore(null, null)).toBe('vs');
      expect(formatters.formatScore(null, 1)).toBe('vs');
    });
  });

  describe('formatRelativeTime', () => {
    test('returns "En juego" for past dates', () => {
      const past = new Date();
      past.setHours(past.getHours() - 1);
      expect(formatters.formatRelativeTime(past)).toBe('En juego');
    });

    test('formats future dates', () => {
      const future = new Date();
      future.setDate(future.getDate() + 2);
      future.setHours(future.getHours() + 3);
      const formatted = formatters.formatRelativeTime(future);
      expect(formatted).toContain('En');
      expect(formatted).toContain('d');
      expect(formatted).toContain('h');
    });

    test('returns empty string for null', () => {
      expect(formatters.formatRelativeTime(null)).toBe('');
    });
  });

  describe('formatMatchStatus', () => {
    test('formats all statuses', () => {
      expect(formatters.formatMatchStatus('scheduled')).toBe('Programado');
      expect(formatters.formatMatchStatus('live')).toBe('En vivo');
      expect(formatters.formatMatchStatus('finished')).toBe('Finalizado');
      expect(formatters.formatMatchStatus('postponed')).toBe('Aplazado');
      expect(formatters.formatMatchStatus('cancelled')).toBe('Cancelado');
    });

    test('returns original for unknown status', () => {
      expect(formatters.formatMatchStatus('unknown')).toBe('unknown');
    });
  });

  describe('formatJourneyStatus', () => {
    test('formats all journey statuses', () => {
      expect(formatters.formatJourneyStatus('open')).toBe('Abierto para predicciones');
      expect(formatters.formatJourneyStatus('locked')).toBe('Bloqueado - Jornada iniciada');
      expect(formatters.formatJourneyStatus('live')).toBe('En juego');
      expect(formatters.formatJourneyStatus('finished')).toBe('Finalizada');
      expect(formatters.formatJourneyStatus('empty')).toBe('Sin partidos');
      expect(formatters.formatJourneyStatus('no-dates')).toBe('Sin fechas');
    });
  });

  describe('formatParticipantStatus', () => {
    test('formats active participant', () => {
      const active = { active: true };
      expect(formatters.formatParticipantStatus(active)).toBe('Activo 🟢');
    });

    test('formats eliminated participant', () => {
      const eliminated = { active: false, eliminatedInMatch: 'match-1' };
      expect(formatters.formatParticipantStatus(eliminated)).toContain('Eliminado');
    });
  });

  describe('truncate', () => {
    test('truncates long strings', () => {
      expect(formatters.truncate('hello world', 8)).toBe('hello...');
    });

    test('does not truncate short strings', () => {
      expect(formatters.truncate('hi', 10)).toBe('hi');
    });

    test('handles null/undefined', () => {
      expect(formatters.truncate(null)).toBe(null);
      expect(formatters.truncate(undefined)).toBe(undefined);
    });
  });
});