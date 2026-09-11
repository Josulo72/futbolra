const getFormatters = () => (typeof require === 'function' ? require('../utils/formatters') : formatters);
const getGameManagerClass = () => (typeof require === 'function' ? require('../core/GameManager') : GameManager);

class App {
  constructor() {
    this.gameManager = null;
    this.dataService = null;
    this.scheduleService = null;
    this.currentParticipant = null;
    this.elements = {};
  }

  async init(gameManager, dataService, scheduleService, fixturesService) {
    this.gameManager = gameManager;
    this.dataService = dataService;
    this.scheduleService = scheduleService;
    this.fixturesService = fixturesService;

    this.cacheElements();
    this.bindEvents();
    await this.loadData();
    await this.ensureRealJourney();

    this.restoreParticipant();
    this.render();

    this.dataService.subscribeToGame((data) => {
      if (data) {
        this.updateFromData(data);
      }
    });

    setInterval(() => this.ensureRealJourney(), 60 * 60 * 1000);
  }

  async persist() {
    const data = await this.dataService.saveGameManager(this.gameManager);
    if (data) this.updateFromData(data);
  }

  // Martes 06:00 siguiente al último partido de la jornada
  getJourneyResetTime(matches) {
    const last = matches.reduce((max, m) => (m.date && m.date > max ? m.date : max), new Date(0));
    const reset = new Date(last);
    const daysUntilTuesday = (2 - reset.getDay() + 7) % 7 || 7;
    reset.setDate(reset.getDate() + daysUntilTuesday);
    reset.setHours(6, 0, 0, 0);
    return reset;
  }

  needsNewJourney() {
    const matches = this.gameManager.getMatches();
    if (matches.length === 0) return true;
    if (matches.some(m => !String(m.id).match(/^(espn|tsdb)-/))) return true;
    return new Date() >= this.getJourneyResetTime(matches);
  }

  async ensureRealJourney() {
    if (!this.fixturesService || !this.needsNewJourney()) return;
    try {
      const matchesData = await this.fixturesService.getNextJourney();
      this.gameManager.currentRound++;
      this.gameManager.initializeJourney(matchesData.map(m => ({ ...m, round: this.gameManager.currentRound })));
      this.gameManager.unlockJourney();
      await this.persist();
      this.render();
    } catch (error) {
      console.error('Error cargando partidos reales:', error);
      this.showToast('No se han podido cargar los partidos reales', 'error');
    }
  }

  cacheElements() {
    this.elements = {
      app: document.getElementById('app'),
      journeyStatus: document.getElementById('journey-status'),
      potAmount: document.getElementById('pot-amount'),
      matchesContainer: document.getElementById('matches-container'),
      matchesDisplay: document.getElementById('matches-display'),
      participantsContainer: document.getElementById('participants-display'),
      predictionForm: document.getElementById('prediction-form'),
      participantName: document.getElementById('participant-name'),
      joinForm: document.getElementById('join-form'),
      joinSection: document.getElementById('join-section'),
      predictionsSection: document.getElementById('predictions-section'),
      toastContainer: document.getElementById('toast-container'),
      resetJourneyBtn: document.getElementById('reset-journey-btn'),
      adminPanel: document.getElementById('admin-panel')
    };
  }

  bindEvents() {
    if (this.elements.joinForm) {
      this.elements.joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.joinGame();
      });
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
    this.gameManager = getGameManagerClass().fromJSON(data);
    this.scheduleService?.setGameManager(this.gameManager);
    if (this.currentParticipant) {
      this.currentParticipant = this.gameManager.getParticipant(this.currentParticipant.id) || null;
    }
    this.render();
  }

  restoreParticipant() {
    let savedId = null;
    try {
      savedId = localStorage.getItem('futbolra-me');
    } catch (e) {}
    const participant = savedId ? this.gameManager.getParticipant(savedId) : null;
    if (participant) {
      this.currentParticipant = participant;
      this.showPredictions();
    }
  }

  showPredictions() {
    if (this.elements.joinSection) this.elements.joinSection.style.display = 'none';
    if (this.elements.predictionsSection) this.elements.predictionsSection.style.display = 'block';
  }

  showToast(message, type = 'success') {
    if (!this.elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.elements.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  async joinGame() {
    const name = this.elements.participantName?.value?.trim();
    if (!name) return;

    const participant = this.gameManager.addParticipant(name);
    this.currentParticipant = participant;
    try {
      localStorage.setItem('futbolra-me', participant.id);
    } catch (e) {}

    try {
      await this.persist();
    } catch (error) {
      this.gameManager.removeParticipant(participant.id);
      this.currentParticipant = null;
      try {
        localStorage.removeItem('futbolra-me');
      } catch (e) {}
      this.showToast(error.message, 'error');
      return;
    }

    this.elements.participantName.value = '';
    this.showPredictions();
    this.render();
    this.showToast(`Bienvenido, ${name}`);
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
      
      await this.persist();
      this.render();
      this.showToast('Predicciones guardadas');
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  async resetJourney() {
    this.scheduleService.resetJourney();
    await this.persist();
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
    const statusText = getFormatters().formatJourneyStatus(status);
    const timeLeft = this.scheduleService.formatTimeUntilReset();
    
    this.elements.journeyStatus.innerHTML = `
      <span class="status-badge status-${status}">${statusText}</span>
      ${status === 'open' ? `<span class="time-left">Próximo reset: ${timeLeft}</span>` : ''}
    `;
  }

  renderMatches() {
    const matches = this.gameManager.getMatches();
    const canPredict = this.scheduleService.canMakePredictions() && this.currentParticipant;

    if (this.elements.matchesDisplay) {
      this.elements.matchesDisplay.innerHTML = matches.map(match => this.renderMatchCard(match, false)).join('');
    }

    if (!this.elements.matchesContainer) return;

    // Conserva lo que el usuario está escribiendo si llegan datos de otros
    const typed = {};
    this.elements.matchesContainer.querySelectorAll('.score-input').forEach(input => {
      if (input.value && input.dataset.dirty) typed[input.name] = input.value;
    });

    this.elements.matchesContainer.innerHTML = canPredict
      ? matches.map(match => this.renderMatchCard(match, true)).join('')
      : '<p>No se pueden hacer predicciones ahora.</p>';

    if (canPredict) {
      this.elements.matchesContainer.querySelectorAll('.score-input').forEach(input => {
        if (typed[input.name]) {
          input.value = typed[input.name];
          input.dataset.dirty = '1';
        }
      });
      this.bindPredictionInputs();
    }
  }

  renderMatchCard(match, canPredict) {
    const isLive = match.isLive();
    const isFinished = match.isFinished();
    const score = match.getScore();
    const status = getFormatters().formatMatchStatus(match.status);
    const dateStr = getFormatters().formatDateTime(match.date);
    
    let predictionInputs = '';
    if (canPredict && !isLive && !isFinished) {
      const pred = this.currentParticipant?.getPrediction(match.id);
      const value = pred ? `${pred.score1}-${pred.score2}` : '';
      predictionInputs = `
        <div class="prediction-inputs">
          <input type="text" inputmode="numeric" name="score-${match.id}" value="${value}" placeholder="0-0" pattern="\\d{1,2}-\\d{1,2}" title="Formato: 2-1" class="score-input" data-match-id="${match.id}" required>
        </div>
      `;
    }
    
    return `
      <div class="match-card ${isLive ? 'live' : ''} ${isFinished ? 'finished' : ''}" data-match-id="${match.id}">
        <div class="match-header">
          <div class="teams">
            <div class="team">
              <img src="${match.team1Logo}" alt="${match.team1}" class="team-logo" onerror="this.src='assets/logos/placeholder.svg'">
              <span class="team-name">${match.team1}</span>
            </div>
            <div class="vs">VS</div>
            <div class="team">
              <span class="team-name">${match.team2}</span>
              <img src="${match.team2Logo}" alt="${match.team2}" class="team-logo" onerror="this.src='assets/logos/placeholder.svg'">
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
        ${isLive || isFinished ? `<div class="match-events">${this.renderMatchEvents(match)}</div>` : ''}
      </div>
    `;
  }

  renderMatchEvents(match) {
    if (!match.events || match.events.length === 0) return '<p>Sin detalle de jugadas</p>';
    
    return match.events.map(event => `
      <div class="event ${event.type}">
        <span class="event-time">${event.minute ? `${event.minute}'` : ''}</span>
        <span class="event-description">${event.description}</span>
      </div>
    `).join('');
  }

  bindPredictionInputs() {
    const inputs = this.elements.matchesContainer.querySelectorAll('.score-input');
    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const value = e.target.value;
        e.target.dataset.dirty = '1';
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
          ${getFormatters().formatParticipantStatus(p)}
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