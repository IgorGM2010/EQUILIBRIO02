/**
 * Utilitarios de seguranca.
 *
 * - Hash de senhas com bcryptjs
 * - Geracao e verificacao de JWT
 * - Geracao de codigos de sala
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '24h';

async function hashSenha(senha) {
  if (!senha || typeof senha !== 'string') {
    throw new Error('Senha invalida');
  }

  return await bcrypt.hash(senha, SALT_ROUNDS);
}

async function compararSenha(senha, hash) {
  if (!senha || !hash) {
    return false;
  }

  return await bcrypt.compare(senha, hash);
}

function gerarToken(professionalId, nome) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET nao definido no .env');
  }

  return jwt.sign(
    {
      id: professionalId,
      nome: nome,
      tipo: 'profissional',
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRY,
      algorithm: 'HS256'
    }
  );
}

function verificarToken(token) {
  if (!token) {
    return null;
  }

  if (!JWT_SECRET) {
    console.error('JWT_SECRET nao definido');
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });
  } catch (err) {
    return null;
  }
}

function gerarCodigoSala() {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let codigo = '';

  for (let i = 0; i < 8; i++) {
    const indice = Math.floor(Math.random() * caracteres.length);
    codigo += caracteres.charAt(indice);
  }

  return codigo;
}

function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function sanitizarInput(input) {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

module.exports = {
  hashSenha,
  compararSenha,
  gerarToken,
  verificarToken,
  gerarCodigoSala,
  validarEmail,
  sanitizarInput
};
