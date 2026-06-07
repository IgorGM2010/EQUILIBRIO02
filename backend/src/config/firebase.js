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

if (!databaseURL) {
  throw new Error('DATABASE_URL nao definido no .env');
}

const firebaseOptions = {
  databaseURL
};

if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  const serviceAccount = require(serviceAccountPath);
  firebaseOptions.credential = admin.credential.cert(serviceAccount);
}

// Sem FIREBASE_SERVICE_ACCOUNT_PATH, o Admin SDK usa credenciais padrao
// do ambiente, como GOOGLE_APPLICATION_CREDENTIALS.
admin.initializeApp(firebaseOptions);

const database = admin.database();

module.exports = { admin, database };
