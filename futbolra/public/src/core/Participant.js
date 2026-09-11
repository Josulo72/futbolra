class Participant {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.name = data.name || '';
    this.predictions = data.predictions || {};
    this.active = data.active !== false;
    this.eliminatedAt = data.eliminatedAt || null;
    this.eliminatedInMatch = data.eliminatedInMatch || null;
    this.points = data.points || 0;
  }

  addPrediction(matchId, score1, score2) {
    this.predictions[matchId] = { score1, score2 };
  }

  getPrediction(matchId) {
    return this.predictions[matchId] || null;
  }

  hasPrediction(matchId) {
    return matchId in this.predictions;
  }

  eliminate(matchId) {
    this.active = false;
    this.eliminatedAt = new Date().toISOString();
    this.eliminatedInMatch = matchId;
  }

  isActive() {
    return this.active;
  }

  calculatePoints(matches) {
    let points = 0;
    for (const match of matches) {
      const prediction = this.predictions[match.id];
      if (prediction && match.isFinished()) {
        if (prediction.score1 === match.score1 && prediction.score2 === match.score2) {
          points += 3;
        } else if (
          (prediction.score1 > prediction.score2 && match.score1 > match.score2) ||
          (prediction.score1 < prediction.score2 && match.score1 < match.score2) ||
          (prediction.score1 === prediction.score2 && match.score1 === match.score2)
        ) {
          points += 1;
        }
      }
    }
    this.points = points;
    return points;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      predictions: this.predictions,
      active: this.active,
      eliminatedAt: this.eliminatedAt,
      eliminatedInMatch: this.eliminatedInMatch,
      points: this.points
    };
  }

  static fromJSON(data) {
    return new Participant(data);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Participant;
}