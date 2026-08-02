# Changelog

## 0.10.0 — Piloto operacional e homologação

- Adicionado painel tenant-aware do GP-044 com nove cenários operacionais, verificações
  automáticas, parecer humano e referências de evidência.
- Decisões, aceite final e exportações ficam registrados na trilha de auditoria append-only.
- A aprovação final é bloqueada enquanto existir cenário automático pendente ou sem decisão
  humana aprovada; regressões posteriores ao aceite tornam-se visíveis.
- Adicionados relatório PDF, base CSV protegida contra fórmulas e testes de isolamento entre
  organizações.
- O staging foi excluído deste ciclo por decisão do proprietário; o banco público atual permanece
  temporariamente destinado apenas a dados sintéticos de teste.

## 0.9.3 — Deploy isolado e resiliente da API

- Separado o gatilho de build da API na branch técnica `deploy-api`, evitando concorrência com o
  build do frontend conectado à `main`.
- Cada promoção aprovada cria um commit técnico vazio na branch de deploy, permitindo repetir um
  build sem alterar o código funcional.
- A espera e a carimbagem do runtime agora toleram desconexões SSH transitórias do Hostinger.

## 0.9.2 — Promoção Passenger com correspondência exata

- Limitada a reciclagem automática ao processo Passenger exato da API, sem atingir a sessão SSH
  responsável pela promoção.
- Mantidas a carimbagem do SHA, a verificação pública da release e a checagem do banco antes de
  concluir o deploy.

## 0.9.1 — Promoção automática do runtime Hostinger

- Adicionado workflow pós-CI que aguarda o build conectado ao GitHub, carimba o SHA e recicla
  somente o Passenger da API.
- A prontidão agora expõe o SHA efetivamente carregado pelo processo, permitindo comprovar que o
  domínio público e o artefato `current` são a mesma release.
- Mantido o auto-deploy da Hostinger para `main`, com verificação pública do banco antes de concluir
  a promoção.

## 0.9.0 — Núcleo gerencial e operacional

- Implementados medições, empenhos, orçamento/SINAPI, manutenção preventiva, KPIs, SLAs e
  relatórios gerenciais.
- Adicionados gates de staging, backup, restauração e piloto controlado do GP-031.

## 0.8.0 — Relatórios essenciais do MVP

- Adicionada central de relatórios com acesso por papéis gerenciais, contratuais e auditoria.
- Adicionados backlog de OS filtrado e reconciliado em PDF/CSV, com limite explícito de 5.000 linhas.
- Adicionados filtros por responsável, categoria, contrato, período e faixa de idade do backlog.
- Adicionada ficha individual da OS em PDF com classificação, SLA, fechamento e histórico.
- Adicionados contratos a vencer em PDF/CSV, espelho contratual em PDF e execução financeira em CSV.
- Adicionados organização, filtros, data de emissão, paginação e hash SHA-256 aos documentos.
- Reforçada a exportação CSV contra fórmulas injetadas e com BOM UTF-8 para uso no Excel.
- Estabilizada a outbox quando o e-mail não está configurado: a entrega interna é concluída e o canal indisponível fica registrado nas métricas/logs.
- Adicionados testes de isolamento por tenant nos filtros analíticos e relatórios.

## 0.7.0 — Núcleo operacional configurável

- Implementada geocodificação confirmada com cache, limites, ajuste de marcador e fallback manual.
- Adicionados catálogos multi-tenant de categorias, especialidades, ambientes e causas.
- Substituído o SLA fixo por políticas com precedência tenant/contrato/categoria, calendários, feriados e turnos.
- Adicionados comentários cronológicos com menções e checklists históricos por categoria.
- Adicionadas regras configuráveis de evidências antes/durante/depois e bloqueios de conclusão.
- Adicionadas notificações internas e por e-mail com preferências, outbox transacional, retry e alertas de SLA/contrato.
- Adicionados fechamento com aceite/custo/elegibilidade e reabertura explícita com motivo, contador e indicador de 30 dias.
- Adicionados snapshots de SLA e critérios operacionais por OS para preservar o histórico.
- Adicionada migration `20260802210000_operational_core`, provisionamento de defaults para tenants novos e seed operacional idempotente.
- Endurecidas concorrência, autorização por objeto, abrangência contratual e integridade entre fechamento, medição e reabertura.
- Preservado o ciclo anterior de SLA em reaberturas e adotado aviso persistido no calendário útil.
- Preservada a avaliação anterior no histórico da reabertura, com limpeza atômica do ciclo corrente e proteção contra corrida.
- Revalidada a autorização de notificações na entrega e leitura, inclusive após rebaixamento de papel.

## 0.6.0 — Conta SaaS e acesso de equipes

- Adicionada administração de membros com isolamento por tenant e proteção hierárquica de papéis.
- Adicionados convites por e-mail com token em hash, uso único, validade de 72 horas e acesso provisório.
- Adicionadas suspensão, reativação e revogação de sessões com registro de auditoria.
- Adicionadas alteração e recuperação de senha, com revogação global de sessões após troca sensível.
- Adicionada verificação de e-mail e integração configurável com Resend.
- Adicionadas telas de administração, conta, convite, recuperação, redefinição e verificação.
- Adicionada migration `20260802180000_accounts_and_invitations` e ampliado o teste e2e multiempresa para membros.

## 0.1.2 — Diagnóstico e estabilização da Fase A

- Adicionado diagnóstico verificável da arquitetura, módulos, banco, segurança, testes e publicação.
- Adicionada suíte e2e de isolamento entre organizações para edificações, fornecedores, contratos, OS, pendências e anexos.
- A CI agora aplica as migrações versionadas com `prisma migrate deploy` e executa os testes multiempresa.
- Dockerfiles da API e do frontend agora usam `package-lock.json` e `npm ci` para builds determinísticos.
- Adicionado smoke test dos domínios públicos, health da API e Swagger.
- Registrado o bloqueio atual de roteamento Hostinger: frontend HTTP 503 e API HTTP 404, apesar dos processos ativos.

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
