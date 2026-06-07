/**
 * Testes funcionais do backend EQUILIBRIO.
 *
 * Executar com: npm test
 * Requer o backend ativo em BACKEND_URL ou http://localhost:3001.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TEST_USER = {
  nome: process.env.TEST_PROFESSIONAL_NAME || 'Rodrigo',
  senha: process.env.TEST_PROFESSIONAL_PASSWORD
};

if (!TEST_USER.senha) {
  throw new Error('Defina TEST_PROFESSIONAL_PASSWORD para executar os testes.');
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return { response, data };
}

async function loginValido() {
  const { data } = await requestJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER)
  });

  return data.token;
}

async function criarSala(token, nome = `Turma Teste ${Date.now()}`) {
  const { response, data } = await requestJson('/api/salas', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      nome,
      descricao: 'Sala criada por teste automatizado'
    })
  });

  expect(response.status).toBe(201);
  expect(data.sucesso).toBe(true);
  return data.sala;
}

describe('Autenticacao', () => {
  test('Login com credenciais validas', async () => {
    const { response, data } = await requestJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER)
    });

    expect(response.status).toBe(200);
    expect(data.sucesso).toBe(true);
    expect(data.token).toBeTruthy();
    expect(data.profissional.id).toBeTruthy();
    expect(data.profissional.nome).toBe('Rodrigo');
  });

  test('Login com senha invalida', async () => {
    const { response, data } = await requestJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: TEST_USER.nome,
        senha: 'senha-incorreta'
      })
    });

    expect(response.status).toBe(401);
    expect(data.erro).toBeTruthy();
    expect(data.token).toBeUndefined();
  });

  test('Login sem campos obrigatorios', async () => {
    const { response } = await requestJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: TEST_USER.nome })
    });

    expect(response.status).toBe(400);
  });
});

describe('Salas', () => {
  let token;

  beforeAll(async () => {
    token = await loginValido();
  });

  test('Criar sala com dados validos', async () => {
    const sala = await criarSala(token);

    expect(sala.id).toBeTruthy();
    expect(sala.codigo).toBeTruthy();
    expect(sala.codigo).toHaveLength(8);
    expect(sala.status).toBe('ativa');
  });

  test('Listar salas do profissional', async () => {
    await criarSala(token);
    const { response, data } = await requestJson('/api/salas', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(response.status).toBe(200);
    expect(data.sucesso).toBe(true);
    expect(Array.isArray(data.salas)).toBe(true);
    expect(data.salas.length).toBeGreaterThan(0);
  });

  test('Acessar salas sem autenticacao', async () => {
    const { response } = await requestJson('/api/salas');
    expect(response.status).toBe(401);
  });

  test('Validar codigo de sala existente', async () => {
    const sala = await criarSala(token, `Sala Validacao ${Date.now()}`);
    const { response, data } = await requestJson(`/api/salas/validar/${sala.codigo}`);

    expect(response.status).toBe(200);
    expect(data.valido).toBe(true);
    expect(data.salaId).toBe(sala.id);
  });

  test('Validar codigo invalido', async () => {
    const { response, data } = await requestJson('/api/salas/validar/BAD');

    expect(response.status).toBe(400);
    expect(data.valido).toBe(false);
  });

  test('Fechar sala impede novas respostas e nao permite reabrir', async () => {
    const sala = await criarSala(token, `Sala Fechamento ${Date.now()}`);

    const fechar = await requestJson(`/api/salas/${sala.id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'encerrada' })
    });

    expect(fechar.response.status).toBe(200);
    expect(fechar.data.sucesso).toBe(true);

    const validar = await requestJson(`/api/salas/validar/${sala.codigo}`);
    expect(validar.response.status).toBe(400);
    expect(validar.data.valido).toBe(false);

    const reabrir = await requestJson(`/api/salas/${sala.id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'ativa' })
    });

    expect(reabrir.response.status).toBe(400);
  });

  test('Excluir sala remove a sala e invalida o codigo', async () => {
    const sala = await criarSala(token, `Sala Exclusao ${Date.now()}`);

    const excluir = await requestJson(`/api/salas/${sala.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(excluir.response.status).toBe(200);
    expect(excluir.data.sucesso).toBe(true);

    const validar = await requestJson(`/api/salas/validar/${sala.codigo}`);
    expect(validar.response.status).toBe(404);
    expect(validar.data.valido).toBe(false);
  });
});

describe('Sessoes', () => {
  let token;
  let sala;

  beforeAll(async () => {
    token = await loginValido();
    sala = await criarSala(token, `Sala Sessoes ${Date.now()}`);
  });

  test('Salvar resultado do jogo com sala', async () => {
    const { response, data } = await requestJson('/api/sessoes/salvar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salaId: sala.id,
        indicadores: { p: 58, e: 72, c: 45, s: 61 },
        nick: 'Joao Teste'
      })
    });

    expect(response.status).toBe(201);
    expect(data.sucesso).toBe(true);
  });

  test('Rejeitar indicadores invalidos', async () => {
    const { response } = await requestJson('/api/sessoes/salvar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salaId: sala.id,
        indicadores: { p: 150, e: 72, c: 45, s: 61 }
      })
    });

    expect(response.status).toBe(400);
  });

  test('Rejeitar sala inexistente', async () => {
    const { response } = await requestJson('/api/sessoes/salvar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salaId: 'sala_inexistente',
        indicadores: { p: 50, e: 50, c: 50, s: 50 }
      })
    });

    expect(response.status).toBe(404);
  });
});

describe('Analises', () => {
  let token;
  let sala;

  beforeAll(async () => {
    token = await loginValido();
    sala = await criarSala(token, `Sala Analises ${Date.now()}`);

    for (let i = 0; i < 5; i += 1) {
      await requestJson('/api/sessoes/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salaId: sala.id,
          indicadores: { p: 50 + i * 5, e: 60 + i * 2, c: 40 + i * 3, s: 70 - i },
          nick: `Estudante ${i}`
        })
      });
    }
  });

  test('Carregar dashboard com autenticacao', async () => {
    const { response, data } = await requestJson('/api/analises/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(response.status).toBe(200);
    expect(data.sucesso).toBe(true);
    expect(typeof data.salas_ativas).toBe('number');
    expect(typeof data.total_participantes).toBe('number');
  });

  test('Acessar analises sem autenticacao', async () => {
    const { response } = await requestJson('/api/analises/dashboard');
    expect(response.status).toBe(401);
  });

  test('Carregar analises de sala', async () => {
    const { response, data } = await requestJson(`/api/analises/sala/${sala.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(response.status).toBe(200);
    expect(data.sucesso).toBe(true);
    expect(data.analises.total_participantes).toBeGreaterThan(0);
    expect(data.analises.medias).toBeTruthy();
  });

  test('Rejeitar acesso com token invalido', async () => {
    const { response } = await requestJson(`/api/analises/sala/${sala.id}`, {
      headers: { Authorization: 'Bearer token_invalido' }
    });

    expect(response.status).toBe(401);
  });
});
