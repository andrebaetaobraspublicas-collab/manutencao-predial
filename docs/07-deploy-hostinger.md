# Implantação na Hostinger

## 1. Decisão recomendada

Para este SaaS, a opção preferencial é **Hostinger VPS com Docker Compose**, porque o sistema possui duas aplicações Node.js, MySQL, volume privado de anexos, webhook Stripe e necessidade de backups/monitoramento controlados.

A hospedagem gerenciada de aplicações Node.js da Hostinger pode ser usada em um piloto, desde que o plano contratado suporte aplicações Node persistentes e banco MySQL. Nesse caso, publicar frontend e API como aplicações separadas e conferir limites de processo, armazenamento e rede. Não presumir que um plano de hospedagem compartilhada comum oferece o mesmo controle de um VPS.

## 2. Topologia de produção

```text
Internet
  └─ HTTPS
      └─ Nginx/reverse proxy
          ├─ www.gestaodepredios.com.br  → web:3000
          └─ api.gestaodepredios.com.br  → api:3001
                                            ├─ mysql:3306
                                            └─ /data/uploads (privado)
```

## 3. DNS

Criar registros apontando para o IP do VPS:

- `@` ou `www` para o frontend;
- `api` para a API.

Redirecionar o domínio raiz para `www` ou escolher uma forma canônica única. Ativar TLS para ambos os hosts.

## 4. Variáveis de ambiente

Produção exige, no mínimo:

```dotenv
NODE_ENV=production
DATABASE_URL=mysql://usuario:SENHA_URL_ENCODED@mysql:3306/gestaopredios
DB_CONNECTION_LIMIT=10
API_PORT=3001
API_BASE_URL=https://api.gestaodepredios.com.br
WEB_BASE_URL=https://www.gestaodepredios.com.br
CORS_ORIGINS=https://www.gestaodepredios.com.br
JWT_ACCESS_SECRET=segredo-aleatorio-longo
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
COOKIE_DOMAIN=.gestaodepredios.com.br
COOKIE_SECURE=true
UPLOAD_ROOT=/data/uploads
MAX_UPLOAD_MB=20
NEXT_PUBLIC_API_URL=https://api.gestaodepredios.com.br/api/v1
NEXT_PUBLIC_MAP_TILE_URL=https://provedor-de-mapas/{z}/{x}/{y}.png
GEOCODING_PROVIDER=disabled
GEOCODING_API_KEY=
GEOCODING_CACHE_DAYS=30
GEOCODING_NEGATIVE_CACHE_MINUTES=15
GEOCODING_TENANT_RATE_LIMIT_HOUR=60
GEOCODING_MEMBERSHIP_RATE_LIMIT_HOUR=20
NOTIFICATION_WORKER_ENABLED=true
NOTIFICATION_POLL_INTERVAL_MS=5000
NOTIFICATION_ALERT_SCAN_INTERVAL_MS=60000
NOTIFICATION_SLA_WARNING_MINUTES=120
NOTIFICATION_SLA_MAX_WARNING_MINUTES=10080
NOTIFICATION_SLA_LOOKBACK_DAYS=30
NOTIFICATION_CONTRACT_EXPIRING_DAYS=30
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

Nunca versionar `.env` de produção. O repositório fornece `.env.production.example` apenas como modelo. Como `DATABASE_URL` é uma URL, caracteres especiais do usuário ou da senha (`@`, `:`, `/`, `#`, `%` e outros) devem ser codificados por percent-encoding; não monte essa URL por concatenação no Compose.

`GEOCODING_PROVIDER=disabled` é o padrão seguro de produção e mantém o marcador manual. Para
consulta automática, configure explicitamente `geoapify` (com chave) ou `nominatim` (com
identificação e limites compatíveis). `SEED_ADMIN_PASSWORD` é exigida somente na criação
inicial do usuário demo e deve ter ao menos 12 caracteres; execuções posteriores do seed preservam
senha, papel, situação e sequência existentes.

## 5. Preparação do VPS

1. atualizar o sistema operacional;
2. criar usuário sem login direto de root;
3. configurar chave SSH e firewall;
4. instalar Docker Engine e Compose plugin;
5. instalar Git apenas se o deploy usar checkout no servidor;
6. criar diretórios persistentes para MySQL e anexos;
7. configurar log rotation e relógio/NTP;
8. habilitar proteção e atualizações de segurança compatíveis com a operação.

## 6. Primeira publicação com Docker

No servidor:

```bash
git clone <repositorio> /opt/gestao-de-predios
cd /opt/gestao-de-predios
cp .env.production.example .env
# editar segredos, DATABASE_URL e URLs

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d mysql

docker compose -f docker-compose.prod.yml run --rm api \
  npm run prisma:deploy -w @gestaopredios/api

docker compose -f docker-compose.prod.yml up -d
```

Antes de `prisma migrate deploy`, as migrações devem ter sido geradas, revisadas e versionadas em ambiente de desenvolvimento.

## 7. Reverse proxy e TLS

O repositório traz uma configuração Nginx de referência. Ajustar certificados conforme a estratégia escolhida:

- Certbot no host;
- proxy gerenciado com emissão automática;
- outra solução compatível.

O proxy deve:

- preservar `X-Forwarded-For` e `X-Forwarded-Proto`;
- permitir upload dentro do limite configurado;
- aplicar timeout coerente para PDFs, sem mantê-lo excessivamente alto;
- bloquear acesso direto ao volume de anexos;
- habilitar HSTS apenas depois de confirmar HTTPS integral.

## 8. Stripe

Configurar no painel Stripe o webhook:

```text
https://api.gestaodepredios.com.br/api/v1/billing/webhooks/stripe
```

Usar o segredo específico do endpoint. Testar em modo teste antes de trocar as chaves. Monitorar eventos não processados na tabela `StripeWebhookEvent`.

## 9. Banco e migrações

Fluxo recomendado:

1. gerar migração em branch de desenvolvimento;
2. revisar SQL e impacto;
3. executar em banco de staging restaurado de backup anonimizado;
4. compilar e validar o artefato antes de alterar o banco;
5. ativar manutenção para impedir novos tenants e gravações de OS;
6. fazer e validar backup de produção;
7. conferir timezone da sessão, índices e `_prisma_migrations`;
8. aplicar `prisma migrate deploy` e o seed idempotente;
9. publicar as aplicações compatíveis e executar smoke tests;
10. liberar o tráfego somente após validar dados e worker de notificações.

Migrações destrutivas devem seguir expansão/contração: adicionar estrutura, migrar dados, trocar código e remover somente em versão posterior.

## 10. Backups

Cobrir separadamente:

- dump consistente do MySQL;
- volume de anexos;
- configuração e segredos em cofre apropriado;
- repositório de código e migrações.

Regras mínimas:

- backup diário automatizado;
- cópia fora do VPS;
- criptografia;
- retenção por política;
- teste real de restauração;
- registro do último sucesso e alerta de falha.

## 11. Atualização

```bash
cd /opt/gestao-de-predios
git fetch --all
git checkout <tag-aprovada>
docker compose -f docker-compose.prod.yml build
# backup + migração
docker compose -f docker-compose.prod.yml run --rm api npm run prisma:deploy -w @gestaopredios/api
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

Preferir tags ou commits aprovados, não atualizar produção diretamente de uma branch mutável.

## 12. Smoke tests pós-deploy

- `GET /api/v1/health`;
- login e refresh;
- consulta de dashboard;
- emissão e transição de OS de teste;
- consulta/ajuste manual de geocodificação e persistência de proveniência;
- cálculo de SLA útil com turno/feriado e instante correto de aviso;
- comentário, menção autorizada, checklist e caixa de notificações;
- conclusão, aceite, bloqueios de medição e reabertura de uma OS não medida;
- upload e download de PDF/imagem;
- geração do relatório de backlog;
- abertura do mapa;
- webhook Stripe de teste;
- tentativa de acesso não autorizado;
- verificação dos logs e do espaço em disco.

## 13. Rollback

Rollback de aplicação pode usar a imagem/tag anterior. Rollback de banco não deve depender de “desfazer” automaticamente migrações complexas. Usar:

- migrações compatíveis com duas versões;
- backup antes da mudança;
- plano de restauração documentado;
- janela de manutenção quando necessário.

Para `20260802210000_operational_core`, siga também o `ROLLBACK.md` da própria migração. MySQL
faz commit implícito em DDL; em falha parcial, restaure o backup ou reconcilie cuidadosamente os
objetos e o ledger com `prisma migrate resolve` a partir de `apps/api`.

## 14. Alternativa sem VPS

Na hospedagem gerenciada compatível com Node.js:

- publicar o frontend Next.js como aplicação estática (`React`, build `npm run build:web`, saída `apps/web/out`, variável `HOSTINGER_STATIC_EXPORT=1`, sem entry file);
- publicar a API NestJS como Web App separada (`apps/api/dist` e entry `apps/api/dist/main.js`);
- usar o MySQL fornecido no hPanel;
- configurar variáveis por aplicação;
- publicar por GitHub ou pacote;
- confirmar armazenamento persistente dos anexos ou contratar armazenamento externo;
- configurar domínios e webhook;
- verificar se há comando de release para migração.

A alternativa somente é adequada após validar limites de runtime, processo persistente, tamanho de upload, cron/jobs, logs e backup.

No piloto de 2 de agosto de 2026, a exportação estática foi escolhida porque o Passenger do Web App retornava 503 antes de iniciar o runtime Next.js. A lógica e os dados permanecem na API; a rota de detalhe da OS é gerada em `/ordens-servico/detalhe/?id=<id>` para ser compatível com hospedagem estática.

## 15. Deploy automático do piloto pelo GitHub

Em **2 de agosto de 2026**, os dois Web Apps gerenciados foram conectados ao repositório
`andrebaetaobraspublicas-collab/manutencao-predial`, branch `main`, com **Auto-deployment** ativo.
A primeira publicação conectada usou o commit `d298c168`.

Configuração da API:

- domínio: `api.gestaodepredios.com.br`;
- preset: `Other`;
- Node.js: `22.x`;
- diretório raiz: `./`;
- build: `npm run build:api:hostinger`;
- saída: `apps/api/dist`;
- entry file: `apps/api/dist/main.js`.

Configuração do frontend:

- domínio: `gestaodepredios.com.br`;
- preset: `React`;
- Node.js: `22.x`;
- diretório raiz: `./`;
- build: `npm run build:web`;
- saída: `apps/web/out`;
- sem entry file, pois a publicação é estática;
- `HOSTINGER_STATIC_EXPORT=1` no ambiente de build.

Fluxo de promoção:

1. desenvolver em branch dedicada;
2. abrir PR para `main` e aguardar a CI de lint, testes e builds;
3. revisar migration e compatibilidade de rollback quando houver mudança de banco;
4. mesclar o PR aprovado em `main` e aguardar o auto-deploy dos dois Web Apps;
5. o workflow `Promote Hostinger runtime` confirma que o diretório `current` é posterior ao commit,
   grava o SHA no artefato, recicla somente o Passenger da API e valida `/health/ready`;
6. considerar a promoção concluída somente quando `release` for igual ao SHA do merge e o banco
   estiver `reachable`;
7. executar login, páginas gerenciais e smoke tests proporcionais à mudança;
8. conferir runtime logs da API e registrar o commit publicado.

Segredos/variáveis exigidos no GitHub:

- secret `HOSTINGER_SSH_PRIVATE_KEY`;
- secret `HOSTINGER_SSH_KNOWN_HOSTS` com a chave do host fixada;
- variables `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_PORT` e `HOSTINGER_SSH_USER`;
- environment `production` (adicionar aprovação obrigatória quando houver outro responsável pelo
  piloto).

O recycle é necessário porque o botão `Restart` do hPanel não substituiu o processo Passenger
legado durante a promoção inicial da v0.9.0. O workflow limita o `pgrep` ao caminho exclusivo de
`api.gestaodepredios.com.br` e falha se o SHA público não corresponder ao merge.

Não versionar segredos. As variáveis continuam administradas separadamente em cada Web App. Como
os dois serviços acompanham a mesma branch, qualquer commit em `main`, inclusive documentação,
pode iniciar os dois builds. Para rollback de código, usar um novo commit de reversão em `main` ou
o redeploy do artefato anterior; migrações de banco precisam permanecer compatíveis com a versão
anterior ou seguir o plano de restauração.
