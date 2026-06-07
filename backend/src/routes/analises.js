/**
 * Rotas de análises.
 *
 * Endpoints para consultar dados agregados do profissional.
 * Todos exigem autenticação JWT.
 */

const express = require('express');
const router = express.Router();
const { database } = require('../config/firebase');
const { verificarAutenticacao } = require('../middleware/autenticacao');
const localStore = require('../utils/localStore');

const DB_TIMEOUT_MS = 2500;
const PROFISSIONAL_PADRAO_LOCAL_ID = 'profissional_rodrigo';

async function withDatabaseTimeout(promise, label) {
  let timeoutId;

  const timeout = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} excedeu ${DB_TIMEOUT_MS}ms`));
    }, DB_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function dashboardVazio(aviso) {
  return {
    sucesso: true,
    salas_ativas: 0,
    total_participantes: 0,
    ultima_atividade: null,
    salas: [],
    aviso
  };
}

function contarPerfil(distribuicao, perfil) {
  if (perfil === 'autocritico') {
    distribuicao.autocriticos += 1;
  } else if (perfil === 'evitador') {
    distribuicao.evitadores += 1;
  } else if (perfil === 'sobrecarregado') {
    distribuicao.sobrecarregados += 1;
  } else if (perfil === 'equilibrado') {
    distribuicao.equilibrados += 1;
  }
}

async function buscarSessoesDaSala(salaId) {
  const snapshot = await withDatabaseTimeout(
    database
      .ref('sessoes')
      .orderByChild('sala_id')
      .equalTo(salaId)
      .once('value'),
    'Consulta de sessões da sala'
  );

  if (!snapshot.exists()) {
    return [];
  }

  return Object.values(snapshot.val());
}

async function montarDashboardLocal(professionalId) {
  const salas = await localStore.listarSalasPorProfissional(professionalId);
  let totalParticipantes = 0;
  let ultimaAtividade = null;
  const salasResposta = [];

  for (const sala of salas) {
    const sessoes = await localStore.listarSessoesPorSala(sala.id);
    totalParticipantes += sessoes.length;

    for (const sessao of sessoes) {
      if (sessao.timestamp && (!ultimaAtividade || sessao.timestamp > ultimaAtividade)) {
        ultimaAtividade = sessao.timestamp;
      }
    }

    salasResposta.push({
      id: sala.id,
      nome: sala.nome,
      codigo: sala.codigo,
      status: sala.status,
      data_criacao: sala.data_criacao,
      participantes: sessoes.length
    });
  }

  return {
    sucesso: true,
    salas_ativas: salas.filter((sala) => sala.status === 'ativa').length,
    total_participantes: totalParticipantes,
    ultima_atividade: ultimaAtividade,
    salas: salasResposta
  };
}

router.get('/dashboard', verificarAutenticacao, async (req, res) => {
  try {
    const professionalId = req.professionalId;

    if (professionalId === PROFISSIONAL_PADRAO_LOCAL_ID) {
      return res.json(await montarDashboardLocal(professionalId));
    }

    let salasSnapshot;

    try {
      salasSnapshot = await withDatabaseTimeout(
        database
          .ref('salas')
          .orderByChild('profissional_id')
          .equalTo(professionalId)
          .once('value'),
        'Consulta de salas do dashboard'
      );
    } catch (err) {
      console.warn('[DASHBOARD] Firebase indisponível:', err.message);
      return res.json(dashboardVazio('Firebase indisponível. Verifique as credenciais do backend.'));
    }

    if (!salasSnapshot.exists()) {
      return res.json(dashboardVazio(null));
    }

    const salas = Object.values(salasSnapshot.val());
    const salasAtivas = salas.filter((sala) => sala.status === 'ativa').length;
    let totalParticipantes = 0;
    let ultimaAtividade = null;

    const salasResposta = [];

    for (const sala of salas) {
      const sessoes = await buscarSessoesDaSala(sala.id);
      totalParticipantes += sessoes.length;

      for (const sessao of sessoes) {
        if (sessao.timestamp && (!ultimaAtividade || sessao.timestamp > ultimaAtividade)) {
          ultimaAtividade = sessao.timestamp;
        }
      }

      salasResposta.push({
        id: sala.id,
        nome: sala.nome,
        codigo: sala.codigo,
        status: sala.status,
        data_criacao: sala.data_criacao,
        participantes: sessoes.length
      });
    }

    salasResposta.sort((a, b) => (b.data_criacao || 0) - (a.data_criacao || 0));

    return res.json({
      sucesso: true,
      salas_ativas: salasAtivas,
      total_participantes: totalParticipantes,
      ultima_atividade: ultimaAtividade,
      salas: salasResposta
    });
  } catch (err) {
    console.error('[ERRO GET /analises/dashboard]:', err.message);

    return res.status(500).json({
      erro: 'Erro ao carregar dashboard'
    });
  }
});

router.get('/sala/:salaId', verificarAutenticacao, async (req, res) => {
  try {
    const { salaId } = req.params;
    const professionalId = req.professionalId;

    if (!salaId || typeof salaId !== 'string' || salaId.length > 128) {
      return res.status(400).json({
        erro: 'ID da sala inválido'
      });
    }

    if (professionalId === PROFISSIONAL_PADRAO_LOCAL_ID) {
      const salaLocal = await localStore.buscarSalaPorId(salaId);

      if (!salaLocal) {
        return res.status(404).json({
          erro: 'Sala não encontrada'
        });
      }

      if (salaLocal.profissional_id !== professionalId) {
        return res.status(403).json({
          erro: 'Acesso negado'
        });
      }

      const sessoesLocais = await localStore.listarSessoesPorSala(salaId);

      if (sessoesLocais.length === 0) {
        return res.json({
          sucesso: true,
          salaId,
          sala: {
            id: salaLocal.id,
            nome: salaLocal.nome,
            codigo: salaLocal.codigo,
            status: salaLocal.status
          },
          analises: {
            total_participantes: 0,
            medias: { p: 0, e: 0, c: 0, s: 0 },
            distribuicao_perfis: {
              autocriticos: 0,
              evitadores: 0,
              sobrecarregados: 0,
              equilibrados: 0
            },
            sessoes: []
          }
        });
      }

      const totaisLocais = { p: 0, e: 0, c: 0, s: 0 };
      const distribuicaoLocal = {
        autocriticos: 0,
        evitadores: 0,
        sobrecarregados: 0,
        equilibrados: 0
      };

      for (const sessao of sessoesLocais) {
        const indicadores = sessao.indicadores || {};
        totaisLocais.p += Number(indicadores.p || 0);
        totaisLocais.e += Number(indicadores.e || 0);
        totaisLocais.c += Number(indicadores.c || 0);
        totaisLocais.s += Number(indicadores.s || 0);
        contarPerfil(distribuicaoLocal, sessao.perfil);
      }

      return res.json({
        sucesso: true,
        salaId,
        sala: {
          id: salaLocal.id,
          nome: salaLocal.nome,
          codigo: salaLocal.codigo,
          status: salaLocal.status
        },
        analises: {
          total_participantes: sessoesLocais.length,
          medias: {
            p: Math.round(totaisLocais.p / sessoesLocais.length),
            e: Math.round(totaisLocais.e / sessoesLocais.length),
            c: Math.round(totaisLocais.c / sessoesLocais.length),
            s: Math.round(totaisLocais.s / sessoesLocais.length)
          },
          distribuicao_perfis: distribuicaoLocal,
          sessoes: sessoesLocais
        }
      });
    }

    const salaSnapshot = await withDatabaseTimeout(
      database.ref(`salas/${salaId}`).once('value'),
      'Consulta de dados da sala'
    );

    if (!salaSnapshot.exists()) {
      return res.status(404).json({
        erro: 'Sala não encontrada'
      });
    }

    const sala = salaSnapshot.val();

    if (sala.profissional_id !== professionalId) {
      console.log(`[ACESSO NEGADO] Prof ${professionalId} tentou acessar análises da sala de ${sala.profissional_id}`);

      return res.status(403).json({
        erro: 'Acesso negado'
      });
    }

    const sessoes = await buscarSessoesDaSala(salaId);

    if (sessoes.length === 0) {
      return res.json({
        sucesso: true,
        salaId,
        sala: {
          id: sala.id,
          nome: sala.nome,
          codigo: sala.codigo,
          status: sala.status
        },
        analises: {
          total_participantes: 0,
          medias: { p: 0, e: 0, c: 0, s: 0 },
          distribuicao_perfis: {
            autocriticos: 0,
            evitadores: 0,
            sobrecarregados: 0,
            equilibrados: 0
          },
          sessoes: []
        }
      });
    }

    const totais = { p: 0, e: 0, c: 0, s: 0 };
    const distribuicao = {
      autocriticos: 0,
      evitadores: 0,
      sobrecarregados: 0,
      equilibrados: 0
    };

    for (const sessao of sessoes) {
      const indicadores = sessao.indicadores || {};
      totais.p += Number(indicadores.p || 0);
      totais.e += Number(indicadores.e || 0);
      totais.c += Number(indicadores.c || 0);
      totais.s += Number(indicadores.s || 0);
      contarPerfil(distribuicao, sessao.perfil);
    }

    const medias = {
      p: Math.round(totais.p / sessoes.length),
      e: Math.round(totais.e / sessoes.length),
      c: Math.round(totais.c / sessoes.length),
      s: Math.round(totais.s / sessoes.length)
    };

    sessoes.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return res.json({
      sucesso: true,
      salaId,
      sala: {
        id: sala.id,
        nome: sala.nome,
        codigo: sala.codigo,
        status: sala.status
      },
      analises: {
        total_participantes: sessoes.length,
        medias,
        distribuicao_perfis: distribuicao,
        sessoes
      }
    });
  } catch (err) {
    console.error('[ERRO GET /analises/sala/:salaId]:', err.message);

    return res.status(500).json({
      erro: 'Erro ao buscar análises'
    });
  }
});

module.exports = router;
