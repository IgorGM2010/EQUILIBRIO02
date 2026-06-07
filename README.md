# EQUILÍBRIO

Projeto do Painel do Profissional para EQUILÍBRIO.

## Backend

O backend fica em `backend/src` e usa Node.js, Express, Firebase Realtime Database, JWT e bcrypt.

Firebase deve ser usado apenas como banco de dados. O backend roda fora do Firebase, com `node src/index.js`; não há deploy de Cloud Functions nem hospedagem no Firebase.

Para instalar as dependências:

```bash
cd backend
npm install
```

Para configurar variáveis locais, copie `backend/.env.example` para `backend/.env` e preencha `JWT_SECRET`, `FRONTEND_URL` e `DATABASE_URL`.

Para iniciar o backend:

```bash
cd backend
npm start
```

Para executar os testes:

```bash
cd backend
$env:TEST_PROFESSIONAL_PASSWORD="senha-do-profissional"
npm test
```

## Rotas Disponíveis

O backend roda por padrão em `http://localhost:3001`.

Autenticação:

```bash
POST /api/auth/login
```

Salas:

```bash
POST /api/salas
GET /api/salas
GET /api/salas/:salaId
PUT /api/salas/:salaId/status
GET /api/salas/validar/:codigo
```

Sessões:

```bash
POST /api/sessoes/salvar
```

Análises:

```bash
GET /api/analises/dashboard
GET /api/analises/sala/:salaId
```

Exemplo para criar sala:

```bash
curl -X POST http://localhost:3001/api/salas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d "{\"nome\":\"Turma 2A - 2026\",\"descricao\":\"Avaliação diagnóstica\"}"
```

## Firebase

O projeto Firebase configurado é `equilibrio-d6275`.

O arquivo `firebase-config.js` inicializa o SDK Web apenas para Realtime Database e sincroniza resultados anônimos do jogo em `resultados_jogo`. As regras em `database.rules.json` mantêm leitura pública desativada e permitem apenas criar novos resultados anônimos.

Não faça deploy do backend no Firebase. Use o Firebase apenas como Realtime Database configurado por `DATABASE_URL`.

## Fluxo do Jogo

Ao abrir `jogar.html`, o aluno escolhe entre:

- Jogar normalmente, sem sala.
- Entrar com código de sala.

No modo com sala, o frontend valida o código em:

```bash
GET /api/salas/validar/:codigo
```

Ao final da partida, o resultado é enviado ao backend em:

```bash
POST /api/sessoes/salvar
```

O backend valida a sala, valida os indicadores, calcula o perfil no servidor e salva em `sessoes` no Realtime Database.

## Painel do Profissional

Use `login.html` para autenticar profissionais e `painel.html` para visualizar o dashboard.

O painel consome as rotas protegidas de análises com o token JWT salvo em `localStorage`.
