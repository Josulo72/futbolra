const getGameManagerClass = () => (typeof require === 'function' ? require('../core/GameManager') : GameManager);

const ME_KEY = 'futbolra-me';
const ADMIN_KEY = 'futbolra-admin';

const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
};

class App {
  constructor() {
    this.gameManager = null;
    this.dataService = null;
    this.scheduleService = null;
    this.currentParticipant = null;
    this.hasAdmin = false;
    this.confirming = false;
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
      if (data) this.updateFromData(data);
    });

    setInterval(() => this.ensureRealJourney(), 60 * 60 * 1000);
    setInterval(() => {
      this.renderJourneyStatus();
      this.renderHero();
    }, 30 * 1000);
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
      const round = (this.gameManager.currentRound || 0) + 1;
      const data = await this.dataService.saveJourney({
        matches: matchesData.map(m => ({ ...m, round })),
        currentRound: round,
        journeyStartDate: matchesData[0]?.date || null,
        journeyEndDate: matchesData[matchesData.length - 1]?.date || null
      });
      this.updateFromData(data);
    } catch (error) {
      console.error('Error cargando partidos reales:', error);
      this.showToast('No se han podido cargar los partidos reales', 'error');
    }
  }

  cacheElements() {
    const $ = (id) => document.getElementById(id);
    this.elements = {
      journeyStatus: $('journey-status'),
      potAmount: $('pot-amount'),
      matchesContainer: $('matches-container'),
      matchesDisplay: $('matches-display'),
      participantsContainer: $('participants-display'),
      predictionForm: $('prediction-form'),
      submitButton: $('submit-predictions'),
      participantName: $('participant-name'),
      joinForm: $('join-form'),
      joinSection: $('join-section'),
      mePanel: $('me-panel'),
      notMe: $('not-me'),
      rosterSearch: $('roster-search'),
      roster: $('roster'),
      predictionsSection: $('predictions-section'),
      adminSection: $('admin-section'),
      adminPanel: $('admin-panel'),
      toastContainer: $('toast-container')
    };
  }

  bindEvents() {
    const el = this.elements;

    el.joinForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addMe();
    });

    el.rosterSearch?.addEventListener('input', () => this.renderRoster());

    el.roster?.addEventListener('click', (e) => {
      const button = e.target.closest('[data-pick-player]');
      if (button) this.selectMe(button.dataset.pickPlayer);
    });

    el.notMe?.addEventListener('click', () => this.forgetMe());

    el.predictionForm?.addEventListener('submit', (e) => this.handlePrediction(e));

    el.adminPanel?.addEventListener('click', (e) => {
      // Los botones de envío de formulario se gestionan en 'submit' (también con Intro)
      if (e.target.closest('button[type="submit"]')) return;
      this.handleAdminClick(e);
    });
    el.adminPanel?.addEventListener('submit', (e) => {
      e.preventDefault();
      const button = e.target.querySelector('button[type="submit"][data-admin-action]');
      if (button) this.handleAdminClick({ target: button });
    });
    el.adminPanel?.addEventListener('input', (e) => {
      if (e.target.name === 'admin-filter') {
        const query = this.normalize(e.target.value);
        el.adminPanel.querySelectorAll('.admin-person').forEach(row => {
          row.hidden = Boolean(query) && !row.dataset.name.includes(query);
        });
        return;
      }
      const row = e.target.closest('[data-admin-row]');
      if (row) row.dataset.dirty = '1';
    });

    window.addEventListener('hashchange', () => this.renderAdmin(true));
  }

  async loadData() {
    try {
      const gameData = await this.dataService.loadGameManager();
      if (gameData) this.updateFromData(gameData);
    } catch (error) {
      console.error('Error cargando la porra:', error);
      this.showToast('No se ha podido cargar la porra. Reintentando…', 'error');
    }
  }

  updateFromData(data) {
    this.gameManager = getGameManagerClass().fromJSON(data);
    this.hasAdmin = Boolean(data.hasAdmin);
    this.scheduleService?.setGameManager(this.gameManager);
    if (this.currentParticipant) {
      this.currentParticipant = this.gameManager.getParticipant(this.currentParticipant.id) || null;
      if (!this.currentParticipant) this.forgetMe(false);
    }
    this.render();
  }

  // ---------- Quién soy ----------

  restoreParticipant() {
    const savedId = storage.get(ME_KEY);
    const participant = savedId ? this.gameManager.getParticipant(savedId) : null;
    if (participant) {
      this.currentParticipant = participant;
      this.showPredictions();
    }
  }

  selectMe(id) {
    const participant = this.gameManager.getParticipant(id);
    if (!participant) return;
    this.currentParticipant = participant;
    storage.set(ME_KEY, id);
    this.showPredictions();
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  forgetMe(rerender = true) {
    storage.remove(ME_KEY);
    this.currentParticipant = null;
    this.confirming = false;
    if (this.elements.joinSection) this.elements.joinSection.style.display = '';
    if (this.elements.mePanel) this.elements.mePanel.hidden = true;
    if (this.elements.predictionsSection) this.elements.predictionsSection.style.display = 'none';
    if (rerender) this.render();
  }

  showPredictions() {
    if (this.elements.joinSection) this.elements.joinSection.style.display = 'none';
    if (this.elements.mePanel) this.elements.mePanel.hidden = false;
    if (this.elements.predictionsSection) this.elements.predictionsSection.style.display = 'block';
  }

  showToast(message, type = 'success') {
    if (!this.elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.elements.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  }

  async addMe() {
    const name = this.elements.participantName?.value?.trim();
    if (!name) return;
    const id = (crypto.randomUUID && crypto.randomUUID()) || `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const data = await this.dataService.join(id, name);
      this.updateFromData(data);
    } catch (error) {
      this.showToast(error.message, 'error');
      return;
    }
    this.elements.participantName.value = '';
    if (this.elements.rosterSearch) this.elements.rosterSearch.value = '';
    this.selectMe(id);
    this.showToast(`Ya estás dentro, ${name}`);
  }

  // ---------- Pronósticos (una sola vez) ----------

  hasAllPicks(participant) {
    const matches = this.gameManager.getMatches();
    return matches.length > 0 && matches.every(m => participant?.predictions?.[m.id]);
  }

  setConfirming(value) {
    this.confirming = value;
    const button = this.elements.submitButton;
    if (!button) return;
    button.classList.toggle('is-confirming', value);
    button.textContent = value ? 'Confirmar: ya no se podrán cambiar' : 'Guardar pronósticos';
    clearTimeout(this.confirmTimer);
    if (value) this.confirmTimer = setTimeout(() => this.setConfirming(false), 6000);
  }

  async handlePrediction(e) {
    e.preventDefault();
    if (!this.currentParticipant) return;

    const formData = new FormData(e.target);
    const predictions = {};
    let missing = 0;

    for (const match of this.gameManager.getMatches()) {
      const home = formData.get(`home-${match.id}`);
      const away = formData.get(`away-${match.id}`);
      if (home === null || away === null) continue;
      const score1 = parseInt(home, 10);
      const score2 = parseInt(away, 10);
      if (isNaN(score1) || isNaN(score2)) {
        missing++;
        continue;
      }
      predictions[match.id] = { score1, score2 };
    }

    if (missing > 0) {
      this.setConfirming(false);
      this.showToast('Pon el marcador de los tres partidos', 'error');
      return;
    }

    if (!this.confirming) {
      this.setConfirming(true);
      return;
    }

    this.setConfirming(false);
    try {
      const data = await this.dataService.submitPredictions(this.currentParticipant.id, predictions);
      this.updateFromData(data);
      this.showToast('Pronósticos guardados');
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  // ---------- Administración ----------

  adminToken() {
    return storage.get(ADMIN_KEY);
  }

  async adminCall(payload, okMessage) {
    try {
      const data = await this.dataService.admin({ token: this.adminToken(), ...payload });
      this.elements.adminPanel?.querySelectorAll('[data-dirty]').forEach(row => delete row.dataset.dirty);
      this.updateFromData(data);
      this.renderAdmin(true);
      if (okMessage) this.showToast(okMessage);
    } catch (error) {
      if (error.status === 401) {
        storage.remove(ADMIN_KEY);
        this.renderAdmin(true);
      }
      this.showToast(error.message, 'error');
    }
  }

  // Crear el código o entrar con él: el servidor devuelve la sesión de este dispositivo
  async adminOpenSession(payload, okMessage) {
    try {
      const data = await this.dataService.admin(payload);
      if (!data.adminToken) throw new Error('No se ha podido abrir la sesión');
      storage.set(ADMIN_KEY, data.adminToken);
      this.updateFromData(data);
      this.renderAdmin(true);
      this.showToast(okMessage);
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  }

  async handleAdminClick(e) {
    const button = e.target.closest('[data-admin-action]');
    if (!button) return;
    const action = button.dataset.adminAction;
    const row = button.closest('[data-admin-row]');
    const val = (name) => row?.querySelector(`[name="${name}"]`)?.value;

    if (action === 'setup') {
      const code = val('code');
      if (code !== val('code2')) return this.showToast('Los dos códigos no coinciden', 'error');
      return this.adminOpenSession({ action: 'setup', code }, 'Código creado. Ya eres el administrador.');
    }

    if (action === 'login') {
      return this.adminOpenSession({ action: 'login', code: val('code') }, 'Dentro como administrador');
    }

    if (action === 'logout') {
      await this.adminCall({ action: 'logout' });
      storage.remove(ADMIN_KEY);
      this.renderAdmin(true);
      return this.showToast('Sesión de administrador cerrada');
    }

    if (action === 'changeCode') {
      if (val('newCode') !== val('newCode2')) return this.showToast('Los dos códigos nuevos no coinciden', 'error');
      return this.adminCall({ action, oldCode: val('oldCode'), newCode: val('newCode') }, 'Código cambiado. Los demás dispositivos tendrán que volver a entrar.');
    }

    if (action === 'setPot') {
      return this.adminCall({ action, pot: Number(val('pot')) }, 'Bote actualizado');
    }

    if (action === 'setMatch') {
      return this.adminCall({
        action,
        matchId: row.dataset.adminRow,
        status: val('status'),
        score1: Number(val('score1')),
        score2: Number(val('score2'))
      }, 'Resultado guardado');
    }

    if (action === 'saveParticipant') {
      const participantId = row.dataset.adminRow;
      const participant = this.gameManager.getParticipant(participantId);
      const name = val('name');
      if (name && participant && name.trim() !== participant.name) {
        await this.adminCall({ action: 'rename', participantId, name });
      }
      const predictions = {};
      for (const match of this.gameManager.getMatches()) {
        const h = val(`h-${match.id}`);
        const a = val(`a-${match.id}`);
        if (h !== '' && a !== '' && h !== undefined && a !== undefined) {
          predictions[match.id] = { score1: Number(h), score2: Number(a) };
        }
      }
      return this.adminCall({ action: 'setPredictions', participantId, predictions }, 'Participante actualizado');
    }

    if (action === 'setColor') {
      const color = button.dataset.color || null;
      return this.adminCall({ action, participantId: row.dataset.adminRow, color });
    }

    if (action === 'remove') {
      const participant = this.gameManager.getParticipant(row.dataset.adminRow);
      if (!participant || !window.confirm(`¿Quitar a ${participant.name} de la porra?`)) return;
      return this.adminCall({ action, participantId: participant.id }, `${participant.name} ya no está en la porra`);
    }
  }

  updatePotDisplay() {
    if (this.elements.potAmount) {
      this.elements.potAmount.textContent = `${this.gameManager.pot || 0} €`;
    }
  }

  render() {
    this.renderJourneyStatus();
    this.renderHero();
    this.renderMatches();
    this.renderParticipants();
    this.renderRoster();
    this.renderAdmin();
    this.updatePotDisplay();
  }

  // ---------- Utilidades de presentación ----------

  esc(value) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, c => map[c]);
  }

  crest(src, name, size = '') {
    return `<img class="crest ${size}" src="${this.esc(src)}" alt="" loading="lazy" width="64" height="64" onerror="this.src='assets/logos/placeholder.svg'"><span class="sr-only">${this.esc(name)}</span>`;
  }

  kickoffLabel(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    const day = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });
    const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
    return `${day}, ${time}`;
  }

  countdown(ms) {
    if (ms <= 0) return 'ya';
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes} min`;
  }

  firstMatch() {
    return this.gameManager.getMatches()
      .filter(m => m.date)
      .sort((a, b) => a.date - b.date)[0] || null;
  }

  // ---------- Cabecera ----------

  renderJourneyStatus() {
    if (!this.elements.journeyStatus) return;
    const status = this.scheduleService.getJourneyStatus();
    const first = this.firstMatch();
    const pill = this.elements.journeyStatus;
    pill.className = `state-pill state-${status}`;

    if (status === 'open' && first) {
      pill.textContent = `Abierta, cierra en ${this.countdown(first.date - new Date())}`;
    } else if (status === 'live' || status === 'locked') {
      pill.innerHTML = '<span class="live-dot" aria-hidden="true"></span>En juego';
    } else if (status === 'finished') {
      pill.textContent = 'Jornada terminada';
    } else {
      pill.textContent = 'Cargando';
    }
  }

  // ---------- Portada ----------

  renderHero() {
    const round = this.gameManager.currentRound || 1;
    const heroRound = document.getElementById('hero-round');
    if (heroRound) heroRound.textContent = `Jornada ${round}`;
    const meRound = document.getElementById('me-round');
    if (meRound) meRound.textContent = `Jornada ${round}`;
    const currentRound = document.getElementById('current-round');
    if (currentRound) currentRound.textContent = round;

    const me = this.currentParticipant;
    const meTitle = document.getElementById('me-title');
    const meSub = document.getElementById('me-sub');
    if (me && meTitle && meSub) {
      const picks = Object.keys(me.predictions || {}).filter(id => this.gameManager.getMatch(id)).length;
      const total = this.gameManager.getMatches().length;
      meTitle.textContent = `Hola, ${me.name}.`;
      meTitle.className = `hero-title${this.nameClass(me)}`;
      if (!me.active) {
        meSub.textContent = 'Esta jornada te toca mirar desde la grada. El martes empieza otra.';
      } else if (this.scheduleService.canMakePredictions()) {
        meSub.textContent = picks === total
          ? 'Tus resultados están guardados. Si te has equivocado, díselo al administrador.'
          : 'Pon tus tres resultados antes del primer pitido. Solo se guardan una vez.';
      } else if (picks < total) {
        meSub.textContent = 'La jornada empezó sin tus resultados. Habla con el administrador.';
      } else {
        meSub.textContent = 'Sigues vivo. Cruza los dedos.';
      }
    }

    const panel = document.getElementById('kickoff');
    if (!panel) return;
    const first = this.firstMatch();
    if (!first) return;

    const status = this.scheduleService.getJourneyStatus();
    const live = this.gameManager.getMatches().find(m => m.isLive());
    const focus = live || first;
    let big;
    let caption;
    if (live) {
      const last = [...(live.events || [])].reverse().find(e => e.minute);
      big = live.getScore() ? live.getScore().replace('-', ' - ') : 'En juego';
      caption = last ? `En directo, minuto ${this.esc(last.minute)}` : 'En directo';
    } else if (status === 'open') {
      big = this.countdown(first.date - new Date());
      caption = `Primer pitido: ${this.kickoffLabel(first.date)}`;
    } else if (status === 'finished') {
      big = 'Final';
      caption = 'La próxima jornada se abre el martes';
    } else {
      big = 'En juego';
      caption = this.kickoffLabel(first.date);
    }

    const label = live ? 'Ahora mismo' : status === 'open' ? 'Empieza en' : 'Jornada';
    panel.innerHTML = `
      <p class="kickoff-label">${label}</p>
      <p class="kickoff-big">${big}</p>
      <div class="kickoff-match">
        <div class="kickoff-side">${this.crest(focus.team1Logo, focus.team1, 'crest--lg')}<span>${this.esc(focus.team1)}</span></div>
        <span class="kickoff-vs">vs</span>
        <div class="kickoff-side">${this.crest(focus.team2Logo, focus.team2, 'crest--lg')}<span>${this.esc(focus.team2)}</span></div>
      </div>
      <p class="kickoff-caption">${caption}</p>
    `;
  }

  // ---------- Pronósticos ----------

  renderMatches() {
    const matches = this.gameManager.getMatches();
    const canPredict = this.scheduleService.canMakePredictions() && this.currentParticipant;

    if (this.elements.matchesDisplay) {
      this.elements.matchesDisplay.innerHTML = matches.length
        ? matches.map((match, i) => this.renderMatchCard(match, i)).join('')
        : '<p class="empty">Cargando los partidos de la jornada.</p>';
    }

    if (!this.elements.matchesContainer) return;

    // Conserva lo que el usuario está escribiendo si llegan datos de otros
    const typed = {};
    this.elements.matchesContainer.querySelectorAll('.score-input').forEach(input => {
      if (input.value !== '' && input.dataset.dirty) typed[input.name] = input.value;
    });

    const locked = this.hasAllPicks(this.currentParticipant);
    this.elements.matchesContainer.innerHTML = !canPredict
      ? '<p class="empty">La jornada ya ha empezado. Los pronósticos están cerrados.</p>'
      : locked
        ? matches.map(match => this.renderLockedPick(match, this.currentParticipant.getPrediction(match.id))).join('')
        : matches.map(match => this.renderPick(match)).join('');

    const actions = this.elements.predictionForm?.querySelector('.picks-actions');
    if (actions) actions.hidden = !canPredict || locked;
    const sub = document.getElementById('picks-sub');
    if (sub) {
      sub.textContent = locked
        ? 'Guardados. Si te has equivocado, díselo al administrador.'
        : 'Solo se pueden guardar una vez, así que revísalos antes de confirmar.';
    }

    // Con la jornada empezada, los pronósticos de cada uno ya se ven en Supervivientes
    if (this.elements.predictionsSection && this.currentParticipant) {
      this.elements.predictionsSection.style.display = canPredict ? 'block' : 'none';
    }

    if (canPredict && !locked) {
      this.elements.matchesContainer.querySelectorAll('.score-input').forEach(input => {
        if (typed[input.name] !== undefined) {
          input.value = typed[input.name];
          input.dataset.dirty = '1';
        }
      });
      this.bindPredictionInputs();
    }
  }

  renderPick(match) {
    const pred = this.currentParticipant?.getPrediction(match.id);
    const stepper = (side, team, value) => `
      <div class="stepper">
        <button type="button" class="step" data-step="-1" aria-label="Un gol menos para ${this.esc(team)}">&minus;</button>
        <input type="number" inputmode="numeric" min="0" max="20" name="${side}-${this.esc(match.id)}" value="${value ?? ''}" placeholder="0" class="score-input" aria-label="Goles de ${this.esc(team)}">
        <button type="button" class="step" data-step="1" aria-label="Un gol más para ${this.esc(team)}">+</button>
      </div>`;

    return `
      <div class="pick" data-match-id="${this.esc(match.id)}">
        <div class="pick-team pick-home">${this.crest(match.team1Logo, match.team1)}<span class="pick-name">${this.esc(match.team1)}</span></div>
        <div class="pick-score">
          ${stepper('home', match.team1, pred?.score1)}
          <span class="pick-dash" aria-hidden="true">-</span>
          ${stepper('away', match.team2, pred?.score2)}
        </div>
        <div class="pick-team pick-away"><span class="pick-name">${this.esc(match.team2)}</span>${this.crest(match.team2Logo, match.team2)}</div>
        <p class="pick-meta">${this.kickoffLabel(match.date)}</p>
      </div>
    `;
  }

  bindPredictionInputs() {
    const container = this.elements.matchesContainer;
    container.querySelectorAll('.score-input').forEach(input => {
      input.addEventListener('input', () => {
        input.dataset.dirty = '1';
        if (this.confirming) this.setConfirming(false);
      });
    });
    container.querySelectorAll('.step').forEach(button => {
      button.addEventListener('click', () => {
        const input = button.parentElement.querySelector('.score-input');
        const step = Number(button.dataset.step);
        const current = input.value === '' ? 0 : Number(input.value);
        input.value = Math.min(20, Math.max(0, current + step));
        input.dataset.dirty = '1';
        if (this.confirming) this.setConfirming(false);
      });
    });
  }

  // ---------- Partidos ----------

  renderMatchCard(match, index) {
    const isLive = match.isLive();
    const isFinished = match.isFinished();
    const hasScore = match.score1 !== null && match.score2 !== null;
    const time = match.date
      ? match.date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
      : '';
    const state = isLive
      ? '<span class="live-dot" aria-hidden="true"></span>En directo'
      : isFinished ? 'Final' : 'Por jugar';
    const board = hasScore
      ? `${match.score1}<span class="board-dash">-</span>${match.score2}`
      : `<span class="board-time">${time}</span>`;

    return `
      <article class="fixture ${index === 0 ? 'fixture--lead' : ''} ${isLive ? 'is-live' : ''} ${isFinished ? 'is-final' : ''}" data-match-id="${this.esc(match.id)}">
        <header class="fixture-meta">
          <span>${this.kickoffLabel(match.date)}</span>
          <span class="fixture-state">${state}</span>
        </header>
        <div class="fixture-body">
          <div class="side">${this.crest(match.team1Logo, match.team1, 'crest--lg')}<span class="side-name">${this.esc(match.team1)}</span></div>
          <div class="board">${board}</div>
          <div class="side">${this.crest(match.team2Logo, match.team2, 'crest--lg')}<span class="side-name">${this.esc(match.team2)}</span></div>
        </div>
        ${isLive || isFinished ? this.renderMatchEvents(match) : ''}
      </article>
    `;
  }

  renderMatchEvents(match) {
    if (!match.events || match.events.length === 0) {
      return '<p class="timeline-empty">Esta fuente solo da el marcador, sin goleadores ni tarjetas.</p>';
    }
    const items = match.events.map(event => `
      <li class="event ${this.esc(event.type)}${String(event.description).startsWith('Tarjeta roja') ? ' red' : ''}">
        <span class="event-time">${event.minute ? `${this.esc(event.minute)}'` : ''}</span>
        <span class="event-description">${this.esc(event.description)}</span>
      </li>`).join('');
    return `<ol class="timeline">${items}</ol>`;
  }

  // ---------- Supervivientes ----------

  renderParticipants() {
    if (!this.elements.participantsContainer) return;
    const participants = [...this.gameManager.participants]
      .sort((a, b) => (a.active === b.active
        ? a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })
        : a.active ? -1 : 1));
    const alive = participants.filter(p => p.active).length;

    const count = document.getElementById('alive-count');
    if (count) {
      count.textContent = participants.length ? `${alive} de ${participants.length} siguen vivos` : '';
    }

    if (participants.length === 0) {
      this.elements.participantsContainer.innerHTML =
        '<li class="empty">Aún no se ha apuntado nadie. Pon tu nombre arriba y abre la porra.</li>';
      return;
    }

    const started = !this.scheduleService.canMakePredictions();
    const winner = started && alive === 1 && participants.length > 1;

    this.elements.participantsContainer.innerHTML = participants.map(p => {
      const isMe = p.id === this.currentParticipant?.id;
      const outMatch = p.eliminatedInMatch ? this.gameManager.getMatch(p.eliminatedInMatch) : null;
      const outText = outMatch ? `${this.esc(outMatch.team1)} - ${this.esc(outMatch.team2)}` : 'esta jornada';
      const stateText = !p.active ? `Fuera en ${outText}` : winner ? 'Único superviviente' : 'Sigue vivo';
      const classes = ['player', p.active ? '' : 'player--out', isMe ? 'player--me' : '', winner && p.active ? 'player--winner' : ''].join(' ');
      return `
        <li class="${classes}" data-participant-id="${this.esc(p.id)}">
          <span class="monogram" aria-hidden="true">${this.esc(p.name.trim().charAt(0).toUpperCase())}</span>
          <div class="player-main">
            <span class="player-name${this.nameClass(p)}">${this.esc(p.name)}${isMe ? ' <em>Tú</em>' : ''}</span>
            <span class="player-state">${stateText}</span>
          </div>
          <div class="player-picks">${this.renderParticipantPredictions(p)}</div>
        </li>`;
    }).join('');
  }

  renderParticipantPredictions(participant) {
    const matches = this.gameManager.getMatches();
    return matches.map(match => {
      const pred = participant.predictions[match.id];
      if (!pred) return '<span class="chip chip--empty" aria-label="Sin pronóstico">-</span>';
      const settled = match.isFinished();
      const isCorrect = settled && pred.score1 === match.score1 && pred.score2 === match.score2;
      const cls = settled ? (isCorrect ? 'chip--hit' : 'chip--miss') : '';
      return `<span class="chip ${cls}" title="${this.esc(match.team1)} - ${this.esc(match.team2)}">${pred.score1}-${pred.score2}</span>`;
    }).join('');
  }
  // ---------- Lista de nombres ----------

  nameClass(p) {
    return p?.color ? ` name--${this.esc(p.color)}` : '';
  }

  normalize(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  renderRoster() {
    const list = this.elements.roster;
    if (!list) return;
    const query = this.normalize(this.elements.rosterSearch?.value);
    const people = [...this.gameManager.participants]
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }))
      .filter(p => !query || this.normalize(p.name).includes(query));

    if (this.gameManager.participants.length === 0) {
      list.innerHTML = '<li class="roster-empty">Cargando la lista…</li>';
      return;
    }

    if (people.length === 0) {
      const raw = this.elements.rosterSearch?.value.trim() || '';
      list.innerHTML = `<li class="roster-empty">No aparece «${this.esc(raw)}». Añádete aquí abajo.</li>`;
      if (this.elements.participantName && !this.elements.participantName.value) {
        this.elements.participantName.value = raw;
      }
      return;
    }

    list.innerHTML = people.map(p => `
      <li>
        <button type="button" class="roster-name${this.nameClass(p)}${this.hasAllPicks(p) ? ' is-done' : ''}" data-pick-player="${this.esc(p.id)}">
          <span>${this.esc(p.name)}</span>${this.hasAllPicks(p) ? '<span class="roster-done">Hecho</span>' : ''}
        </button>
      </li>`).join('');
  }

  renderLockedPick(match, pred) {
    return `
      <div class="pick pick--locked" data-match-id="${this.esc(match.id)}">
        <div class="pick-team pick-home">${this.crest(match.team1Logo, match.team1)}<span class="pick-name">${this.esc(match.team1)}</span></div>
        <div class="pick-score pick-score--locked">
          <span class="locked-num">${pred ? pred.score1 : '-'}</span>
          <span class="pick-dash" aria-hidden="true">-</span>
          <span class="locked-num">${pred ? pred.score2 : '-'}</span>
        </div>
        <div class="pick-team pick-away"><span class="pick-name">${this.esc(match.team2)}</span>${this.crest(match.team2Logo, match.team2)}</div>
        <p class="pick-meta">${this.kickoffLabel(match.date)}</p>
      </div>`;
  }

  // ---------- Panel del administrador ----------

  renderAdmin(force = false) {
    const section = this.elements.adminSection;
    const panel = this.elements.adminPanel;
    if (!section || !panel) return;

    const token = this.adminToken();
    const wanted = token || window.location.hash === '#admin';
    section.hidden = !wanted;
    if (!wanted) return;

    // No pisar lo que el administrador está escribiendo
    if (!force && (panel.contains(document.activeElement) || panel.querySelector('[data-dirty]'))) return;

    if (!token) {
      panel.innerHTML = this.hasAdmin
        ? `<form class="admin-card admin-login" data-admin-row="login">
             <label class="field-label" for="admin-code">Código de administrador</label>
             <div class="join-row">
               <input class="field" id="admin-code" type="password" name="code" autocomplete="current-password" required>
               <button type="submit" class="btn btn-primary" data-admin-action="login">Entrar</button>
             </div>
           </form>`
        : `<form class="admin-card admin-login" data-admin-row="setup">
             <p class="admin-note">Aún no hay administrador. Crea un código de al menos 6 caracteres; con él podrás entrar desde cualquier dispositivo. Solo se puede crear una vez.</p>
             <label class="field-label" for="admin-new">Código nuevo</label>
             <input class="field" id="admin-new" type="password" name="code" autocomplete="new-password" minlength="6" required>
             <label class="field-label" for="admin-new2">Repite el código</label>
             <input class="field" id="admin-new2" type="password" name="code2" autocomplete="new-password" minlength="6" required>
             <div><button type="submit" class="btn btn-primary" data-admin-action="setup">Crear código</button></div>
           </form>`;
      return;
    }

    const matches = this.gameManager.getMatches();
    const statusOptions = (current) => [['scheduled', 'Por jugar'], ['live', 'En juego'], ['finished', 'Final']]
      .map(([v, label]) => `<option value="${v}"${current === v ? ' selected' : ''}>${label}</option>`).join('');
    const scoreInput = (name, value) =>
      `<input class="admin-score" type="number" inputmode="numeric" min="0" max="20" name="${name}" value="${value ?? ''}">`;

    const matchRows = matches.map((m, i) => `
      <div class="admin-row" data-admin-row="${this.esc(m.id)}">
        <span class="admin-match"><b>P${i + 1}</b> ${this.esc(m.team1)} - ${this.esc(m.team2)}${m.manual ? ' <em class="admin-tag">A mano</em>' : ''}</span>
        <div class="admin-inline">
          ${scoreInput('score1', m.score1)}<span class="admin-dash">-</span>${scoreInput('score2', m.score2)}
          <select name="status" class="admin-select">${statusOptions(m.status)}</select>
          <button type="button" class="btn btn-small" data-admin-action="setMatch">Guardar</button>
        </div>
      </div>`).join('');

    const colors = ['lima', 'amarillo', 'naranja', 'rojo', 'rosa', 'azul', 'blanco'];
    const people = [...this.gameManager.participants]
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }));

    const personRows = people.map(p => `
      <div class="admin-person" data-admin-row="${this.esc(p.id)}" data-name="${this.esc(this.normalize(p.name))}">
        <input class="admin-name${this.nameClass(p)}" name="name" value="${this.esc(p.name)}" aria-label="Nombre">
        <div class="admin-picks">
          ${matches.map((m, i) => {
            const pred = p.predictions?.[m.id];
            return `<span class="admin-pair" title="${this.esc(m.team1)} - ${this.esc(m.team2)}"><b>P${i + 1}</b>${scoreInput(`h-${m.id}`, pred?.score1)}<span class="admin-dash">-</span>${scoreInput(`a-${m.id}`, pred?.score2)}</span>`;
          }).join('')}
        </div>
        <div class="admin-swatches" role="group" aria-label="Color del nombre">
          <button type="button" class="swatch swatch--none${p.color ? '' : ' is-on'}" data-admin-action="setColor" data-color="" aria-label="Sin color"></button>
          ${colors.map(c => `<button type="button" class="swatch swatch--${c}${p.color === c ? ' is-on' : ''}" data-admin-action="setColor" data-color="${c}" aria-label="Color ${c}"></button>`).join('')}
        </div>
        <div class="admin-actions">
          <button type="button" class="btn btn-small" data-admin-action="saveParticipant">Guardar</button>
          <button type="button" class="btn-link" data-admin-action="remove">Quitar</button>
        </div>
      </div>`).join('');

    panel.innerHTML = `
      <div class="admin-card" data-admin-row="pot">
        <h3 class="admin-title">Bote</h3>
        <div class="admin-inline">
          <input class="admin-pot" type="number" inputmode="decimal" min="0" step="1" name="pot" value="${this.gameManager.pot || 0}" aria-label="Bote en euros">
          <span>€</span>
          <button type="button" class="btn btn-small" data-admin-action="setPot">Guardar</button>
        </div>
      </div>

      <div class="admin-card">
        <h3 class="admin-title">Resultados</h3>
        <p class="admin-note">Si la API falla o se equivoca, pon aquí el marcador. Ese partido deja de actualizarse solo.</p>
        ${matchRows || '<p class="admin-note">Todavía no hay partidos.</p>'}
      </div>

      <div class="admin-card">
        <h3 class="admin-title">Participantes</h3>
        <p class="admin-note">${matches.map((m, i) => `P${i + 1}: ${this.esc(m.team1)} - ${this.esc(m.team2)}`).join('<br>')}</p>
        <input class="admin-filter" type="search" name="admin-filter" placeholder="Buscar" aria-label="Buscar participante">
        <div class="admin-people">${personRows}</div>
      </div>

      <form class="admin-card admin-login" data-admin-row="code">
        <h3 class="admin-title">Tu acceso</h3>
        <p class="admin-note">Al cambiar el código se cierran los demás dispositivos donde hayas entrado.</p>
        <input class="field" type="password" name="oldCode" autocomplete="current-password" placeholder="Código actual" aria-label="Código actual">
        <input class="field" type="password" name="newCode" autocomplete="new-password" placeholder="Código nuevo" aria-label="Código nuevo" minlength="6">
        <input class="field" type="password" name="newCode2" autocomplete="new-password" placeholder="Repite el código nuevo" aria-label="Repite el código nuevo" minlength="6">
        <div class="admin-actions">
          <button type="submit" class="btn btn-small" data-admin-action="changeCode">Cambiar código</button>
          <button type="button" class="btn-link" data-admin-action="logout">Cerrar sesión en este dispositivo</button>
        </div>
      </form>
    `;
  }

}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = App;
}