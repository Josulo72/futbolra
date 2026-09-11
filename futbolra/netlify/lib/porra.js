// Reglas de la porra en el servidor. Sin E/S: la función de Netlify lee y guarda,
// este módulo solo transforma el estado. Así se puede probar con Jest.
const crypto = require('crypto');

const REAL_ID = /^(espn|tsdb)-/;
const MAX_NAME = 40;

// Nombres de partida (LAPORRA.xlsx). Se cargan una sola vez; después manda el administrador.
const SEED_NAMES = [
  ...Array.from({ length: 20 }, (_, i) => `DIAMANTE ${i + 1}`),
  'MILE', 'SOLIS', 'HUGO', 'CESAR', 'TIO', 'GERARD', 'TOMADRE', 'JOSULO',
];

// Colores que el administrador puede dar a un nombre
const NAME_COLORS = ['lima', 'amarillo', 'naranja', 'rojo', 'rosa', 'azul', 'blanco'];

const slug = (name) => normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const emptyGame = () => ({
  matches: [],
  participants: [],
  currentRound: 0,
  pot: 0,
  journeyLocked: false,
  journeyStartDate: null,
  journeyEndDate: null,
  // codeHash/salt: huella del código del administrador (nunca el código)
  // sessions: huellas de los dispositivos con sesión abierta
  admin: { codeHash: null, salt: null, sessions: [], failed: 0, lockedUntil: 0 },
});

class PorraError extends Error {
  // persist: el estado ha cambiado aunque haya error (p. ej. contar un intento fallido)
  constructor(message, status = 400, persist = false) {
    super(message);
    this.status = status;
    this.persist = persist;
  }
}

const MIN_CODE = 6;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 10;

const isRealJourney = (matches) =>
  Array.isArray(matches) && matches.length > 0 && matches.every((m) => REAL_ID.test(String(m.id)));

const normalizeName = (name) =>
  String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim();

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const hashCode = (code, salt) => crypto.scryptSync(String(code), salt, 32).toString('hex');

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const isScore = (n) => Number.isInteger(n) && n >= 0 && n <= 20;

function firstKickoff(game) {
  const times = game.matches.map((m) => new Date(m.date).getTime()).filter((t) => !isNaN(t));
  return times.length ? Math.min(...times) : null;
}

function journeyStarted(game, now = Date.now()) {
  const first = firstKickoff(game);
  return first !== null && now >= first;
}

// Lo que ve cualquier visitante: sin el hash del administrador
function publicGame(game) {
  const { admin, adminHash, ...rest } = game;
  return { ...rest, hasAdmin: Boolean(admin?.codeHash) };
}

// Recalcula eliminaciones desde cero con los partidos terminados, en orden de fecha.
// Así una corrección del administrador deja el estado siempre coherente.
function recomputeEliminations(game) {
  for (const p of game.participants) {
    p.active = true;
    p.eliminatedAt = null;
    p.eliminatedInMatch = null;
  }
  const finished = game.matches
    .filter((m) => m.status === 'finished' && m.score1 !== null && m.score2 !== null)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const match of finished) {
    // Si solo queda uno vivo, es el ganador y no se elimina a nadie más
    if (game.participants.filter((p) => p.active).length <= 1) break;
    for (const p of game.participants) {
      if (!p.active) continue;
      const pred = p.predictions?.[match.id];
      if (!pred || pred.score1 !== match.score1 || pred.score2 !== match.score2) {
        p.active = false;
        p.eliminatedAt = match.date || null;
        p.eliminatedInMatch = match.id;
      }
    }
  }
  game.journeyLocked = game.matches.some((m) => m.status && m.status !== 'scheduled');
  return game;
}

// Nueva jornada: solo si es posterior a la guardada o si la guardada no es real
function applyJourney(game, journey) {
  if (!journey || !isRealJourney(journey.matches)) return false;
  const newer = (journey.currentRound || 0) > (game.currentRound || 0);
  if (!newer && isRealJourney(game.matches)) return false;
  game.matches = journey.matches.map((m) => ({ ...m, manual: false }));
  game.currentRound = journey.currentRound;
  game.journeyStartDate = journey.journeyStartDate || null;
  game.journeyEndDate = journey.journeyEndDate || null;
  recomputeEliminations(game);
  return true;
}

function seedParticipants(game, names = SEED_NAMES) {
  if (game.seeded) return false;
  for (const name of names) {
    const exists = game.participants.some((p) => normalizeName(p.name) === normalizeName(name));
    if (!exists) {
      game.participants.push({
        id: `seed-${slug(name)}`,
        name,
        predictions: {},
        active: true,
        eliminatedAt: null,
        eliminatedInMatch: null,
        points: 0,
        color: null,
      });
    }
  }
  game.seeded = true;
  recomputeEliminations(game);
  return true;
}

function addParticipant(game, { id, name }) {
  const clean = cleanName(name);
  if (typeof id !== 'string' || !id || id.length > 64) throw new PorraError('Identificador no válido');
  if (clean.length < 2 || clean.length > MAX_NAME) throw new PorraError('El nombre debe tener entre 2 y 40 letras');
  const existing = game.participants.find((p) => normalizeName(p.name) === normalizeName(clean));
  if (existing) throw new PorraError(`${existing.name} ya está en la lista. Búscalo y púlsalo.`, 409);
  if (game.participants.some((p) => p.id === id)) throw new PorraError('Identificador repetido', 409);
  const participant = {
    id,
    name: clean,
    predictions: {},
    active: true,
    eliminatedAt: null,
    eliminatedInMatch: null,
    points: 0,
    color: null,
  };
  game.participants.push(participant);
  recomputeEliminations(game);
  return participant;
}

function parsePredictions(game, predictions) {
  const matchIds = new Set(game.matches.map((m) => m.id));
  const result = {};
  for (const [matchId, pred] of Object.entries(predictions || {})) {
    if (!matchIds.has(matchId)) continue;
    const score1 = Number(pred?.score1);
    const score2 = Number(pred?.score2);
    if (!isScore(score1) || !isScore(score2)) throw new PorraError('Marcador no válido');
    result[matchId] = { score1, score2 };
  }
  return result;
}

// Cada uno pone sus resultados una sola vez y antes del primer partido
function submitPredictions(game, participantId, predictions, now = Date.now()) {
  const participant = game.participants.find((p) => p.id === participantId);
  if (!participant) throw new PorraError('No estás en la lista', 404);
  if (journeyStarted(game, now)) throw new PorraError('La jornada ya ha empezado', 409);

  const parsed = parsePredictions(game, predictions);
  const pending = game.matches.filter((m) => !participant.predictions?.[m.id]);
  if (pending.length === 0) throw new PorraError('Ya tienes los resultados puestos. Si te has equivocado, díselo al administrador.', 409);
  if (pending.some((m) => !parsed[m.id])) throw new PorraError('Pon el marcador de los tres partidos');

  participant.predictions = { ...participant.predictions };
  for (const m of pending) participant.predictions[m.id] = parsed[m.id];
  recomputeEliminations(game);
  return participant;
}

// Marcadores del directo; los partidos corregidos a mano por el administrador no se tocan
function applyLiveUpdates(game, updates) {
  for (const match of game.matches) {
    const u = updates[match.id];
    if (!u || match.manual || match.status === 'finished') continue;
    match.status = u.status;
    if (u.score1 !== null && u.score2 !== null) {
      match.score1 = u.score1;
      match.score2 = u.score2;
    }
    if (u.events) match.events = u.events;
  }
  recomputeEliminations(game);
  return game;
}

// ---------- Administrador ----------

function adminState(game) {
  game.admin = { codeHash: null, salt: null, sessions: [], failed: 0, lockedUntil: 0, ...(game.admin || {}) };
  return game.admin;
}

function openSession(state) {
  const token = crypto.randomBytes(32).toString('hex');
  state.sessions = [...(state.sessions || []), hashToken(token)].slice(-MAX_SESSIONS);
  return token;
}

function checkCode(state, code, now) {
  if (state.lockedUntil && now < state.lockedUntil) {
    const minutes = Math.ceil((state.lockedUntil - now) / 60000);
    throw new PorraError(`Demasiados intentos. Prueba dentro de ${minutes} min.`, 429);
  }
  if (!state.codeHash || !safeEqual(hashCode(code, state.salt), state.codeHash)) {
    state.failed = (state.failed || 0) + 1;
    if (state.failed >= MAX_FAILED) {
      state.failed = 0;
      state.lockedUntil = now + LOCK_MS;
    }
    throw new PorraError('Código incorrecto', 403, true);
  }
  state.failed = 0;
  state.lockedUntil = 0;
}

function validCode(code) {
  if (typeof code !== 'string' || code.length < MIN_CODE || code.length > 64) {
    throw new PorraError(`El código debe tener al menos ${MIN_CODE} caracteres`);
  }
}

// Devuelve { token } cuando abre sesión; en el resto, {}
function adminAction(game, admin, now = Date.now()) {
  const state = adminState(game);
  const action = admin?.action;

  if (action === 'setup') {
    if (state.codeHash) throw new PorraError('Ya hay un código de administrador', 409);
    validCode(admin.code);
    state.salt = crypto.randomBytes(16).toString('hex');
    state.codeHash = hashCode(admin.code, state.salt);
    state.sessions = [];
    return { token: openSession(state) };
  }

  if (action === 'login') {
    checkCode(state, admin.code, now);
    return { token: openSession(state) };
  }

  const tokenHash = typeof admin?.token === 'string' ? hashToken(admin.token) : null;
  if (!tokenHash || !(state.sessions || []).includes(tokenHash)) {
    throw new PorraError('Tu sesión de administrador ha caducado. Vuelve a entrar.', 401);
  }

  if (action === 'logout') {
    state.sessions = state.sessions.filter((h) => h !== tokenHash);
    return {};
  }

  if (action === 'changeCode') {
    checkCode(state, admin.oldCode, now);
    validCode(admin.newCode);
    state.salt = crypto.randomBytes(16).toString('hex');
    state.codeHash = hashCode(admin.newCode, state.salt);
    // Cierra el resto de dispositivos y deja abierto este
    state.sessions = [tokenHash];
    return {};
  }

  switch (action) {
    case 'setPot': {
      const pot = Number(admin.pot);
      if (!Number.isFinite(pot) || pot < 0 || pot > 100000) throw new PorraError('Bote no válido');
      game.pot = Math.round(pot * 100) / 100;
      break;
    }
    case 'setMatch': {
      const match = game.matches.find((m) => m.id === admin.matchId);
      if (!match) throw new PorraError('Partido no encontrado', 404);
      const status = admin.status;
      if (!['scheduled', 'live', 'finished'].includes(status)) throw new PorraError('Estado no válido');
      if (status === 'scheduled') {
        match.score1 = null;
        match.score2 = null;
      } else {
        const score1 = Number(admin.score1);
        const score2 = Number(admin.score2);
        if (!isScore(score1) || !isScore(score2)) throw new PorraError('Marcador no válido');
        match.score1 = score1;
        match.score2 = score2;
      }
      match.status = status;
      match.manual = admin.manual !== false;
      break;
    }
    case 'setPredictions': {
      const participant = game.participants.find((p) => p.id === admin.participantId);
      if (!participant) throw new PorraError('Participante no encontrado', 404);
      participant.predictions = { ...participant.predictions, ...parsePredictions(game, admin.predictions) };
      break;
    }
    case 'rename': {
      const participant = game.participants.find((p) => p.id === admin.participantId);
      if (!participant) throw new PorraError('Participante no encontrado', 404);
      const clean = cleanName(admin.name);
      if (clean.length < 2 || clean.length > MAX_NAME) throw new PorraError('El nombre debe tener entre 2 y 40 letras');
      const dup = game.participants.find((p) => p.id !== participant.id && normalizeName(p.name) === normalizeName(clean));
      if (dup) throw new PorraError(`${dup.name} ya está en la lista`, 409);
      participant.name = clean;
      break;
    }
    case 'setColor': {
      const participant = game.participants.find((p) => p.id === admin.participantId);
      if (!participant) throw new PorraError('Participante no encontrado', 404);
      if (admin.color !== null && !NAME_COLORS.includes(admin.color)) throw new PorraError('Color no válido');
      participant.color = admin.color;
      break;
    }
    case 'remove': {
      game.participants = game.participants.filter((p) => p.id !== admin.participantId);
      break;
    }
    default:
      throw new PorraError('Acción desconocida');
  }
  recomputeEliminations(game);
  return {};
}

module.exports = {
  SEED_NAMES,
  NAME_COLORS,
  seedParticipants,
  PorraError,
  emptyGame,
  isRealJourney,
  normalizeName,
  hashToken,
  journeyStarted,
  publicGame,
  recomputeEliminations,
  applyJourney,
  addParticipant,
  submitPredictions,
  applyLiveUpdates,
  adminAction,
};
