class Match {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.team1 = data.team1 || '';
    this.team2 = data.team2 || '';
    this.team1Logo = data.team1Logo || '';
    this.team2Logo = data.team2Logo || '';
    this.date = data.date ? new Date(data.date) : null;
    this.time = data.time || '';
    this.score1 = data.score1 ?? null;
    this.score2 = data.score2 ?? null;
    this.status = data.status || 'scheduled';
    this.events = data.events || [];
    this.round = data.round || 0;
    this.weekendMatch = data.weekendMatch || false;
    this.manual = data.manual || false;
  }

  isWeekend() {
    if (!this.date) return false;
    const day = this.date.getDay();
    return day === 0 || day === 6 || day === 1;
  }

  isLive() {
    return this.status === 'live';
  }

  isFinished() {
    return this.status === 'finished';
  }

  getScore() {
    if (this.score1 === null || this.score2 === null) return null;
    return `${this.score1}-${this.score2}`;
  }

  getWinner() {
    if (this.score1 === null || this.score2 === null) return null;
    if (this.score1 > this.score2) return this.team1;
    if (this.score2 > this.score1) return this.team2;
    return 'draw';
  }

  updateScore(score1, score2) {
    this.score1 = score1;
    this.score2 = score2;
    this.status = 'finished';
  }

  addEvent(event) {
    this.events.push({
      id: crypto.randomUUID(),
      ...event,
      timestamp: new Date()
    });
  }

  toJSON() {
    return {
      id: this.id,
      team1: this.team1,
      team2: this.team2,
      team1Logo: this.team1Logo,
      team2Logo: this.team2Logo,
      date: this.date?.toISOString() || null,
      time: this.time,
      score1: this.score1,
      score2: this.score2,
      status: this.status,
      events: this.events,
      round: this.round,
      weekendMatch: this.weekendMatch,
      manual: this.manual
    };
  }

  static fromJSON(data) {
    return new Match(data);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Match;
}