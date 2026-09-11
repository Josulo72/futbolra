const porra = require('../../netlify/lib/porra');

const HOUR = 60 * 60 * 1000;
const CODE = 'codigo-de-prueba';
const setupAdmin = (game) => porra.adminAction(game, { action: 'setup', code: CODE }).token;

function makeGame(startInMs = 24 * HOUR) {
  const base = Date.now() + startInMs;
  const game = porra.emptyGame();
  porra.applyJourney(game, {
    currentRound: 1,
    matches: [
      { id: 'espn-1', team1: 'Real Madrid', team2: 'Rayo', date: new Date(base).toISOString(), status: 'scheduled', score1: null, score2: null },
      { id: 'espn-2', team1: 'Levante', team2: 'Barcelona', date: new Date(base + HOUR * 3).toISOString(), status: 'scheduled', score1: null, score2: null },
      { id: 'tsdb-3', team1: 'Fabril', team2: 'Ponferradina', date: new Date(base + HOUR * 6).toISOString(), status: 'scheduled', score1: null, score2: null },
    ],
  });
  return game;
}

const picks = (a, b, c) => ({
  'espn-1': { score1: a[0], score2: a[1] },
  'espn-2': { score1: b[0], score2: b[1] },
  'tsdb-3': { score1: c[0], score2: c[1] },
});

describe('lista de participantes', () => {
  test('añade un participante nuevo', () => {
    const game = makeGame();
    porra.addParticipant(game, { id: 'a', name: '  Lucía  ' });
    expect(game.participants).toHaveLength(1);
    expect(game.participants[0].name).toBe('Lucía');
  });

  test('no deja repetir un nombre aunque cambien tildes o mayúsculas', () => {
    const game = makeGame();
    porra.addParticipant(game, { id: 'a', name: 'Lucía' });
    expect(() => porra.addParticipant(game, { id: 'b', name: 'lucia' })).toThrow(/ya está en la lista/);
  });

  test('rechaza nombres demasiado cortos', () => {
    const game = makeGame();
    expect(() => porra.addParticipant(game, { id: 'a', name: 'L' })).toThrow();
  });
});

describe('pronósticos', () => {
  test('se guardan una sola vez', () => {
    const game = makeGame();
    porra.addParticipant(game, { id: 'a', name: 'Lucía' });
    porra.submitPredictions(game, 'a', picks([1, 0], [1, 1], [0, 2]));
    expect(game.participants[0].predictions['espn-1']).toEqual({ score1: 1, score2: 0 });
    expect(() => porra.submitPredictions(game, 'a', picks([3, 0], [0, 0], [0, 0]))).toThrow(/Ya tienes/);
    expect(game.participants[0].predictions['espn-1']).toEqual({ score1: 1, score2: 0 });
  });

  test('hay que poner los tres partidos', () => {
    const game = makeGame();
    porra.addParticipant(game, { id: 'a', name: 'Lucía' });
    expect(() => porra.submitPredictions(game, 'a', { 'espn-1': { score1: 1, score2: 0 } })).toThrow(/tres partidos/);
  });

  test('no se aceptan con la jornada empezada', () => {
    const game = makeGame(-HOUR);
    porra.addParticipant(game, { id: 'a', name: 'Lucía' });
    expect(() => porra.submitPredictions(game, 'a', picks([1, 0], [1, 1], [0, 2]))).toThrow(/empezado/);
  });

  test('rechaza marcadores no válidos', () => {
    const game = makeGame();
    porra.addParticipant(game, { id: 'a', name: 'Lucía' });
    expect(() => porra.submitPredictions(game, 'a', picks([-1, 0], [1, 1], [0, 2]))).toThrow(/no válido/);
  });
});

describe('eliminaciones', () => {
  function gameWithThree() {
    const game = makeGame();
    porra.addParticipant(game, { id: 'a', name: 'Ana' });
    porra.addParticipant(game, { id: 'b', name: 'Bea' });
    porra.addParticipant(game, { id: 'c', name: 'Carlos' });
    porra.submitPredictions(game, 'a', picks([1, 0], [1, 1], [0, 2]));
    porra.submitPredictions(game, 'b', picks([1, 0], [2, 1], [0, 2]));
    porra.submitPredictions(game, 'c', picks([2, 0], [1, 1], [0, 2]));
    return game;
  }

  test('al terminar un partido cae quien no acertó', () => {
    const game = gameWithThree();
    porra.applyLiveUpdates(game, { 'espn-1': { status: 'finished', score1: 1, score2: 0, events: [] } });
    const byId = Object.fromEntries(game.participants.map((p) => [p.id, p]));
    expect(byId.a.active).toBe(true);
    expect(byId.b.active).toBe(true);
    expect(byId.c.active).toBe(false);
    expect(byId.c.eliminatedInMatch).toBe('espn-1');
  });

  test('si queda uno solo es el ganador y no se elimina a nadie más', () => {
    const game = gameWithThree();
    porra.applyLiveUpdates(game, { 'espn-1': { status: 'finished', score1: 1, score2: 0, events: [] } });
    porra.applyLiveUpdates(game, { 'espn-2': { status: 'finished', score1: 1, score2: 1, events: [] } });
    porra.applyLiveUpdates(game, { 'tsdb-3': { status: 'finished', score1: 5, score2: 5, events: [] } });
    const alive = game.participants.filter((p) => p.active).map((p) => p.id);
    expect(alive).toEqual(['a']);
  });

  test('un partido en juego no elimina a nadie', () => {
    const game = gameWithThree();
    porra.applyLiveUpdates(game, { 'espn-1': { status: 'live', score1: 3, score2: 3, events: [] } });
    expect(game.participants.every((p) => p.active)).toBe(true);
    expect(game.journeyLocked).toBe(true);
  });
});

describe('administrador', () => {
  test('el código se crea una sola vez y no se guarda en claro', () => {
    const game = makeGame();
    const token = setupAdmin(game);
    expect(typeof token).toBe('string');
    expect(JSON.stringify(game)).not.toContain(CODE);
    expect(() => porra.adminAction(game, { action: 'setup', code: 'otro-codigo' })).toThrow(/Ya hay/);
  });

  test('entra con el código correcto desde otro dispositivo', () => {
    const game = makeGame();
    setupAdmin(game);
    const { token } = porra.adminAction(game, { action: 'login', code: CODE });
    porra.adminAction(game, { token, action: 'setPot', pot: 10 });
    expect(game.pot).toBe(10);
  });

  test('con código incorrecto no entra y a los 5 intentos se bloquea', () => {
    const game = makeGame();
    setupAdmin(game);
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      expect(() => porra.adminAction(game, { action: 'login', code: 'mal' }, now)).toThrow(/incorrecto/);
    }
    expect(() => porra.adminAction(game, { action: 'login', code: CODE }, now)).toThrow(/Demasiados intentos/);
    expect(porra.adminAction(game, { action: 'login', code: CODE }, now + 16 * 60 * 1000).token).toBeTruthy();
  });

  test('sin sesión válida no puede hacer nada', () => {
    const game = makeGame();
    setupAdmin(game);
    expect(() => porra.adminAction(game, { token: 'inventado', action: 'setPot', pot: 50 })).toThrow(/sesión/);
  });

  test('cerrar sesión invalida ese dispositivo', () => {
    const game = makeGame();
    const token = setupAdmin(game);
    porra.adminAction(game, { token, action: 'logout' });
    expect(() => porra.adminAction(game, { token, action: 'setPot', pot: 5 })).toThrow(/sesión/);
  });

  test('cambiar el código cierra los demás dispositivos', () => {
    const game = makeGame();
    const token = setupAdmin(game);
    const other = porra.adminAction(game, { action: 'login', code: CODE }).token;
    porra.adminAction(game, { token, action: 'changeCode', oldCode: CODE, newCode: 'nuevo-codigo' });
    expect(() => porra.adminAction(game, { token: other, action: 'setPot', pot: 5 })).toThrow(/sesión/);
    expect(() => porra.adminAction(game, { action: 'login', code: CODE })).toThrow(/incorrecto/);
    expect(porra.adminAction(game, { action: 'login', code: 'nuevo-codigo' }).token).toBeTruthy();
  });

  test('pone el bote', () => {
    const game = makeGame();
    const TOKEN = setupAdmin(game);
    porra.adminAction(game, { token: TOKEN, action: 'setPot', pot: 45 });
    expect(game.pot).toBe(45);
  });

  test('pone un resultado a mano y el directo ya no lo pisa', () => {
    const game = makeGame();
    porra.addParticipant(game, { id: 'a', name: 'Ana' });
    porra.addParticipant(game, { id: 'b', name: 'Bea' });
    porra.submitPredictions(game, 'a', picks([1, 0], [1, 1], [0, 2]));
    porra.submitPredictions(game, 'b', picks([2, 2], [1, 1], [0, 2]));
    const TOKEN = setupAdmin(game);
    porra.adminAction(game, { token: TOKEN, action: 'setMatch', matchId: 'espn-1', status: 'finished', score1: 1, score2: 0 });
    expect(game.participants.find((p) => p.id === 'b').active).toBe(false);

    porra.applyLiveUpdates(game, { 'espn-1': { status: 'finished', score1: 2, score2: 2, events: [] } });
    expect(game.matches[0].score1).toBe(1);
    expect(game.participants.find((p) => p.id === 'b').active).toBe(false);
  });

  test('corrige un pronóstico y se recalculan las eliminaciones', () => {
    const game = makeGame();
    porra.addParticipant(game, { id: 'a', name: 'Ana' });
    porra.addParticipant(game, { id: 'b', name: 'Bea' });
    porra.submitPredictions(game, 'a', picks([1, 0], [1, 1], [0, 2]));
    porra.submitPredictions(game, 'b', picks([2, 2], [1, 1], [0, 2]));
    const TOKEN = setupAdmin(game);
    porra.adminAction(game, { token: TOKEN, action: 'setMatch', matchId: 'espn-1', status: 'finished', score1: 1, score2: 0 });
    porra.adminAction(game, { token: TOKEN, action: 'setPredictions', participantId: 'b', predictions: { 'espn-1': { score1: 1, score2: 0 } } });
    expect(game.participants.find((p) => p.id === 'b').active).toBe(true);
  });

  test('cambia el nombre y quita participantes', () => {
    const game = makeGame();
    porra.addParticipant(game, { id: 'a', name: 'Ana' });
    porra.addParticipant(game, { id: 'b', name: 'Bea' });
    const TOKEN = setupAdmin(game);
    porra.adminAction(game, { token: TOKEN, action: 'rename', participantId: 'a', name: 'Ana María' });
    porra.adminAction(game, { token: TOKEN, action: 'remove', participantId: 'b' });
    expect(game.participants.map((p) => p.name)).toEqual(['Ana María']);
  });

  test('la vista pública no enseña nada del administrador', () => {
    const game = makeGame();
    setupAdmin(game);
    const pub = porra.publicGame(game);
    expect(pub.admin).toBeUndefined();
    expect(pub.hasAdmin).toBe(true);
  });
});

describe('nombres de partida y colores', () => {
  test('carga los 28 nombres una sola vez', () => {
    const game = makeGame();
    expect(porra.seedParticipants(game)).toBe(true);
    expect(game.participants).toHaveLength(28);
    expect(game.participants.map((p) => p.name)).toContain('JOSULO');
    game.participants = game.participants.filter((p) => p.name !== 'TIO');
    expect(porra.seedParticipants(game)).toBe(false);
    expect(game.participants).toHaveLength(27);
  });

  test('el administrador cambia el color de un nombre', () => {
    const game = makeGame();
    porra.seedParticipants(game);
    const TOKEN = setupAdmin(game);
    porra.adminAction(game, { token: TOKEN, action: 'setColor', participantId: 'seed-hugo', color: 'rojo' });
    expect(game.participants.find((p) => p.id === 'seed-hugo').color).toBe('rojo');
    porra.adminAction(game, { token: TOKEN, action: 'setColor', participantId: 'seed-hugo', color: null });
    expect(game.participants.find((p) => p.id === 'seed-hugo').color).toBeNull();
    expect(() => porra.adminAction(game, { token: TOKEN, action: 'setColor', participantId: 'seed-hugo', color: '#000' })).toThrow(/Color/);
  });
});
