/**
 * Armazenamento local de desenvolvimento.
 *
 * Usado quando o Firebase Admin ainda nao esta configurado no ambiente.
 * Em producao, as mesmas rotas continuam usando o Realtime Database.
 */

const fs = require('fs/promises');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'local-db.json');

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dbPath);
  } catch (err) {
    await fs.writeFile(dbPath, JSON.stringify({ salas: {}, sessoes: {} }, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(dbPath, 'utf8');
  const data = JSON.parse(raw || '{}');

  return {
    salas: data.salas || {},
    sessoes: data.sessoes || {}
  };
}

async function writeDb(data) {
  await ensureDb();
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
}

function gerarId(prefixo) {
  return `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function listarSalasPorProfissional(professionalId) {
  const db = await readDb();

  return Object.values(db.salas)
    .filter((sala) => sala.profissional_id === professionalId)
    .sort((a, b) => (b.data_criacao || 0) - (a.data_criacao || 0));
}

async function buscarSalaPorId(salaId) {
  const db = await readDb();
  return db.salas[salaId] || null;
}

async function buscarSalaPorCodigo(codigo) {
  const db = await readDb();
  const codigoNormalizado = String(codigo || '').toUpperCase();

  return Object.values(db.salas).find((sala) => sala.codigo === codigoNormalizado) || null;
}

async function codigoExiste(codigo) {
  return Boolean(await buscarSalaPorCodigo(codigo));
}

async function criarSala(sala) {
  const db = await readDb();
  db.salas[sala.id] = sala;
  await writeDb(db);
  return sala;
}

async function atualizarStatusSala(salaId, status, timestamp) {
  const db = await readDb();

  if (!db.salas[salaId]) {
    return null;
  }

  db.salas[salaId].status = status;
  db.salas[salaId].data_modificacao = timestamp;
  await writeDb(db);

  return db.salas[salaId];
}

async function excluirSala(salaId) {
  const db = await readDb();

  if (!db.salas[salaId]) {
    return false;
  }

  delete db.salas[salaId];

  Object.keys(db.sessoes).forEach((sessaoId) => {
    if (db.sessoes[sessaoId].sala_id === salaId) {
      delete db.sessoes[sessaoId];
    }
  });

  await writeDb(db);
  return true;
}

async function listarSessoesPorSala(salaId) {
  const db = await readDb();

  return Object.values(db.sessoes)
    .filter((sessao) => sessao.sala_id === salaId)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

async function criarSessao(sessao) {
  const db = await readDb();
  db.sessoes[sessao.id] = sessao;
  await writeDb(db);
  return sessao;
}

module.exports = {
  gerarId,
  listarSalasPorProfissional,
  buscarSalaPorId,
  buscarSalaPorCodigo,
  codigoExiste,
  criarSala,
  atualizarStatusSala,
  excluirSala,
  listarSessoesPorSala,
  criarSessao
};
