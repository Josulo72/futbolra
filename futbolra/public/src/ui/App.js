const getGameManagerClass = () => (typeof require === 'function' ? require('../core/GameManager') : GameManager);

const ME_KEY = 'futbolra-me';
const ADMIN_KEY = 'futbolra-admin';
const MOTION_KEY = 'futbolra-motion';
const INSTALL_TIP_KEY = 'futbolra-install-tip';

const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Desde aquí el cierre de la jornada se avisa en amarillo
const CLOSING_SOON_MS = 60 * 60 * 1000;

// Siempre con punto de miles (en es-ES, por defecto 1500 saldría sin punto)
const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0, useGrouping: 'always' });
const potNumber = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' });

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
    this.pendingPredictions = null;
    this.elements = {};
  }

  async init(gameManager, dataService, scheduleService, fixturesService) {
    this.gameManager = gameManager;
    this.dataService = dataService;
    this.scheduleService = scheduleService;
    this.fixturesService = fixturesService;

    this.cacheElements();
    this.bindEvents();
    this.setupStadium();
    this.setupInstall();
    await this.loadData();
    await this.ensureRealJourney();

    this.restoreParticipant();
    this.render();
    if (window.location.hash === '#admin') this.scrollToAdmin();

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
      this.showToast('No se han podido cargar los partidos. Se vuelve a intentar sola cada hora.', 'error');
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
      confirmDialog: $('confirm-dialog'),
      confirmList: $('confirm-list'),
      confirmOk: $('confirm-ok'),
      confirmCancel: $('confirm-cancel'),
      confirmError: $('confirm-error'),
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
      adminExit: $('admin-exit'),
      adminLink: $('admin-link'),
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

    el.notMe?.addEventListener('click', () => this.exitUser());
    el.adminExit?.addEventListener('click', () => this.leaveAdmin());

    el.predictionForm?.addEventListener('submit', (e) => this.handlePrediction(e));

    el.confirmOk?.addEventListener('click', () => this.savePredictions());
    el.confirmCancel?.addEventListener('click', () => this.closeConfirm());
    // Ventanas: Esc o pulsar fuera de la tarjeta las cierra con su animación
    document.querySelectorAll('dialog.confirm').forEach(dialog => {
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        this.closeDialog(dialog);
      });
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) this.closeDialog(dialog);
      });
    });

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
      if (e.target.getAttribute('aria-invalid') === 'true') this.clearFieldError(e.target);
      if (e.target.name === 'pot') this.formatPotInput(e.target);
      const row = e.target.closest('[data-admin-row]');
      if (row) row.dataset.dirty = '1';
    });

    window.addEventListener('hashchange', () => {
      this.renderAdmin(true);
      if (window.location.hash === '#admin') this.scrollToAdmin();
    });

    // Avisar antes de salir con marcadores escritos sin guardar
    window.addEventListener('beforeunload', (e) => {
      const inputs = this.elements.matchesContainer?.querySelectorAll('.score-input[data-dirty]') || [];
      if ([...inputs].some(input => input.value !== '')) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
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
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  forgetMe(rerender = true) {
    storage.remove(ME_KEY);
    this.currentParticipant = null;
    this.pendingPredictions = null;
    if (this.elements.confirmDialog?.open) this.elements.confirmDialog.close();
    if (this.elements.joinSection) this.elements.joinSection.style.display = '';
    if (this.elements.mePanel) this.elements.mePanel.hidden = true;
    if (this.elements.predictionsSection) this.elements.predictionsSection.style.display = 'none';
    if (rerender) this.render();
  }

  // Volver al menú principal: la portada con la lista de nombres
  exitUser() {
    this.forgetMe();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    document.getElementById('main')?.focus({ preventScroll: true });
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
    setTimeout(() => {
      toast.classList.add('is-leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 400);
    }, 3600);
  }

  setJoinError(message) {
    const input = this.elements.participantName;
    const error = document.getElementById('join-error');
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (!error) return;
    error.textContent = message || '';
    error.hidden = !message;
  }

  // Error junto al campo: el <p> se enlaza con aria-describedby
  setFieldError(input, message) {
    const error = input && document.getElementById(input.getAttribute('aria-describedby'));
    if (!error) return this.showToast(message, 'error');
    input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    error.hidden = false;
    input.focus();
  }

  clearFieldError(input) {
    input.removeAttribute('aria-invalid');
    const error = document.getElementById(input.getAttribute('aria-describedby'));
    if (!error) return;
    error.textContent = '';
    error.hidden = true;
  }

  async addMe() {
    const name = this.elements.participantName?.value?.trim();
    if (!name) return;
    const button = document.getElementById('join-button');
    const id = (crypto.randomUUID && crypto.randomUUID()) || `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.setJoinError('');
    if (button) {
      button.disabled = true;
      button.textContent = 'Añadiendo…';
    }
    try {
      const data = await this.dataService.join(id, name);
      this.updateFromData(data);
    } catch (error) {
      this.setJoinError(error.message);
      this.elements.participantName?.focus();
      return;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Añadirme';
      }
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

  handlePrediction(e) {
    e.preventDefault();
    if (!this.currentParticipant) return;

    const form = e.target;
    const formData = new FormData(form);
    const predictions = {};
    const missing = [];

    for (const match of this.gameManager.getMatches()) {
      const home = formData.get(`home-${match.id}`);
      const away = formData.get(`away-${match.id}`);
      if (home === null || away === null) continue;
      const score1 = parseInt(home, 10);
      const score2 = parseInt(away, 10);
      if (isNaN(score1)) missing.push(form.elements[`home-${match.id}`]);
      if (isNaN(score2)) missing.push(form.elements[`away-${match.id}`]);
      if (isNaN(score1) || isNaN(score2)) continue;
      predictions[match.id] = { score1, score2 };
    }

    if (missing.length > 0) {
      missing.forEach(input => input.setAttribute('aria-invalid', 'true'));
      this.setFieldError(missing[0], 'Pon el marcador de los tres partidos');
      return;
    }

    this.pendingPredictions = predictions;
    this.openConfirm(predictions);
  }

  // Ventana con el resumen de los tres marcadores antes de guardarlos para siempre
  openConfirm(predictions) {
    const dialog = this.elements.confirmDialog;
    if (!dialog?.showModal) {
      if (window.confirm('¿Guardar tus pronósticos? Solo se guardan una vez.')) this.savePredictions();
      return;
    }
    this.elements.confirmList.innerHTML = this.gameManager.getMatches()
      .filter(m => predictions[m.id])
      .map(m => `
        <li class="confirm-row">
          <span class="confirm-team">${this.crest(m.team1Logo)}<span>${this.esc(m.team1)}</span></span>
          <span class="confirm-score">${predictions[m.id].score1}<span class="board-dash">-</span>${predictions[m.id].score2}</span>
          <span class="confirm-team confirm-team--away"><span>${this.esc(m.team2)}</span>${this.crest(m.team2Logo)}</span>
        </li>`).join('');
    this.setConfirmError('');
    this.openDialog(dialog);
  }

  closeConfirm() {
    return this.closeDialog(this.elements.confirmDialog);
  }

  openDialog(dialog) {
    if (!dialog?.showModal) return;
    this.dialogSeq = (this.dialogSeq || 0) + 1;
    dialog.classList.remove('is-closing');
    dialog.showModal();
  }

  // Cierra con su animación de salida; devuelve una promesa que se cumple al cerrarse
  closeDialog(dialog) {
    if (!dialog?.open) return Promise.resolve();
    const seq = (this.dialogSeq = (this.dialogSeq || 0) + 1);
    return new Promise(resolve => {
      const done = () => {
        // Si se ha vuelto a abrir mientras tanto, no se toca
        if (seq === this.dialogSeq && dialog.open) {
          dialog.classList.remove('is-closing');
          dialog.close();
        }
        resolve();
      };
      dialog.classList.add('is-closing');
      dialog.addEventListener('animationend', done, { once: true });
      setTimeout(done, 250);
    });
  }

  setConfirmError(message) {
    const error = this.elements.confirmError;
    if (!error || !this.elements.confirmDialog?.open) {
      if (message) this.showToast(message, 'error');
      return;
    }
    error.textContent = message || '';
    error.hidden = !message;
  }

  async savePredictions() {
    const predictions = this.pendingPredictions;
    if (!predictions || !this.currentParticipant) return;
    const { confirmOk: ok, confirmCancel: cancel } = this.elements;
    if (ok) {
      ok.disabled = true;
      ok.textContent = 'Guardando…';
    }
    if (cancel) cancel.disabled = true;
    this.setConfirmError('');
    try {
      const data = await this.dataService.submitPredictions(this.currentParticipant.id, predictions);
      this.pendingPredictions = null;
      await this.closeConfirm();
      this.sealing = true;
      this.updateFromData(data);
      this.showToast('Pronósticos guardados');
      document.getElementById('main')?.focus({ preventScroll: true });
    } catch (error) {
      this.setConfirmError(error.message);
    } finally {
      this.sealing = false;
      if (ok) {
        ok.disabled = false;
        ok.textContent = 'Sí, guardar';
      }
      if (cancel) cancel.disabled = false;
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

  // Volver al menú principal: se oculta el panel; la sesión sigue abierta en este dispositivo
  leaveAdmin() {
    if (window.location.hash === '#admin') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    this.renderAdmin(true);
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    document.getElementById('main')?.focus({ preventScroll: true });
  }

  scrollToAdmin() {
    this.elements.adminSection?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  // ---------- Portada: valla LED ----------

  // Se puede pausar (y se recuerda en este dispositivo); fuera de pantalla se para sola
  setupStadium() {
    const stadium = document.getElementById('stadium');
    const button = document.getElementById('led-pause');
    if (!stadium || !button) return;
    const setPaused = (paused) => {
      stadium.classList.toggle('is-paused', paused);
      button.setAttribute('aria-pressed', String(paused));
      const video = stadium.querySelector('video');
      if (video) paused ? video.pause() : video.play().catch(() => {});
    };
    setPaused(storage.get(MOTION_KEY) === 'paused');
    button.addEventListener('click', () => {
      const paused = !stadium.classList.contains('is-paused');
      setPaused(paused);
      storage.set(MOTION_KEY, paused ? 'paused' : 'play');
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        stadium.classList.toggle('is-offscreen', !entry.isIntersecting);
      }).observe(stadium);
    }
  }

  // ---------- App instalable ----------

  // Android/Chrome: su propio aviso sale solo y el botón queda de reserva.
  // iPhone: no hay aviso posible; la tarjeta con los pasos de Safari se abre sola la primera vez.
  setupInstall() {
    const box = document.getElementById('install');
    const button = document.getElementById('install-button');
    if (!box || !button) return;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
    if (standalone) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const dialog = document.getElementById('install-dialog');

    if (ios) {
      box.hidden = false;
      if (!storage.get(INSTALL_TIP_KEY)) {
        storage.set(INSTALL_TIP_KEY, 'shown');
        setTimeout(() => {
          if (!document.querySelector('dialog[open]')) this.openDialog(dialog);
        }, 1500);
      }
    }

    // Sin preventDefault: así Chrome enseña su aviso de instalación por su cuenta
    window.addEventListener('beforeinstallprompt', (e) => {
      this.installPrompt = e;
      box.hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      box.hidden = true;
    });

    button.addEventListener('click', async () => {
      if (ios) {
        this.openDialog(dialog);
        return;
      }
      const prompt = this.installPrompt;
      this.installPrompt = null;
      if (!prompt) return;
      try {
        prompt.prompt();
        await prompt.userChoice;
      } catch (e) {}
      // Si vuelve a ser instalable, Chrome lanza otro beforeinstallprompt y el botón reaparece
      box.hidden = true;
    });
    document.getElementById('install-close')?.addEventListener('click', () => {
      this.closeDialog(document.getElementById('install-dialog'));
    });
  }

  async handleAdminClick(e) {
    const button = e.target.closest('[data-admin-action]');
    if (!button) return;
    const action = button.dataset.adminAction;
    const row = button.closest('[data-admin-row]');
    const val = (name) => row?.querySelector(`[name="${name}"]`)?.value;

    if (action === 'setup') {
      const code = val('code');
      if (code !== val('code2')) return this.setFieldError(row.querySelector('[name="code2"]'), 'Los dos códigos no coinciden. Vuelve a escribir el segundo.');
      return this.adminOpenSession({ action: 'setup', code }, 'Código creado. Ya eres el administrador.');
    }

    if (action === 'login') {
      return this.adminOpenSession({ action: 'login', code: val('code') }, 'Dentro como administrador');
    }

    if (action === 'logout') {
      await this.adminCall({ action: 'logout' });
      storage.remove(ADMIN_KEY);
      this.leaveAdmin();
      return this.showToast('Sesión de administrador cerrada');
    }

    if (action === 'changeCode') {
      if (val('newCode') !== val('newCode2')) return this.setFieldError(row.querySelector('[name="newCode2"]'), 'Los dos códigos nuevos no coinciden. Vuelve a escribir el segundo.');
      return this.adminCall({ action, oldCode: val('oldCode'), newCode: val('newCode') }, 'Código cambiado. Los demás dispositivos tendrán que volver a entrar.');
    }

    if (action === 'setPot') {
      return this.adminCall({ action, pot: this.parsePot(val('pot')) }, 'Bote actualizado');
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
      this.elements.potAmount.textContent = euros.format(this.gameManager.pot || 0);
    }
  }

  render() {
    this.changes = this.collectChanges();
    this.renderJourneyStatus();
    this.renderHero();
    this.renderMatches();
    this.renderParticipants();
    this.renderRoster();
    this.renderAdmin();
    this.updatePotDisplay();
    this.changes = null;
  }

  // Goles y eliminaciones desde el último render, para animarlos una sola vez
  collectChanges() {
    const matches = this.gameManager.getMatches();
    const participants = this.gameManager.participants;
    const scores = {};
    const out = new Set();
    if (this.lastScores) {
      for (const m of matches) {
        const before = this.lastScores[m.id];
        const now = m.getScore();
        if (before && now && before !== now) scores[m.id] = before;
      }
    }
    if (this.lastActive) {
      for (const p of participants) {
        if (this.lastActive[p.id] === true && !p.active) out.add(p.id);
      }
    }
    this.lastScores = Object.fromEntries(matches.map(m => [m.id, m.getScore()]));
    this.lastActive = Object.fromEntries(participants.map(p => [p.id, p.active]));
    return { scores, out };
  }

  // ---------- Utilidades de presentación ----------

  esc(value) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, c => map[c]);
  }

  // Decorativo: el nombre del equipo siempre se ve al lado
  crest(src, size = '', eager = false) {
    const loading = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    return `<img class="crest ${size}" src="${this.esc(src)}" alt="" ${loading} width="64" height="64" onerror="this.src='assets/logos/placeholder.svg'">`;
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
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes} min`;
  }

  // Marcador con dígitos sueltos: el que cambia cae como en un videomarcador
  scoreHTML(match) {
    const before = this.changes?.scores[match.id]?.split('-') || [];
    const digit = (value, old) => (old !== undefined && old !== String(value)
      ? `<span class="digit is-changed"><span class="digit-old" aria-hidden="true">${this.esc(old)}</span><span class="digit-new">${this.esc(value)}</span></span>`
      : `<span class="digit">${this.esc(value)}</span>`);
    return `${digit(match.score1, before[0])}<span class="board-dash">-</span>${digit(match.score2, before[1])}`;
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
    const left = first ? first.date - new Date() : Infinity;
    pill.className = `state-pill state-${status}${status === 'open' && left < CLOSING_SOON_MS ? ' state-closing' : ''}`;

    if (status === 'open' && first) {
      pill.textContent = `Abierta, cierra en ${this.countdown(left)}`;
    } else if (status === 'live' || status === 'locked') {
      pill.innerHTML = '<span class="live-dot" aria-hidden="true"></span>En juego';
    } else if (status === 'finished') {
      pill.textContent = 'Jornada terminada';
    } else {
      pill.textContent = 'Cargando…';
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
      meTitle.innerHTML = `Hola, <span translate="no">${this.esc(me.name)}</span>.`;
      meTitle.className = `hero-title${this.nameClass(me)}`;
      let card = '';
      if (!me.active) {
        card = 'red';
        meSub.textContent = 'Esta jornada te toca mirar desde la grada. El martes empieza otra.';
      } else if (this.scheduleService.canMakePredictions()) {
        if (picks < total) card = 'yellow';
        meSub.textContent = picks === total
          ? 'Tus resultados están guardados. Si te has equivocado, díselo al administrador.'
          : 'Pon tus tres resultados antes del primer pitido. Solo se guardan una vez.';
      } else if (picks < total) {
        card = 'yellow';
        meSub.textContent = 'La jornada empezó sin tus resultados. Habla con el administrador.';
      } else {
        meSub.textContent = 'Sigues vivo. Cruza los dedos.';
      }
      meSub.dataset.card = card;
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
    let bigClass = '';
    if (live) {
      const last = [...(live.events || [])].reverse().find(e => e.minute);
      big = live.getScore() ? this.scoreHTML(live) : 'En juego';
      if (this.changes?.scores[live.id]) bigClass = ' is-goal';
      caption = last ? `En directo, minuto ${this.esc(last.minute)}` : 'En directo';
    } else if (status === 'open') {
      const left = first.date - new Date();
      big = this.countdown(left);
      if (left < CLOSING_SOON_MS) bigClass = ' is-closing';
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
      <p class="kickoff-big${bigClass}">${big}</p>
      <div class="kickoff-match">
        <div class="kickoff-side">${this.crest(focus.team1Logo, 'crest--lg', true)}<span>${this.esc(focus.team1)}</span></div>
        <span class="kickoff-vs">vs</span>
        <div class="kickoff-side">${this.crest(focus.team2Logo, 'crest--lg', true)}<span>${this.esc(focus.team2)}</span></div>
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
        : '<p class="empty">Cargando los partidos de la jornada…</p>';
    }

    if (!this.elements.matchesContainer) return;

    // Conserva lo que el usuario está escribiendo (y el foco) si llegan datos de otros
    const active = this.elements.matchesContainer.contains(document.activeElement) ? document.activeElement : null;
    const focusName = active?.closest('.stepper')?.querySelector('.score-input')?.name;
    const focusStep = active?.dataset.step;
    const typed = {};
    this.elements.matchesContainer.querySelectorAll('.score-input').forEach(input => {
      if (input.value !== '' && input.dataset.dirty) typed[input.name] = input.value;
    });

    const locked = this.hasAllPicks(this.currentParticipant);
    this.elements.matchesContainer.innerHTML = !canPredict
      ? '<p class="empty">La jornada ya ha empezado. Los pronósticos están cerrados.</p>'
      : locked
        ? matches.map((match, i) => this.renderLockedPick(match, this.currentParticipant.getPrediction(match.id), i)).join('')
        : matches.map(match => this.renderPick(match)).join('');

    const actions = this.elements.predictionForm?.querySelector('.picks-actions');
    if (actions) actions.hidden = !canPredict || locked;
    const sub = document.getElementById('picks-sub');
    if (sub) {
      sub.textContent = locked
        ? 'Guardados. Si te has equivocado, díselo al administrador.'
        : 'Marca los goles de cada equipo con + y −. Cuando tengas los tres partidos, pulsa Guardar pronósticos.';
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
      if (focusName) {
        const input = this.elements.matchesContainer.querySelector(`[name="${CSS.escape(focusName)}"]`);
        const target = focusStep ? input?.parentElement.querySelector(`[data-step="${focusStep}"]`) : input;
        target?.focus({ preventScroll: true });
      }
    }
  }

  renderPick(match) {
    const pred = this.currentParticipant?.getPrediction(match.id);
    const stepper = (side, team, value) => `
      <div class="stepper">
        <button type="button" class="step" data-step="-1" aria-label="Un gol menos para ${this.esc(team)}">&minus;</button>
        <input type="number" inputmode="numeric" min="0" max="20" name="${side}-${this.esc(match.id)}" value="${value ?? 0}" autocomplete="off" class="score-input" aria-label="Goles de ${this.esc(team)}" aria-describedby="picks-error">
        <button type="button" class="step" data-step="1" aria-label="Un gol más para ${this.esc(team)}">+</button>
      </div>`;

    return `
      <div class="pick" data-match-id="${this.esc(match.id)}">
        <div class="pick-team pick-home">${this.crest(match.team1Logo)}<span class="pick-name">${this.esc(match.team1)}</span></div>
        <div class="pick-score">
          ${stepper('home', match.team1, pred?.score1)}
          <span class="pick-dash" aria-hidden="true">-</span>
          ${stepper('away', match.team2, pred?.score2)}
        </div>
        <div class="pick-team pick-away"><span class="pick-name">${this.esc(match.team2)}</span>${this.crest(match.team2Logo)}</div>
        <p class="pick-meta">${this.kickoffLabel(match.date)}</p>
      </div>
    `;
  }

  bindPredictionInputs() {
    const container = this.elements.matchesContainer;
    container.querySelectorAll('.score-input').forEach(input => {
      input.addEventListener('input', () => {
        input.dataset.dirty = '1';
        this.clearFieldError(input);      });
    });
    container.querySelectorAll('.step').forEach(button => {
      button.addEventListener('click', () => {
        const input = button.parentElement.querySelector('.score-input');
        const step = Number(button.dataset.step);
        const before = input.value;
        const current = before === '' ? 0 : Number(before);
        input.value = Math.min(20, Math.max(0, current + step));
        input.dataset.dirty = '1';
        this.clearFieldError(input);
        // El número nuevo entra desde arriba al sumar y desde abajo al restar
        if (input.value !== before && input.animate && !prefersReducedMotion()) {
          input.animate([
            { transform: `translateY(${step > 0 ? -40 : 40}%)`, opacity: 0.2 },
            { transform: 'none', opacity: 1 }
          ], { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
        }      });
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
    const board = hasScore ? this.scoreHTML(match) : `<span class="board-time">${time}</span>`;
    const goal = Boolean(this.changes?.scores[match.id]);

    return `
      <article class="fixture ${index === 0 ? 'fixture--lead' : ''} ${isLive ? 'is-live' : ''} ${isFinished ? 'is-final' : ''} ${goal ? 'is-goal' : ''}" data-match-id="${this.esc(match.id)}">
        <header class="fixture-meta">
          <span>${this.kickoffLabel(match.date)}</span>
          <span class="fixture-state">${state}</span>
        </header>
        <div class="fixture-body">
          <div class="side">${this.crest(match.team1Logo, 'crest--lg')}<span class="side-name">${this.esc(match.team1)}</span></div>
          <div class="board">${board}</div>
          <div class="side">${this.crest(match.team2Logo, 'crest--lg')}<span class="side-name">${this.esc(match.team2)}</span></div>
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
        <span class="event-time">${event.minute ? `${this.esc(event.minute)}′` : ''}</span>
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
    const container = this.elements.participantsContainer;
    const out = this.changes?.out || new Set();

    // FLIP: posiciones antes de reordenar, para que los eliminados bajen a la grada
    const animateMove = out.size > 0 && !prefersReducedMotion();
    const before = new Map();
    if (animateMove) {
      container.querySelectorAll('[data-participant-id]').forEach(row => {
        before.set(row.dataset.participantId, row.getBoundingClientRect());
      });
    }
    this.prevChips = this.lastChips;
    this.lastChips = {};

    container.innerHTML = participants.map((p, i) => {
      const isMe = p.id === this.currentParticipant?.id;
      const outMatch = p.eliminatedInMatch ? this.gameManager.getMatch(p.eliminatedInMatch) : null;
      const outText = outMatch ? `${this.esc(outMatch.team1)} - ${this.esc(outMatch.team2)}` : 'esta jornada';
      const stateText = !p.active ? `Fuera en ${outText}` : winner ? 'Único superviviente' : 'Sigue vivo';
      const classes = ['player', p.active ? '' : 'player--out', isMe ? 'player--me' : '', winner && p.active ? 'player--winner' : '', out.has(p.id) ? 'is-just-out' : ''].join(' ');
      return `
        <li class="${classes}" data-participant-id="${this.esc(p.id)}">
          <span class="monogram" aria-hidden="true">${this.esc(p.name.trim().charAt(0).toUpperCase())}</span>
          <div class="player-main">
            <span class="player-name${this.nameClass(p)}" title="${this.esc(p.name)}"><span translate="no">${this.esc(p.name)}</span>${isMe ? ' <em>Tú</em>' : ''}</span>
            <span class="player-state">${stateText}</span>
          </div>
          <div class="player-picks">${this.renderParticipantPredictions(p, i)}</div>
        </li>`;
    }).join('');

    if (!animateMove) return;
    container.querySelectorAll('[data-participant-id]').forEach(row => {
      const from = before.get(row.dataset.participantId);
      if (!from || !row.animate) return;
      const to = row.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (!dx && !dy) return;
      // Primero la roja, luego el paseíllo a su sitio
      row.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: 560, delay: 420, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' }
      );
    });
  }

  // Cada chip dice cómo va ese pronóstico: acertado, va acertando, va fallando o el que le echó
  renderParticipantPredictions(participant, row = 0) {
    const matches = this.gameManager.getMatches();
    return matches.map(match => {
      const pred = participant.predictions[match.id];
      if (!pred) return '<span class="chip chip--empty"><span aria-hidden="true">-</span><span class="sr-only">Sin pronóstico</span></span>';
      const same = pred.score1 === match.score1 && pred.score2 === match.score2;
      let state = '';
      let note = '';
      if (match.isFinished()) {
        if (same) [state, note] = ['hit', 'acertado'];
        else if (participant.eliminatedInMatch === match.id) [state, note] = ['out', 'le eliminó'];
        else [state, note] = ['miss', 'fallado'];
      } else if (match.isLive() && match.getScore()) {
        [state, note] = same ? ['on', 'de momento acierta'] : ['off', 'de momento falla'];
      }
      const key = `${participant.id}:${match.id}`;
      this.lastChips[key] = state;
      const flip = Boolean(state && this.prevChips && key in this.prevChips && this.prevChips[key] !== state);
      const delay = Math.min(row * 40, 320) + (this.changes?.scores[match.id] ? 280 : 0);
      const cls = ['chip', state && `chip--${state}`, flip && 'is-flip'].filter(Boolean).join(' ');
      return `<span class="${cls}"${flip ? ` style="--d:${delay}ms"` : ''} title="${this.esc(match.team1)} - ${this.esc(match.team2)}">${pred.score1}-${pred.score2}${note ? `<span class="sr-only">, ${note}</span>` : ''}</span>`;
    }).join('');
  }
  // ---------- Lista de nombres ----------

  nameClass(p) {
    return p?.color ? ` name--${this.esc(p.color)}` : '';
  }

  // Bote con puntos de miles mientras se escribe (1.234.567,50), sin mover el cursor de sitio
  formatPotInput(input) {
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const kept = (text) => text.replace(/[^\d,]/g, '');
    const typedBefore = kept(raw.slice(0, caret)).length;
    const [intPart = '', ...rest] = kept(raw).split(',');
    const decimals = rest.length ? `,${rest.join('').slice(0, 2)}` : '';
    input.value = (intPart ? potNumber.format(Number(intPart)) : '') + decimals;
    let pos = 0;
    for (let seen = 0; pos < input.value.length && seen < typedBefore; pos++) {
      if (/[\d,]/.test(input.value[pos])) seen++;
    }
    input.setSelectionRange(pos, pos);
  }

  parsePot(value) {
    return Number(String(value ?? '').replace(/\./g, '').replace(',', '.')) || 0;
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
          <span class="roster-label" translate="no">${this.esc(p.name)}</span>${this.hasAllPicks(p) ? '<span class="roster-done">Hecho</span>' : ''}
        </button>
      </li>`).join('');
  }

  renderLockedPick(match, pred, index = 0) {
    return `
      <div class="pick pick--locked${this.sealing ? ' is-sealing' : ''}" style="--i:${index}" data-match-id="${this.esc(match.id)}">
        <div class="pick-team pick-home">${this.crest(match.team1Logo)}<span class="pick-name">${this.esc(match.team1)}</span></div>
        <div class="pick-score pick-score--locked">
          <span class="locked-num">${pred ? pred.score1 : '-'}</span>
          <span class="pick-dash" aria-hidden="true">-</span>
          <span class="locked-num">${pred ? pred.score2 : '-'}</span>
        </div>
        <div class="pick-team pick-away"><span class="pick-name">${this.esc(match.team2)}</span>${this.crest(match.team2Logo)}</div>
        <p class="pick-meta">${this.kickoffLabel(match.date)}</p>
      </div>`;
  }

  // ---------- Panel del administrador ----------

  renderAdmin(force = false) {
    const section = this.elements.adminSection;
    const panel = this.elements.adminPanel;
    if (!section || !panel) return;

    const token = this.adminToken();
    const wanted = window.location.hash === '#admin';
    section.hidden = !wanted;
    // Con sesión abierta, el pie enlaza con el panel para volver a entrar
    if (this.elements.adminLink) this.elements.adminLink.hidden = !token || wanted;
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
             <input class="field" id="admin-new2" type="password" name="code2" autocomplete="new-password" minlength="6" required aria-describedby="admin-setup-error">
             <p class="field-error" id="admin-setup-error" role="alert" hidden></p>
             <div><button type="submit" class="btn btn-primary" data-admin-action="setup">Crear código</button></div>
           </form>`;
      return;
    }

    const matches = this.gameManager.getMatches();
    const statusOptions = (current) => [['scheduled', 'Por jugar'], ['live', 'En juego'], ['finished', 'Final']]
      .map(([v, label]) => `<option value="${v}"${current === v ? ' selected' : ''}>${label}</option>`).join('');
    const scoreInput = (name, value, label) =>
      `<input class="admin-score" type="number" inputmode="numeric" min="0" max="20" name="${name}" value="${value ?? ''}" autocomplete="off" aria-label="${this.esc(label)}">`;

    const matchRows = matches.map((m, i) => `
      <div class="admin-row" data-admin-row="${this.esc(m.id)}">
        <span class="admin-match"><b>P${i + 1}</b> ${this.esc(m.team1)} - ${this.esc(m.team2)}${m.manual ? ' <em class="admin-tag">A mano</em>' : ''}</span>
        <div class="admin-inline">
          ${scoreInput('score1', m.score1, `Goles de ${m.team1}`)}<span class="admin-dash">-</span>${scoreInput('score2', m.score2, `Goles de ${m.team2}`)}
          <select name="status" class="admin-select" aria-label="Estado de ${this.esc(m.team1)} - ${this.esc(m.team2)}">${statusOptions(m.status)}</select>
          <button type="button" class="btn btn-small" data-admin-action="setMatch">Guardar</button>
        </div>
      </div>`).join('');

    const colors = ['lima', 'amarillo', 'naranja', 'rojo', 'rosa', 'azul', 'blanco'];
    const people = [...this.gameManager.participants]
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }));

    const personRows = people.map(p => `
      <div class="admin-person" data-admin-row="${this.esc(p.id)}" data-name="${this.esc(this.normalize(p.name))}">
        <input class="admin-name${this.nameClass(p)}" name="name" value="${this.esc(p.name)}" autocomplete="off" spellcheck="false" aria-label="Nombre de ${this.esc(p.name)}">
        <div class="admin-picks">
          ${matches.map((m, i) => {
            const pred = p.predictions?.[m.id];
            return `<span class="admin-pair" title="${this.esc(m.team1)} - ${this.esc(m.team2)}"><b>P${i + 1}</b>${scoreInput(`h-${m.id}`, pred?.score1, `${p.name}: goles de ${m.team1}`)}<span class="admin-dash">-</span>${scoreInput(`a-${m.id}`, pred?.score2, `${p.name}: goles de ${m.team2}`)}</span>`;
          }).join('')}
        </div>
        <div class="admin-swatches" role="group" aria-label="Color del nombre">
          <button type="button" class="swatch swatch--none${p.color ? '' : ' is-on'}" data-admin-action="setColor" data-color="" aria-label="Sin color" aria-pressed="${!p.color}"></button>
          ${colors.map(c => `<button type="button" class="swatch swatch--${c}${p.color === c ? ' is-on' : ''}" data-admin-action="setColor" data-color="${c}" aria-label="Color ${c}" aria-pressed="${p.color === c}"></button>`).join('')}
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
          <span class="admin-money">
            <input class="admin-pot" type="text" inputmode="decimal" name="pot" value="${potNumber.format(this.gameManager.pot || 0)}" autocomplete="off" spellcheck="false" aria-label="Bote en euros">
            <span aria-hidden="true">€</span>
          </span>
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
        <input class="admin-filter" type="search" name="admin-filter" autocomplete="off" placeholder="Buscar…" aria-label="Buscar participante">
        <div class="admin-people">${personRows}</div>
      </div>

      <form class="admin-card admin-login" data-admin-row="code">
        <h3 class="admin-title">Tu acceso</h3>
        <p class="admin-note">Al cambiar el código se cierran los demás dispositivos donde hayas entrado.</p>
        <div>
          <label class="field-label" for="admin-old">Código actual</label>
          <input class="field" id="admin-old" type="password" name="oldCode" autocomplete="current-password">
        </div>
        <div>
          <label class="field-label" for="admin-new-code">Código nuevo</label>
          <input class="field" id="admin-new-code" type="password" name="newCode" autocomplete="new-password" minlength="6">
        </div>
        <div>
          <label class="field-label" for="admin-new-code2">Repite el código nuevo</label>
          <input class="field" id="admin-new-code2" type="password" name="newCode2" autocomplete="new-password" minlength="6" aria-describedby="admin-code-error">
          <p class="field-error" id="admin-code-error" role="alert" hidden></p>
        </div>
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