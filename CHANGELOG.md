# Changelog

## 0.1.1 — Baseline instalável e candidata a piloto

- Adicionado `package-lock.json` reproduzível e migração inicial MySQL versionada.
- Corrigidos erros de TypeScript no JWT, autenticação, atualização e satisfação de OS.
- Corrigidos bloqueadores de lint e build no frontend Next.js.
- Atualizadas dependências vulneráveis e adicionados overrides transitivos de segurança.
- Validado Prisma, lint, testes e builds locais; validação Docker/MySQL permanece para o VPS.
- Adicionados scripts de build separados para os Web Apps Next.js e NestJS da Hostinger.
- Removida a senha demonstrativa do código e da tela; o seed agora exige `SEED_ADMIN_PASSWORD`.
- A API agora respeita a porta dinâmica `PORT` e possui bootstrap Hostinger com migração e seed idempotente.
- Adicionado pacote standalone da API para o Web App da Hostinger, com geração Prisma antes do build e materialização do runtime no diretório configurado pelo hPanel.
- Alinhado o fallback HTTP da API à porta 3000 exigida pela hospedagem gerenciada.
- Adicionado preparo do runtime standalone do Next.js para incluir dependências rastreadas, arquivos estáticos e conteúdo público no artefato da Hostinger.

## 0.1.0 — Fundação técnica

- Monorepo Node.js com NestJS, Next.js e MySQL/Prisma.
- Modelo multi-tenant.
- Autenticação com access token e refresh token rotativo em cookies HttpOnly.
- Cadastros iniciais de edificações, fornecedores e contratos.
- Núcleo de ordens de serviço, pendências, histórico, anexos e backlog.
- Dashboard inicial e relatório PDF de backlog.
- Documentação de arquitetura, produto, roadmap, monetização, Hostinger e handoff ao Codex.
