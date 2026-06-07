# Documentação de Segurança - EQUILÍBRIO

## Resumo Executivo

O EQUILÍBRIO usa segurança em múltiplas camadas:

- Autenticação JWT com expiração de 24 horas.
- Senhas com hash `bcryptjs` e 10 rounds.
- Validação de entrada no servidor.
- Sanitização básica contra XSS.
- Controle de acesso por propriedade da sala.
- Headers de segurança com `helmet`.
- Rate limiting em rotas de API e login.
- Firebase usado apenas como banco de dados.
- Nick do estudante opcional, apoiando privacidade e minimização de dados.

## Autenticação

O login profissional ocorre em `POST /api/auth/login`.

O token JWT:

- Usa algoritmo `HS256`.
- Expira em 24 horas.
- É transmitido no header `Authorization: Bearer <token>`.
- É armazenado no frontend em `localStorage`.

As senhas:

- Nunca são salvas em texto puro.
- São comparadas com `bcryptjs.compare`.
- Não aparecem em logs.

## Autorização

Endpoints protegidos usam o middleware `verificarAutenticacao`.

As rotas de salas e análises verificam se a sala pertence ao profissional autenticado antes de retornar ou modificar dados:

```javascript
if (sala.profissional_id !== professionalId) {
  return res.status(403).json({ erro: 'Acesso negado' });
}
```

## Validação e Sanitização

O backend valida:

- Campos obrigatórios.
- Tipo dos dados.
- Tamanho máximo de textos.
- Formato dos códigos de sala.
- Indicadores numéricos entre 0 e 100.

Entradas textuais são sanitizadas com `sanitizarInput`, reduzindo risco de XSS em nomes de salas, descrições e nicks.

## Dados Sensíveis

Boas práticas aplicadas:

- `JWT_SECRET` vem de variável de ambiente.
- Credenciais Firebase Admin devem ficar fora do código, via `FIREBASE_SERVICE_ACCOUNT_PATH` ou `GOOGLE_APPLICATION_CREDENTIALS`.
- Respostas de erro não retornam tokens, hashes ou stack traces.
- Logs não incluem senhas nem tokens.

## LGPD e Privacidade

O projeto reduz coleta de dados pessoais:

- O nome/nick do estudante é opcional.
- Resultados são vinculados à sala, não exigem cadastro do estudante.
- O painel é restrito ao profissional autenticado.
- O armazenamento local de desenvolvimento fica em `backend/data` e não deve ser versionado.

Recomendações para produção:

- Definir política de retenção e exclusão de dados.
- Permitir remoção de salas e sessões quando solicitado.
- Documentar finalidade de uso dos dados para professores e estudantes.

## Firebase

O Firebase deve ser usado apenas como Realtime Database.

Não usar neste projeto:

- Firebase Hosting.
- Cloud Functions.
- Firebase Authentication.
- Firebase Storage.

## HTTPS

Em produção, o frontend e o backend devem usar HTTPS.

O backend já usa `helmet` para adicionar headers de segurança, incluindo:

- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: SAMEORIGIN`.
- Política de segurança de conteúdo compatível com os scripts usados pelo projeto.

Também é necessário configurar:

- HSTS.
- CORS restrito ao domínio real do frontend.
- Variáveis de ambiente próprias por ambiente.

## Rate Limiting

O backend já aplica:

- Limite específico para `POST /api/auth/login`.
- Limite geral para `/api/`.

Em produção, ajuste os limites conforme o volume real de uso.

## Auditoria Operacional

Comandos úteis:

```bash
npm audit
rg -n "console\\.log.*senha|console\\.log.*token" backend/src
rg -n "JWT_SECRET|API_KEY|SECRET" backend/src
rg -n "firebase-functions|firebase\\.auth|firebase\\.storage|admin\\.auth|admin\\.storage" .
```

## Testes de Segurança

Cobertura recomendada:

- Login válido e inválido.
- Token ausente, inválido e expirado.
- Criação de sala sem autenticação.
- Acesso a sala de outro profissional.
- Inputs maliciosos com HTML/script.
- Indicadores fora do intervalo permitido.
- Salvamento em sala inexistente ou inativa.

## Dependências

Executar regularmente:

```bash
npm audit
npm outdated
```

No estado atual, o `firebase-admin` foi atualizado para reduzir riscos críticos. Ainda restam vulnerabilidades moderadas transitivas relacionadas a `uuid` na cadeia do Firebase Admin; elas devem ser monitoradas e corrigidas quando houver atualização segura sem downgrade ou quebra indesejada.
