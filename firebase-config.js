(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyD-SaMn4YDOdf-4GhYczNPuDHXzy2TXBfo",
    authDomain: "equilibrio-d6275.firebaseapp.com",
    projectId: "equilibrio-d6275",
    messagingSenderId: "165104108767",
    appId: "1:165104108767:web:cae32e47ee394a5ff1956a",
    databaseURL: "https://equilibrio-d6275-default-rtdb.firebaseio.com"
  };

  if (!window.firebase || !window.firebase.initializeApp) {
    console.warn("[Firebase] SDK Web nao carregado.");
    return;
  }

  const app = window.firebase.apps.length
    ? window.firebase.app()
    : window.firebase.initializeApp(firebaseConfig);

  const database = window.firebase.database(app);

  async function salvarResultadoJogo(resultado) {
    const payload = {
      ...resultado,
      origem: "jogar.html",
      data_criacao: window.firebase.database.ServerValue.TIMESTAMP
    };

    const ref = database.ref("resultados_jogo").push();
    await ref.set(payload);
    return ref.key;
  }

  window.EquilibrioFirebase = {
    app,
    database,
    firebaseConfig,
    salvarResultadoJogo
  };
})();
