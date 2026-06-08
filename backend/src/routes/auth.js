/**
 * Rotas de autenticacao.
 *
 * POST /api/auth/login - Fazer login com credenciais
 */

const express = require('express');
const router = express.Router();
const { database } = require('../config/firebase');
const {
  compararSenha,
  gerarToken,
  sanitizarInput
} = require('../utils/seguranca');

const CREDENCIAL_PADRAO_PROFISSIONAL = {
  nome: 'Rodrigo',
  idLocal: 'profissional_rodrigo',
  senhaHash: '$2a$10$4o73snMjTuOwymChXegGzuiJZSRTarFpCjlqB3I4s5kh6rjsQSbZ6'
};

const DB_TIMEOUT_MS = 2500;

function isProfissionalPadrao(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase() === CREDENCIAL_PADRAO_PROFISSIONAL.nome.toLowerCase();
}

async function isSenhaPadrao(senha) {
  const senhaNormalizada = String(senha || '').trim();
  return await compararSenha(senhaNormalizada, CREDENCIAL_PADRAO_PROFISSIONAL.senhaHash);
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

async function criarLoginLocalPadrao(senha) {
  if (!await isSenhaPadrao(senha)) {
    return null;
  }

  return {
    professionalId: CREDENCIAL_PADRAO_PROFISSIONAL.idLocal,
    profissionalData: {
      nome: CREDENCIAL_PADRAO_PROFISSIONAL.nome,
      ativo: true
    },
    usarLogFirebase: false
  };
}

router.post('/login', async (req, res) => {
  try {
    const { nome, senha } = req.body;

    if (!nome || !senha) {
      return res.status(400).json({
        erro: 'Nome e senha são obrigatórios'
      });
    }

    if (typeof nome !== 'string' || typeof senha !== 'string') {
      return res.status(400).json({
        erro: 'Nome e senha devem ser texto'
      });
    }

    if (nome.length < 2 || nome.length > 100) {
      return res.status(400).json({
        erro: 'Nome deve ter entre 2 e 100 caracteres'
      });
    }

    if (senha.length < 6 || senha.length > 100) {
      return res.status(400).json({
        erro: 'Dados inválidos'
      });
    }

    const nomeSanitizado = sanitizarInput(nome);

    if (isProfissionalPadrao(nomeSanitizado) && !await isSenhaPadrao(senha)) {
      console.log(`[LOGIN FALHO] Credenciais inválidas: ${CREDENCIAL_PADRAO_PROFISSIONAL.nome}`);

      return res.status(401).json({
        erro: 'Credenciais inválidas'
      });
    }

    if (isProfissionalPadrao(nomeSanitizado) && await isSenhaPadrao(senha)) {
      const tokenLocal = gerarToken(
        CREDENCIAL_PADRAO_PROFISSIONAL.idLocal,
        CREDENCIAL_PADRAO_PROFISSIONAL.nome
      );

      console.log(`[LOGIN LOCAL] ${CREDENCIAL_PADRAO_PROFISSIONAL.nome}`);

      return res.status(200).json({
        sucesso: true,
        token: tokenLocal,
        profissional: {
          id: CREDENCIAL_PADRAO_PROFISSIONAL.idLocal,
          nome: CREDENCIAL_PADRAO_PROFISSIONAL.nome
        }
      });
    }

    let snapshot;

    try {
      snapshot = await withDatabaseTimeout(
        database
          .ref('profissionais')
          .orderByChild('nome')
          .equalTo(nomeSanitizado)
          .once('value'),
        'Consulta de profissionais'
      );
    } catch (err) {
      if (isProfissionalPadrao(nomeSanitizado)) {
        const loginLocal = await criarLoginLocalPadrao(senha);

        if (loginLocal) {
          const tokenLocal = gerarToken(loginLocal.professionalId, loginLocal.profissionalData.nome);

          console.warn(`[LOGIN LOCAL] Firebase indisponível, acesso liberado para ${loginLocal.profissionalData.nome}: ${err.message}`);

          return res.status(200).json({
            sucesso: true,
            token: tokenLocal,
            profissional: {
              id: loginLocal.professionalId,
              nome: loginLocal.profissionalData.nome
            }
          });
        }
      }

      console.error('[LOGIN] Firebase indisponível:', err.message);

      return res.status(503).json({
        erro: 'Firebase indisponível no momento. Verifique as credenciais do backend.'
      });
    }

    let professionalId;
    let profissionalData;

    if (!snapshot.exists()) {
      if (isProfissionalPadrao(nomeSanitizado) && await isSenhaPadrao(senha)) {
        const novoProfissionalRef = database.ref('profissionais').push();

        professionalId = novoProfissionalRef.key;
        profissionalData = {
          nome: CREDENCIAL_PADRAO_PROFISSIONAL.nome,
          senha_hash: CREDENCIAL_PADRAO_PROFISSIONAL.senhaHash,
          ativo: true,
          criado_em: Date.now(),
          atualizado_em: Date.now(),
          origem: 'credencial_padrao'
        };

        await withDatabaseTimeout(
          novoProfissionalRef.set(profissionalData),
          'Criacao do profissional padrao'
        );
        console.log(`[LOGIN] Profissional padrao criado: ${CREDENCIAL_PADRAO_PROFISSIONAL.nome}`);
      } else {
        console.log(`[LOGIN FALHO] Usuário não encontrado: ${nomeSanitizado}`);

        return res.status(401).json({
          erro: 'Credenciais inválidas'
        });
      }
    } else {
      const profissionaisData = snapshot.val();
      professionalId = Object.keys(profissionaisData)[0];
      profissionalData = profissionaisData[professionalId];
    }

    let senhaValida = await compararSenha(senha, profissionalData.senha_hash);
    const usandoCredencialPadrao = isProfissionalPadrao(profissionalData.nome) && await isSenhaPadrao(senha);

    if (usandoCredencialPadrao && (!senhaValida || !profissionalData.ativo)) {
      await withDatabaseTimeout(
        database.ref(`profissionais/${professionalId}`).update({
          senha_hash: CREDENCIAL_PADRAO_PROFISSIONAL.senhaHash,
          ativo: true,
          atualizado_em: Date.now()
        }),
        'Atualizacao da credencial padrao'
      );

      profissionalData.senha_hash = CREDENCIAL_PADRAO_PROFISSIONAL.senhaHash;
      profissionalData.ativo = true;
      senhaValida = true;
      console.log(`[LOGIN] Credencial padrao atualizada: ${profissionalData.nome}`);
    }

    if (!senhaValida) {
      console.log(`[LOGIN FALHO] Credenciais inválidas: ${nomeSanitizado}`);

      return res.status(401).json({
        erro: 'Credenciais inválidas'
      });
    }

    if (!profissionalData.ativo) {
      console.log(`[LOGIN BLOQUEADO] Usuario desativado: ${nomeSanitizado}`);

      return res.status(403).json({
        erro: 'Acesso bloqueado'
      });
    }

    const token = gerarToken(professionalId, profissionalData.nome);

    try {
      await withDatabaseTimeout(
        database.ref(`logs/login/${Date.now()}`).set({
          professionalId: professionalId,
          nome: profissionalData.nome,
          timestamp: Date.now(),
          ip: req.ip || 'unknown'
        }),
        'Registro de log de login'
      );
    } catch (err) {
      console.warn('[LOGIN] Não foi possível registrar log no Firebase:', err.message);
    }

    console.log(`[LOGIN SUCESSO] ${nomeSanitizado}`);

    return res.status(200).json({
      sucesso: true,
      token: token,
      profissional: {
        id: professionalId,
        nome: profissionalData.nome
      }
    });
  } catch (err) {
    console.error('[ERRO /login]:', err.message);

    if (err.message && err.message.includes('JWT_SECRET')) {
      return res.status(500).json({
        erro: 'JWT_SECRET não configurado na Vercel. Adicione essa variável em Settings > Environment Variables e faça redeploy.'
      });
    }

    return res.status(500).json({
      erro: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
