/**
 * Rotas de sessoes.
 *
 * Gerencia o salvamento de resultados do jogo.
 * Alunos não precisam de autenticação para salvar resultado em uma sala ativa.
 */

const express = require('express');
const router = express.Router();
const { database } = require('../config/firebase');
const localStore = require('../utils/localStore');
const { sanitizarInput } = require('../utils/seguranca');

const DB_TIMEOUT_MS = 2500;

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

function validarNumeroPercentual(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100;
}

function calcularPerfil(indicadores) {
  if (indicadores.p < 50) {
    return 'autocritico';
  }

  if (indicadores.c < 50) {
    return 'evitador';
  }

  if (indicadores.s < 50) {
    return 'sobrecarregado';
  }

  return 'equilibrado';
}

router.post('/salvar', async (req, res) => {
  try {
    const { salaId, indicadores, nick } = req.body;

    if (!salaId || !indicadores) {
      return res.status(400).json({
        erro: 'Dados incompletos'
      });
    }

    if (typeof salaId !== 'string' || salaId.trim().length === 0 || salaId.length > 128) {
      return res.status(400).json({
        erro: 'ID da sala inválido'
      });
    }

    if (typeof indicadores !== 'object' || Array.isArray(indicadores)) {
      return res.status(400).json({
        erro: 'Indicadores inválidos'
      });
    }

    const { p, e, c, s } = indicadores;

    if (![p, e, c, s].every(validarNumeroPercentual)) {
      return res.status(400).json({
        erro: 'Indicadores devem ser números entre 0 e 100'
      });
    }

    let nickSanitizado = '';

    if (nick !== undefined && nick !== null) {
      if (typeof nick !== 'string') {
        return res.status(400).json({
          erro: 'Nick deve ser texto'
        });
      }

      if (nick.length > 50) {
        return res.status(400).json({
          erro: 'Nick muito longo, máximo de 50 caracteres'
        });
      }

      nickSanitizado = sanitizarInput(nick.trim());
    }

    const indicadoresProcessados = {
      p: Math.round(p),
      e: Math.round(e),
      c: Math.round(c),
      s: Math.round(s)
    };

    const perfil = calcularPerfil(indicadoresProcessados);
    const agora = Date.now();
    const salaLocal = await localStore.buscarSalaPorId(salaId);

    if (salaLocal) {
      if (salaLocal.status !== 'ativa') {
        console.log(`[SESSAO LOCAL] Sala não está ativa: ${salaId} - Status: ${salaLocal.status}`);

        return res.status(400).json({
          erro: `Sala está ${salaLocal.status}`
        });
      }

      const sessaoIdLocal = localStore.gerarId('sessao');
      const novaSessaoLocal = {
        id: sessaoIdLocal,
        sala_id: salaId,
        estudante_nick: nickSanitizado,
        timestamp: agora,
        indicadores: indicadoresProcessados,
        perfil: perfil,
        ativo: true
      };

      await localStore.criarSessao(novaSessaoLocal);
      console.log(`[SESSAO LOCAL SALVA] ${sessaoIdLocal} - Sala: ${salaId} - Perfil: ${perfil}`);

      return res.status(201).json({
        sucesso: true,
        mensagem: 'Resultado salvo com sucesso'
      });
    }

    if (salaId.startsWith('sala_')) {
      console.log(`[SESSAO LOCAL] Sala não encontrada: ${salaId}`);

      return res.status(404).json({
        erro: 'Sala não encontrada'
      });
    }

    const salaSnapshot = await withDatabaseTimeout(
      database.ref(`salas/${salaId}`).once('value'),
      'Consulta da sala para salvar sessao'
    );

    if (!salaSnapshot.exists()) {
      console.log(`[SESSAO] Sala não encontrada: ${salaId}`);

      return res.status(404).json({
        erro: 'Sala não encontrada'
      });
    }

    const sala = salaSnapshot.val();

    if (sala.status !== 'ativa') {
      console.log(`[SESSAO] Sala não está ativa: ${salaId} - Status: ${sala.status}`);

      return res.status(400).json({
        erro: `Sala está ${sala.status}`
      });
    }

    const sessaoId = database.ref('sessoes').push().key;

    const novaSessao = {
      id: sessaoId,
      sala_id: salaId,
      estudante_nick: nickSanitizado,
      timestamp: agora,
      indicadores: indicadoresProcessados,
      perfil: perfil,
      ativo: true
    };

    await withDatabaseTimeout(
      database.ref(`sessoes/${sessaoId}`).set(novaSessao),
      'Salvamento da sessao no Firebase'
    );

    try {
      await withDatabaseTimeout(
        database.ref(`logs/sessoes_salvas/${agora}`).set({
          sessaoId: sessaoId,
          salaId: salaId,
          nick: nickSanitizado || '(anônimo)',
          perfil: perfil,
          timestamp: agora
        }),
        'Registro do log de sessao'
      );
    } catch (err) {
      console.warn('[SESSAO] Não foi possível registrar log no Firebase:', err.message);
    }

    console.log(`[SESSAO SALVA] ${sessaoId} - Sala: ${salaId} - Perfil: ${perfil}`);

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Resultado salvo com sucesso'
    });
  } catch (err) {
    console.error('[ERRO POST /sessoes/salvar]:', err.message);

    return res.status(500).json({
      erro: 'Erro ao salvar resultado'
    });
  }
});

module.exports = router;
