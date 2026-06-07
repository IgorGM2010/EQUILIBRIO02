/**
 * Middleware de autenticação.
 *
 * Verifica se o token JWT é válido, extrai informações do profissional
 * e adiciona os dados ao request.
 */

const { verificarToken } = require('../utils/seguranca');

function verificarAutenticacao(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return res.status(401).json({
        erro: 'Token não fornecido',
        codigo: 'TOKEN_AUSENTE'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        erro: 'Formato de autorização inválido',
        codigo: 'FORMATO_INVALIDO'
      });
    }

    const token = authHeader.substring(7);

    if (!token || token.length === 0) {
      return res.status(401).json({
        erro: 'Token inválido',
        codigo: 'TOKEN_VAZIO'
      });
    }

    const decoded = verificarToken(token);

    if (!decoded) {
      return res.status(401).json({
        erro: 'Token expirado ou inválido',
        codigo: 'TOKEN_INVALIDO'
      });
    }

    if (!decoded.id || !decoded.nome) {
      return res.status(401).json({
        erro: 'Token mal formado',
        codigo: 'TOKEN_MALFORMADO'
      });
    }

    req.professionalId = decoded.id;
    req.professionalNome = decoded.nome;
    req.tokenData = decoded;

    next();
  } catch (err) {
    console.error('Erro em middleware de autenticação:', err);
    return res.status(500).json({
      erro: 'Erro ao verificar autenticação',
      codigo: 'ERRO_INTERNO'
    });
  }
}

module.exports = { verificarAutenticacao };
