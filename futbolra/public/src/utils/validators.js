const validators = {
  isValidScore(score) {
    return Number.isInteger(score) && score >= 0 && score <= 20;
  },

  isValidMatchId(matchId) {
    return typeof matchId === 'string' && matchId.length > 0;
  },

  isValidParticipantName(name) {
    return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 50;
  },

  isValidPrediction(score1, score2) {
    return this.isValidScore(score1) && this.isValidScore(score2);
  },

  isWeekend(date) {
    if (!(date instanceof Date)) return false;
    const day = date.getDay();
    return day === 0 || day === 6 || day === 1;
  },

  isDateInFuture(date) {
    return date instanceof Date && date > new Date();
  },

  sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, 100);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = validators;
}