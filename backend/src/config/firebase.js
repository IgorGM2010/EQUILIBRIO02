/**
 * Configuracao do Firebase Admin SDK
 *
 * Firebase e usado apenas como Realtime Database.
 * Este backend nao e publicado nem hospedado no Firebase.
 */

const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

const databaseURL = process.env.DATABASE_URL || process.env.FIREBASE_DATABASE_URL;

const unavailableDatabase = {
  ref() {
    throw new Error('Firebase indisponível: DATABASE_URL não definido no ambiente.');
  }
};

let database = unavailableDatabase;
let firebaseDisponivel = false;

if (!databaseURL) {
  console.warn('[Firebase] DATABASE_URL não definido. Rotas que dependem do banco responderão como indisponíveis.');
} else {
  try {
    const firebaseOptions = {
      databaseURL
    };

    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      const serviceAccount = require(serviceAccountPath);
      firebaseOptions.credential = admin.credential.cert(serviceAccount);
    }

    // Sem FIREBASE_SERVICE_ACCOUNT_PATH, o Admin SDK usa credenciais padrão
    // do ambiente, como GOOGLE_APPLICATION_CREDENTIALS.
    if (!admin.apps.length) {
      admin.initializeApp(firebaseOptions);
    }

    database = admin.database();
    firebaseDisponivel = true;
  } catch (err) {
    console.error('[Firebase] Falha ao inicializar Firebase Admin:', err.message);
  }
}

module.exports = { admin, database, firebaseDisponivel };
