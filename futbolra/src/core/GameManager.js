const Match = require('./Match');
const Participant = require('./Participant');

class GameManager {
  constructor() {
    this.matches = [];
    this.participants = [];
    this.currentRound = 0;
    this.pot = 0;
    this.journeyLocked = false;
    this.journeyStartDate = null;
    this.journeyEndDate = null;
  }

  initializeJourney(matchesData) {
    this.matches = matchesData.map(m => Match.fromJSON(m));
    this.currentRound = this.matches[0]?.round || 1;
    this.journeyStartDate = this.matches[0]?.date ? new Date(this.matches[0].date) : null;
    this.journeyEndDate = this.matches[this.matches.length - 1]?.date ? new Date(this.matches[this.matches.length - 1].date) : null;
    this.journeyLocked = false;
    
    for (const participant of this.participants) {
      participant.active = true;
      participant.eliminatedAt = null;
      participant.eliminatedInMatch = null;
      participant.points = 0;
    }
  }

  addParticipant(name) {
    const participant = new Participant({ name });
    this.participants.push(participant);
    return participant;
  }

  removeParticipant(participantId) {
    this.participants = this.participants.filter(p => p.id !== participantId);
  }

  getParticipant(participantId) {
    return this.participants.find(p => p.id === participantId);
  }

  getActiveParticipants() {
    return this.participants.filter(p => p.active);
  }

  makePrediction(participantId, matchId, score1, score2) {
    if (this.journeyLocked) {
      throw new Error('La jornada ya ha comenzado. No se pueden hacer predicciones.');
    }

    const participant = this.getParticipant(participantId);
    if (!participant) {
      throw new Error('Participante no encontrado');
    }

    const match = this.matches.find(m => m.id === matchId);
    if (!match) {
      throw new Error('Partido no encontrado');
    }

    if (match.isLive() || match.isFinished()) {
      throw new Error('El partido ya ha comenzado o finalizado');
    }

    participant.addPrediction(matchId, score1, score2);
    return participant;
  }

  lockJourney() {
    this.journeyLocked = true;
  }

  unlockJourney() {
    this.journeyLocked = false;
  }

  isJourneyLocked() {
    return this.journeyLocked;
  }

  updateMatchScore(matchId, score1, score2) {
    const match = this.matches.find(m => m.id === matchId);
    if (!match) {
      throw new Error('Partido no encontrado');
    }

    match.updateScore(score1, score2);
    this.processEliminations(matchId);
    return match;
  }

  processEliminations(finishedMatchId) {
    const finishedMatch = this.matches.find(m => m.id === finishedMatchId);
    if (!finishedMatch || !finishedMatch.isFinished()) return;

    for (const participant of this.getActiveParticipants()) {
      const prediction = participant.getPrediction(finishedMatchId);
      if (!prediction || prediction.score1 !== finishedMatch.score1 || prediction.score2 !== finishedMatch.score2) {
        participant.eliminate(finishedMatchId);
      }
    }
  }

  checkWinner() {
    const activeParticipants = this.getActiveParticipants();
    if (activeParticipants.length === 1) {
      return activeParticipants[0];
    }
    if (activeParticipants.length === 0) {
      return null;
    }
    return null;
  }

  getMatches() {
    return this.matches;
  }

  getMatch(matchId) {
    return this.matches.find(m => m.id === matchId);
  }

  getNextWeekendDate() {
    const today = new Date();
    const day = today.getDay();
    
    let daysUntilSaturday;
    if (day <= 4) {
      daysUntilSaturday = 6 - day;
    } else {
      daysUntilSaturday = 6 - day + 7;
    }
    
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + daysUntilSaturday);
    saturday.setHours(0, 0, 0, 0);
    
    return saturday;
  }

  generateNextJourney() {
    const nextWeekend = this.getNextWeekendDate();
    const teams = [
      { name: 'Real Madrid', logo: '/assets/logos/real-madrid.png' },
      { name: 'FC Barcelona', logo: '/assets/logos/fc-barcelona.png' },
      { name: 'SD Ponferradina', logo: '/assets/logos/sd-ponferradina.png' }
    ];

    const matches = teams.map((team, index) => {
      const matchDate = new Date(nextWeekend);
      matchDate.setDate(nextWeekend.getDate() + index);
      
      return new Match({
        team1: team.name,
        team2: index === 0 ? 'Oponente 1' : index === 1 ? 'Oponente 2' : 'Oponente 3',
        team1Logo: team.logo,
        team2Logo: '/assets/logos/opponent.png',
        date: matchDate.toISOString(),
        time: `${15 + index * 2}:00`,
        round: this.currentRound + 1,
        weekendMatch: true
      });
    });

    this.currentRound++;
    this.initializeJourney(matches.map(m => m.toJSON()));
    return this.matches;
  }

  toJSON() {
    return {
      matches: this.matches.map(m => m.toJSON()),
      participants: this.participants.map(p => p.toJSON()),
      currentRound: this.currentRound,
      pot: this.pot,
      journeyLocked: this.journeyLocked,
      journeyStartDate: this.journeyStartDate?.toISOString() || null,
      journeyEndDate: this.journeyEndDate?.toISOString() || null
    };
  }

  static fromJSON(data) {
    const manager = new GameManager();
    manager.matches = data.matches?.map(m => Match.fromJSON(m)) || [];
    manager.participants = data.participants?.map(p => Participant.fromJSON(p)) || [];
    manager.currentRound = data.currentRound || 0;
    manager.pot = data.pot || 0;
    manager.journeyLocked = data.journeyLocked || false;
    manager.journeyStartDate = data.journeyStartDate ? new Date(data.journeyStartDate) : null;
    manager.journeyEndDate = data.journeyEndDate ? new Date(data.journeyEndDate) : null;
    return manager;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameManager;
}