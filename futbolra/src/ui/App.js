class App {
  constructor() {
    this.gameManager = null;
    this.dataService = null;
    this.scheduleService = null;
    this.currentParticipant = null;
    this.elements = {};
  }

  async init(gameManager, dataService, scheduleService) {
    this.gameManager = gameManager;
    this.dataService = dataService;
    this.scheduleService = scheduleService;
    
    this.cacheElements();
    this.bindEvents();
    await this.loadData();
    this.render();
    
    this.dataService.subscribeToGame((data) => {
      if (data) {
        this.updateFromData(data);
      }
    });
  }

  cacheElements() {
    this.elements = {
      app: document.getElementById('app'),
      journeyStatus: document.getElementById('journey-status'),
      potAmount: document.getElementById('pot-amount'),
      matchesContainer: document.getElementById('matches-container'),
      participantsContainer: document.getElementById('participants-container'),
      predictionForm: document.getElementById('prediction-form'),
      participantName: document.getElementById('participant-name'),
      joinBtn: document.getElementById('join-btn'),
      resetJourneyBtn: document.getElementById('reset-journey-btn'),
      adminPanel: document.getElementById('admin-panel')
    };
  }

  bindEvents() {
    if (this.elements.joinBtn) {
      this.elements.joinBtn.addEventListener('click', () => this.joinGame());
    }
    
    if (this.elements.resetJourneyBtn) {
      this.elements.resetJourneyBtn.addEventListener('click', () => this.resetJourney());
    }

    if (this.elements.predictionForm) {
      this.elements.predictionForm.addEventListener('submit', (e) => this.handlePrediction(e));
    }
  }

  async loadData() {
    try {
      const gameData = await this.dataService.loadGameManager();
      if (gameData) {
        this.updateFromData(gameData);
      }
      
      const pot = await this.dataService.loadPot();
      if (pot) {
        this.gameManager.pot = pot;
        this.updatePotDisplay();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  updateFromData(data) {
    this.gameManager = require('../core/GameManager').fromJSON(data);
    this.render();
  }

  async joinGame() {
    const name = this.elements.participantName?.value?.trim();
    if (!name) return;

    const participant = this.gameManager.addParticipant(name);
    this.currentParticipant = participant;
    
    await this.dataService.saveGameManager(this.gameManager);
    
    this.elements.participantName.value = '';
    this.elements.joinBtn.style.display = 'none';
    this.elements.predictionForm.style.display = 'block';
    this.render();
  }

  async handlePrediction(e) {
    e.preventDefault();
    if (!this.currentParticipant) return;

    const formData = new FormData(e.target);
    const predictions = {};
    
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('score-')) {
        const matchId = key.replace('score-', '');
        const scores = value.split('-').map(s => parseInt(s.trim(), 10));
        if (scores.length === 2 && !isNaN(scores[0]) && !isNaN(scores[1])) {
          predictions[matchId] = scores;
        }
      }
    }

    try {
      for (const [matchId, [score1, score2]] of Object.entries(predictions)) {
        this.gameManager.makePrediction(this.currentParticipant.id, matchId, score1, score2);
      }
      
      await this.dataService.saveGameManager(this.gameManager);
      this.render();
    } catch (error) {
      alert(error.message);
    }
  }

  async resetJourney() {
    this.scheduleService.resetJourney();
    await this.dataService.saveGameManager(this.gameManager);
    this.render();
  }

  updatePotDisplay() {
    if (this.elements.potAmount) {
      this.elements.potAmount.textContent = `${this.gameManager.pot}€`;
    }
  }

  render() {
    this.renderJourneyStatus();
    this.renderMatches();
    this.renderParticipants();
    this.updatePotDisplay();
  }

  renderJourneyStatus() {
    if (!this.elements.journeyStatus) return;
    
    const status = this.scheduleService.getJourneyStatus();
    const statusText = require('../utils/formatters').formatJourneyStatus(status);
    const timeLeft = this.scheduleService.formatTimeUntilReset();
    
    this.elements.journeyStatus.innerHTML = `
      <span class="status-badge status-${status}">${statusText}</span>
      ${status === 'open' ? `<span class="time-left">Próximo reset: ${timeLeft}</span>` : ''}
    `;
  }

  renderMatches() {
    if (!this.elements.matchesContainer) return;
    
    const matches = this.gameManager.getMatches();
    const canPredict = this.scheduleService.canMakePredictions() && this.currentParticipant;
    
    this.elements.matchesContainer.innerHTML = matches.map(match => this.renderMatchCard(match, canPredict)).join('');
    
    if (canPredict) {
      this.bindPredictionInputs();
    }
  }

  renderMatchCard(match, canPredict) {
    const isLive = match.isLive();
    const isFinished = match.isFinished();
    const score = match.getScore();
    const status = require('../utils/formatters').formatMatchStatus(match.status);
    const dateStr = require('../utils/formatters').formatDateTime(match.date);
    
    let predictionInputs = '';
    if (canPredict && !isLive && !isFinished) {
      predictionInputs = `
        <div class="prediction-inputs">
          <input type="number" name="score-${match.id}" placeholder="0-0" min="0" max="20" class="score-input" data-match-id="${match.id}" required>
        </div>
      `;
    }
    
    return `
      <div class="match-card ${isLive ? 'live' : ''} ${isFinished ? 'finished' : ''}" data-match-id="${match.id}">
        <div class="match-header">
          <div class="teams">
            <div class="team">
              <img src="${match.team1Logo}" alt="${match.team1}" class="team-logo" onerror="this.src='/assets/logos/placeholder.png'">
              <span class="team-name">${match.team1}</span>
            </div>
            <div class="vs">VS</div>
            <div class="team">
              <span class="team-name">${match.team2}</span>
              <img src="${match.team2Logo}" alt="${match.team2}" class="team-logo" onerror="this.src='/assets/logos/placeholder.png'">
            </div>
          </div>
          <div class="match-meta">
            <span class="match-date">${dateStr}</span>
            <span class="match-status">${status}</span>
          </div>
        </div>
        <div class="match-score">
          ${score ? `<span class="score">${score}</span>` : '<span class="score-pending">-</span>'}
        </div>
        ${predictionInputs}
        ${isFinished ? `<div class="match-events">${this.renderMatchEvents(match)}</div>` : ''}
      </div>
    `;
  }

  renderMatchEvents(match) {
    if (!match.events || match.events.length === 0) return '<p>No hay eventos</p>';
    
    return match.events.map(event => `
      <div class="event ${event.type}">
        <span class="event-time">${event.minute}'</span>
        <span class="event-description">${event.description}</span>
      </div>
    `).join('');
  }

  bindPredictionInputs() {
    const inputs = this.elements.matchesContainer.querySelectorAll('.score-input');
    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const value = e.target.value;
        if (/^\d+-\d+$/.test(value)) {
          e.target.classList.add('valid');
        } else {
          e.target.classList.remove('valid');
        }
      });
    });
  }

  renderParticipants() {
    if (!this.elements.participantsContainer) return;
    
    const participants = this.gameManager.participants;
    
    this.elements.participantsContainer.innerHTML = participants.map(p => `
      <div class="participant-card ${p.active ? 'active' : 'eliminated'}" data-participant-id="${p.id}">
        <div class="participant-info">
          <span class="participant-name">${p.name}${p.id === this.currentParticipant?.id ? ' (Tú)' : ''}</span>
          <span class="participant-points">${p.points} pts</span>
        </div>
        <div class="participant-status">
          ${require('../utils/formatters').formatParticipantStatus(p)}
        </div>
        <div class="participant-predictions">
          ${this.renderParticipantPredictions(p)}
        </div>
      </div>
    `).join('');
  }

  renderParticipantPredictions(participant) {
    const matches = this.gameManager.getMatches();
    return matches.map(match => {
      const pred = participant.predictions[match.id];
      if (!pred) return '<span class="no-prediction">-</span>';
      
      const isCorrect = match.isFinished() && pred.score1 === match.score1 && pred.score2 === match.score2;
      return `<span class="prediction ${isCorrect ? 'correct' : ''}">${pred.score1}-${pred.score2}</span>`;
    }).join('');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = App;
}