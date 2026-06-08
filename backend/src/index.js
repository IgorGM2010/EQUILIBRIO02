/**
 * Aplicacao principal - Backend EQUILIBRIO
 *
 * Inicializa Express com middleware e rotas.
 * Roda como servidor Express comum.
 * Firebase e usado apenas como banco de dados.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
const frontendDir = path.resolve(__dirname, '..', '..');

app.set('trust proxy', 1);

const allowedFrontendUrl = process.env.FRONTEND_URL || '';
const localOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const corsOptions = {
  origin(origin, callback) {
    if (!origin || origin === 'null' || origin === allowedFrontendUrl || localOriginRegex.test(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
  maxAge: 86400
};

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://www.gstatic.com',
        'https://cdn.jsdelivr.net'
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: [
        "'self'",
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'https://*.firebaseio.com',
        'wss://*.firebaseio.com',
        'https://*.googleapis.com'
      ],
      upgradeInsecureRequests: null
    }
  }
}));

app.use(cors(corsOptions));

app.use(express.json({
  limit: '1mb'
}));

app.use(express.urlencoded({
  extended: false,
  limit: '1mb'
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
  }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: 'Muitas requisições. Tente novamente em instantes.'
  }
});

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const authRoutes = require('./routes/auth');
const salasRoutes = require('./routes/salas');
const sessoesRoutes = require('./routes/sessoes');
const analisesRoutes = require('./routes/analises');

const paginasFrontend = new Set([
  'index.html',
  'jogar.html',
  'login.html',
  'painel.html',
  'firebase-config.js'
]);

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.get('/:arquivo', (req, res, next) => {
  const { arquivo } = req.params;

  if (!paginasFrontend.has(arquivo)) {
    return next();
  }

  return res.sendFile(path.join(frontendDir, arquivo));
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/salas', salasRoutes);
app.use('/api/sessoes', sessoesRoutes);
app.use('/api/analises', analisesRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    env: {
      jwtSecret: Boolean(process.env.JWT_SECRET),
      databaseUrl: Boolean(process.env.DATABASE_URL || process.env.FIREBASE_DATABASE_URL),
      nodeEnv: process.env.NODE_ENV || null
    },
    timestamp: Date.now()
  });
});

app.use((req, res) => {
  res.status(404).json({
    erro: 'Rota não encontrada',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      erro: 'JSON inválido'
    });
  }

  console.error('[ERRO NAO CAPTURADO]:', err);

  res.status(500).json({
    erro: 'Erro interno do servidor'
  });
});

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend EQUILIBRIO iniciado em http://localhost:${PORT}`);
    console.log('Firebase configurado apenas como banco de dados');
    console.log('Endpoints disponiveis:');
    console.log('  - GET    /health');
    console.log('  - POST   /api/auth/login');
    console.log('  - POST   /api/salas');
    console.log('  - GET    /api/salas');
    console.log('  - GET    /api/salas/:salaId');
    console.log('  - PUT    /api/salas/:salaId/status');
    console.log('  - DELETE /api/salas/:salaId');
    console.log('  - GET    /api/salas/validar/:codigo');
    console.log('  - POST   /api/sessoes/salvar');
    console.log('  - GET    /api/analises/dashboard');
    console.log('  - GET    /api/analises/sala/:salaId');
  });
}

module.exports = app;
