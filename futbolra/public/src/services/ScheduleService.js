class ScheduleService {
  constructor() {
    this.checkInterval = null;
    this.gameManager = null;
  }

  setGameManager(gameManager) {
    this.gameManager = gameManager;
  }

  startAutoSchedule() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.checkInterval = setInterval(() => {
      this.checkAndResetJourney();
    }, 60 * 60 * 1000);
    
    this.checkAndResetJourney();
  }

  stopAutoSchedule() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  checkAndResetJourney() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    
    if (day === 2 && hour >= 0 && hour < 6) {
      this.resetJourney();
    }
  }

  resetJourney() {
    if (!this.gameManager) {
      console.warn('GameManager not set in ScheduleService');
      return;
    }

    console.log('Resetting journey for new weekend...');
    this.gameManager.generateNextJourney();
    this.gameManager.unlockJourney();
    
    return this.gameManager.getMatches();
  }

  getCurrentJourneyMatches() {
    if (!this.gameManager) return [];
    return this.gameManager.getMatches();
  }

  // Primer y último pitido por fecha, no por el orden fijo de los partidos (Madrid, Barça, Ponfe)
  journeyBounds() {
    const dates = this.gameManager.getMatches()
      .map(m => (m.date ? new Date(m.date) : null))
      .filter(d => d && !isNaN(d))
      .sort((a, b) => a - b);
    return { first: dates[0] || null, last: dates[dates.length - 1] || null };
  }

  isJourneyActive() {
    if (!this.gameManager) return false;
    
    const { first, last } = this.journeyBounds();
    if (!first || !last) return false;

    const now = new Date();
    return now >= first && now <= last;
  }

  canMakePredictions() {
    if (!this.gameManager) return false;
    return !this.gameManager.isJourneyLocked() && !this.isJourneyActive();
  }

  getJourneyStatus() {
    if (!this.gameManager) return 'unknown';
    
    const matches = this.gameManager.getMatches();
    if (matches.length === 0) return 'empty';

    const { first, last } = this.journeyBounds();
    if (!first) return 'no-dates';

    const now = new Date();
    if (now < first) {
      return this.gameManager.isJourneyLocked() ? 'locked' : 'open';
    }

    if (now > last) {
      return 'finished';
    }

    return 'live';
  }

  getNextResetTime() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    
    let daysUntilTuesday;
    if (day === 2 && hour < 6) {
      // Today is Tuesday before 6AM - reset is today
      daysUntilTuesday = 0;
    } else if (day < 2) {
      // Before Tuesday (Sun=0, Mon=1)
      daysUntilTuesday = 2 - day;
    } else {
      // After Tuesday or Tuesday after 6AM
      daysUntilTuesday = 9 - day;
    }
    
    const nextTuesday = new Date(now);
    nextTuesday.setDate(now.getDate() + daysUntilTuesday);
    nextTuesday.setHours(6, 0, 0, 0);
    
    return nextTuesday;
  }

  getTimeUntilNextReset() {
    const nextReset = this.getNextResetTime();
    const now = new Date();
    return nextReset - now;
  }

  formatTimeUntilReset() {
    const ms = this.getTimeUntilNextReset();
    if (ms <= 0) return 'Ahora';
    
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  validateWeekendMatches(matches) {
    return matches.every(match => match.weekendMatch && match.isWeekend());
  }

  getUpcomingWeekendMatches() {
    if (!this.gameManager) return [];
    
    const matches = this.gameManager.getMatches();
    const now = new Date();
    
    return matches.filter(match => {
      if (!match.date) return false;
      const matchDate = new Date(match.date);
      return matchDate >= now && match.isWeekend();
    });
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
}

const scheduleService = new ScheduleService();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ScheduleService, scheduleService };
}