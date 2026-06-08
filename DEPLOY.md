# Guia de Deploy - EQUILÍBRIO

Este guia descreve uma publicação segura do EQUILÍBRIO mantendo o Firebase apenas como banco de dados. Não use Firebase Hosting, Firebase Functions ou deploy de frontend/backend no Firebase.

## Pré-requisitos

- Node.js 22+
- npm 8+
- Conta em uma plataforma para backend Node.js, como Render, Railway ou Vercel
- Realtime Database criado no Firebase
- Variáveis de ambiente configuradas fora do código

## Variáveis do Backend

Configure estas variáveis na plataforma de deploy:

```bash
DATABASE_URL=https://seu-projeto-default-rtdb.firebaseio.com
JWT_SECRET=gere-um-segredo-forte
FRONTEND_URL=https://seu-front-end.com
PORT=3001
```

Opcionalmente, para usar uma conta de serviço do Firebase Admin:

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/caminho/seguro/service-account.json
```

Não publique arquivos `.env`, JSON de conta de serviço ou segredos no repositório.

## Backend

## Vercel

O projeto agora inclui os arquivos necessários para rodar o backend como Vercel Function:

- `api/index.js`, para deploy usando a raiz do repositório.
- `backend/api/index.js`, para deploy usando `backend` como Root Directory.
- `backend/index.js`, para detecção de Express.
- `vercel.json` e `backend/vercel.json`, com rewrites para o Express.

Importante: a Vercel não mantém um servidor Node tradicional rodando 24 horas. O backend fica disponível como Function e é iniciado quando recebe requisições. Isso é esperado no modelo serverless.

### Opção A: deploy pela raiz do repositório

Use esta opção se a Vercel estiver conectada ao repositório inteiro.

Configuração:

- Root Directory: vazio ou raiz do projeto.
- Install Command: use o padrão do `vercel.json`.
- Build Command: vazio.
- Output Directory: vazio.

O `vercel.json` da raiz instala as dependências do backend e direciona as requisições para o Express.

### Opção B: deploy apenas do backend

Use esta opção se você criou um projeto separado para o backend.

Configuração:

- Root Directory: `backend`.
- Install Command: `npm install`.
- Build Command: vazio.
- Output Directory: vazio.

As rotas continuarão disponíveis em:

```bash
/health
/api/auth/login
/api/salas
/api/sessoes/salvar
/api/analises/dashboard
```

### Render ou Railway

1. Crie um novo serviço Node.js.
2. Aponte o diretório de trabalho para `backend`.
3. Use o comando de instalação:

```bash
npm install
```

4. Use o comando de inicialização:

```bash
npm start
```

5. Configure as variáveis de ambiente.
6. Confirme que a rota `/health` retorna `status: "ok"`.

## Frontend

O frontend é composto pelos arquivos HTML da raiz do projeto:

- `index.html`
- `jogar.html`
- `login.html`
- `painel.html`
- `firebase-config.js`

Publique esses arquivos em uma hospedagem estática com HTTPS, como Vercel, Netlify ou GitHub Pages. Em produção, atualize as constantes `BACKEND_URL` dos HTMLs para a URL real do backend.

## Firebase

Use o Firebase somente para Realtime Database.

Não execute:

```bash
firebase deploy
firebase deploy --only hosting
firebase deploy --only functions
```

Caso precise publicar regras do banco, use apenas:

```bash
firebase deploy --only database
```

## Checklist Final

- Backend responde em HTTPS.
- Frontend carrega em HTTPS.
- `FRONTEND_URL` está configurada no backend.
- Login do painel funciona.
- Criação, fechamento e exclusão de salas funcionam.
- Entrar em sala inicia o jogo automaticamente.
- Dashboard carrega gráficos e participantes.
- Console do navegador não mostra erros críticos.
- `npm test` passa no backend.
- `npm audit` foi revisado antes da produção.

## Manutenção

Semanalmente:

- Verifique logs do backend.
- Rode `npm audit` no diretório `backend`.
- Teste login, criação de sala e salvamento de resultado.

Mensalmente:

- Revise dependências.
- Verifique regras do Realtime Database.
- Confirme se os certificados HTTPS continuam válidos.
