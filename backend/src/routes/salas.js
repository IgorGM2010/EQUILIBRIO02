/**
 * Rotas de salas.
 *
 * Gerencia criacao, listagem e status de salas.
 * Todos os endpoints exigem JWT, exceto a validacao publica de codigo.
 */

const express = require('express');
const router = express.Router();
const { database } = require('../config/firebase');
const { verificarAutenticacao } = require('../middleware/autenticacao');
const localStore = require('../utils/localStore');
const {
  gerarCodigoSala,
  sanitizarInput
} = require('../utils/seguranca');

const DB_TIMEOUT_MS = 2500;
const PROFISSIONAL_PADRAO_LOCAL_ID = 'profissional_rodrigo';

function validarSalaId(salaId) {
  return Boolean(salaId && typeof salaId === 'string' && salaId.length <= 128);
}

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

function usarArmazenamentoLocal(professionalId) {
  return professionalId === PROFISSIONAL_PADRAO_LOCAL_ID;
}

async function buscarSalaPorId(salaId) {
  const snapshot = await database.ref(`salas/${salaId}`).once('value');

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.val();
}

function verificarProprietario(sala, professionalId) {
  return sala && sala.profissional_id === professionalId;
}

// ====================================================
// POST /api/salas - Criar nova sala
// ====================================================

router.post('/', verificarAutenticacao, async (req, res) => {
  try {
    const { nome, descricao } = req.body;
    const professionalId = req.professionalId;

    if (!nome || typeof nome !== 'string') {
      return res.status(400).json({
        erro: 'Nome da sala é obrigatório'
      });
    }

    const nomeTrim = nome.trim();

    if (nomeTrim.length < 2 || nomeTrim.length > 100) {
      return res.status(400).json({
        erro: 'Nome deve ter entre 2 e 100 caracteres'
      });
    }

    let descricaoSanitizada = '';

    if (descricao) {
      if (typeof descricao !== 'string') {
        return res.status(400).json({
          erro: 'Descrição deve ser texto'
        });
      }

      if (descricao.length > 500) {
        return res.status(400).json({
          erro: 'Descrição muito longa, máximo de 500 caracteres'
        });
      }

      descricaoSanitizada = sanitizarInput(descricao.trim());
    }

    const nomeSanitizado = sanitizarInput(nomeTrim);

    let codigo = gerarCodigoSala();
    let codigoExiste = true;
    let tentativas = 0;
    const maxTentativas = 10;

    if (usarArmazenamentoLocal(professionalId)) {
      while (codigoExiste && tentativas < maxTentativas) {
        codigoExiste = await localStore.codigoExiste(codigo);

        if (codigoExiste) {
          codigo = gerarCodigoSala();
          tentativas++;
        }
      }
    } else {
      while (codigoExiste && tentativas < maxTentativas) {
        const snapshot = await withDatabaseTimeout(
          database
            .ref('salas')
            .orderByChild('codigo')
            .equalTo(codigo)
            .once('value'),
          'Verificacao de codigo unico'
        );

        codigoExiste = snapshot.exists();

        if (codigoExiste) {
          codigo = gerarCodigoSala();
          tentativas++;
        }
      }
    }

    if (codigoExiste) {
      console.error('[ERRO] Nao foi possivel gerar codigo unico');

      return res.status(500).json({
        erro: 'Erro ao gerar código da sala. Tente novamente.'
      });
    }

    const agora = Date.now();
    const salaId = usarArmazenamentoLocal(professionalId)
      ? localStore.gerarId('sala')
      : database.ref('salas').push().key;

    const novaSala = {
      id: salaId,
      profissional_id: professionalId,
      nome: nomeSanitizado,
      descricao: descricaoSanitizada,
      codigo: codigo,
      status: 'ativa',
      data_criacao: agora,
      data_modificacao: agora,
      ativo: true
    };

    if (usarArmazenamentoLocal(professionalId)) {
      await localStore.criarSala(novaSala);
    } else {
      await withDatabaseTimeout(
        database.ref(`salas/${salaId}`).set(novaSala),
        'Criacao da sala no Firebase'
      );

      try {
        await withDatabaseTimeout(
          database.ref(`logs/salas_criadas/${agora}`).set({
            professionalId: professionalId,
            salaId: salaId,
            codigo: codigo,
            timestamp: agora
          }),
          'Registro do log de sala'
        );
      } catch (err) {
        console.warn('[SALA] Nao foi possivel registrar log no Firebase:', err.message);
      }
    }

    console.log(`[SALA CRIADA] ${salaId} - ${nomeSanitizado} - Prof: ${professionalId}`);

    return res.status(201).json({
      sucesso: true,
      sala: novaSala
    });
  } catch (err) {
    console.error('[ERRO POST /salas]:', err.message);

    return res.status(500).json({
      erro: 'Erro ao criar sala'
    });
  }
});

// ====================================================
// GET /api/salas - Listar salas do profissional
// ====================================================

router.get('/', verificarAutenticacao, async (req, res) => {
  try {
    const professionalId = req.professionalId;

    if (usarArmazenamentoLocal(professionalId)) {
      const salasLocais = await localStore.listarSalasPorProfissional(professionalId);

      return res.json({
        sucesso: true,
        salas: salasLocais.map((sala) => ({
          id: sala.id,
          nome: sala.nome,
          descricao: sala.descricao || '',
          codigo: sala.codigo,
          status: sala.status,
          data_criacao: sala.data_criacao,
          data_modificacao: sala.data_modificacao,
          ativo: sala.ativo
        }))
      });
    }

    const snapshot = await database
      .ref('salas')
      .orderByChild('profissional_id')
      .equalTo(professionalId)
      .once('value');

    if (!snapshot.exists()) {
      return res.json({
        sucesso: true,
        salas: []
      });
    }

    const salas = Object.values(snapshot.val());

    salas.sort((a, b) => (b.data_criacao || 0) - (a.data_criacao || 0));

    const salasResposta = salas.map((sala) => ({
      id: sala.id,
      nome: sala.nome,
      descricao: sala.descricao || '',
      codigo: sala.codigo,
      status: sala.status,
      data_criacao: sala.data_criacao,
      data_modificacao: sala.data_modificacao,
      ativo: sala.ativo
    }));

    console.log(`[SALAS LISTADAS] Prof: ${professionalId} - Total: ${salas.length}`);

    return res.json({
      sucesso: true,
      salas: salasResposta
    });
  } catch (err) {
    console.error('[ERRO GET /salas]:', err.message);

    return res.status(500).json({
      erro: 'Erro ao listar salas'
    });
  }
});

// ====================================================
// GET /api/salas/validar/:codigo - Validar codigo publico
// ====================================================

router.get('/validar/:codigo', async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').toUpperCase();

    if (codigo.length !== 8) {
      return res.status(400).json({
        valido: false,
        erro: 'Código deve ter 8 caracteres'
      });
    }

    if (!/^[A-Z0-9]{8}$/.test(codigo)) {
      return res.status(400).json({
        valido: false,
        erro: 'Código inválido'
      });
    }

    const salaLocal = await localStore.buscarSalaPorCodigo(codigo);

    if (salaLocal) {
      if (salaLocal.status !== 'ativa') {
        return res.status(400).json({
          valido: false,
          erro: `Sala está ${salaLocal.status}`
        });
      }

      console.log(`[CODIGO LOCAL VALIDADO] ${codigo}`);

      return res.json({
        valido: true,
        salaId: salaLocal.id,
        nomeSala: salaLocal.nome
      });
    }

    let snapshot;

    try {
      snapshot = await withDatabaseTimeout(
        database
          .ref('salas')
          .orderByChild('codigo')
          .equalTo(codigo)
          .once('value'),
        'Validacao do codigo no Firebase'
      );
    } catch (err) {
      console.warn('[CODIGO] Firebase indisponivel durante validacao:', err.message);

      return res.status(404).json({
        valido: false,
        erro: 'Código não encontrado'
      });
    }

    if (!snapshot.exists()) {
      console.log(`[CODIGO NAO ENCONTRADO] ${codigo}`);

      return res.status(404).json({
        valido: false,
        erro: 'Código não encontrado'
      });
    }

    const sala = Object.values(snapshot.val())[0];

    if (sala.status !== 'ativa') {
      console.log(`[SALA INATIVA] ${codigo} - Status: ${sala.status}`);

      return res.status(400).json({
        valido: false,
        erro: `Sala está ${sala.status}`
      });
    }

    console.log(`[CODIGO VALIDADO] ${codigo}`);

    return res.json({
      valido: true,
      salaId: sala.id,
      nomeSala: sala.nome
    });
  } catch (err) {
    console.error('[ERRO GET /validar/:codigo]:', err.message);

    return res.status(500).json({
      valido: false,
      erro: 'Erro ao validar código'
    });
  }
});

// ====================================================
// GET /api/salas/:salaId - Obter detalhes de uma sala
// ====================================================

router.get('/:salaId', verificarAutenticacao, async (req, res) => {
  try {
    const { salaId } = req.params;
    const professionalId = req.professionalId;

    if (!validarSalaId(salaId)) {
      return res.status(400).json({
        erro: 'ID da sala inválido'
      });
    }

    const sala = usarArmazenamentoLocal(professionalId)
      ? await localStore.buscarSalaPorId(salaId)
      : await buscarSalaPorId(salaId);

    if (!sala) {
      console.log(`[SALA NAO ENCONTRADA] ${salaId}`);

      return res.status(404).json({
        erro: 'Sala não encontrada'
      });
    }

    if (!verificarProprietario(sala, professionalId)) {
      console.log(`[ACESSO NEGADO] Prof ${professionalId} tentou acessar sala de ${sala.profissional_id}`);

      return res.status(403).json({
        erro: 'Acesso negado'
      });
    }

    return res.json({
      sucesso: true,
      sala: sala
    });
  } catch (err) {
    console.error('[ERRO GET /salas/:salaId]:', err.message);

    return res.status(500).json({
      erro: 'Erro ao obter sala'
    });
  }
});

// ====================================================
// PUT /api/salas/:salaId/status - Alterar status
// ====================================================

router.put('/:salaId/status', verificarAutenticacao, async (req, res) => {
  try {
    const { salaId } = req.params;
    const { status } = req.body;
    const professionalId = req.professionalId;

    if (!validarSalaId(salaId)) {
      return res.status(400).json({
        erro: 'ID da sala inválido'
      });
    }

    const statusValidos = ['ativa', 'pausada', 'encerrada'];

    if (!status || !statusValidos.includes(status)) {
      return res.status(400).json({
        erro: `Status deve ser um de: ${statusValidos.join(', ')}`
      });
    }

    const sala = usarArmazenamentoLocal(professionalId)
      ? await localStore.buscarSalaPorId(salaId)
      : await buscarSalaPorId(salaId);

    if (!sala) {
      return res.status(404).json({
        erro: 'Sala não encontrada'
      });
    }

    if (!verificarProprietario(sala, professionalId)) {
      console.log(`[ACESSO NEGADO] Prof ${professionalId} tentou modificar sala de ${sala.profissional_id}`);

      return res.status(403).json({
        erro: 'Acesso negado'
      });
    }

    if (sala.status === 'encerrada' && status !== 'encerrada') {
      return res.status(400).json({
        erro: 'Sala encerrada não pode ser reaberta'
      });
    }

    const agora = Date.now();

    if (usarArmazenamentoLocal(professionalId)) {
      await localStore.atualizarStatusSala(salaId, status, agora);
    } else {
      await database.ref(`salas/${salaId}`).update({
        status: status,
        data_modificacao: agora
      });

      await database.ref(`logs/salas_modificadas/${agora}`).set({
        professionalId: professionalId,
        salaId: salaId,
        novoStatus: status,
        statusAnterior: sala.status,
        timestamp: agora
      });
    }

    console.log(`[SALA MODIFICADA] ${salaId} - Novo status: ${status} - Prof: ${professionalId}`);

    return res.json({
      sucesso: true,
      mensagem: `Sala ${status}`
    });
  } catch (err) {
    console.error('[ERRO PUT /salas/:salaId/status]:', err.message);

    return res.status(500).json({
      erro: 'Erro ao atualizar sala'
    });
  }
});

// ====================================================
// DELETE /api/salas/:salaId - Excluir sala e sessoes
// ====================================================

router.delete('/:salaId', verificarAutenticacao, async (req, res) => {
  try {
    const { salaId } = req.params;
    const professionalId = req.professionalId;

    if (!validarSalaId(salaId)) {
      return res.status(400).json({
        erro: 'ID da sala inválido'
      });
    }

    const sala = usarArmazenamentoLocal(professionalId)
      ? await localStore.buscarSalaPorId(salaId)
      : await buscarSalaPorId(salaId);

    if (!sala) {
      return res.status(404).json({
        erro: 'Sala não encontrada'
      });
    }

    if (!verificarProprietario(sala, professionalId)) {
      console.log(`[ACESSO NEGADO] Prof ${professionalId} tentou excluir sala de ${sala.profissional_id}`);

      return res.status(403).json({
        erro: 'Acesso negado'
      });
    }

    if (usarArmazenamentoLocal(professionalId)) {
      await localStore.excluirSala(salaId);
    } else {
      const sessoesSnapshot = await withDatabaseTimeout(
        database
          .ref('sessoes')
          .orderByChild('sala_id')
          .equalTo(salaId)
          .once('value'),
        'Consulta de sessoes para exclusao'
      );

      const updates = {
        [`salas/${salaId}`]: null
      };

      if (sessoesSnapshot.exists()) {
        Object.keys(sessoesSnapshot.val()).forEach((sessaoId) => {
          updates[`sessoes/${sessaoId}`] = null;
        });
      }

      await withDatabaseTimeout(
        database.ref().update(updates),
        'Exclusao da sala e sessoes'
      );

      try {
        await database.ref(`logs/salas_excluidas/${Date.now()}`).set({
          professionalId,
          salaId,
          timestamp: Date.now()
        });
      } catch (err) {
        console.warn('[SALA] Nao foi possivel registrar log de exclusao:', err.message);
      }
    }

    console.log(`[SALA EXCLUIDA] ${salaId} - Prof: ${professionalId}`);

    return res.json({
      sucesso: true,
      mensagem: 'Sala excluída com sucesso'
    });
  } catch (err) {
    console.error('[ERRO DELETE /salas/:salaId]:', err.message);

    return res.status(500).json({
      erro: 'Erro ao excluir sala'
    });
  }
});

module.exports = router;
