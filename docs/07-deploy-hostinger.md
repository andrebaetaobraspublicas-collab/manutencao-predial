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
NEXT_PUBLIC_MAP_STYLE_URL=https://provedor-de-mapas/style.json
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

Nunca versionar `.env` de produção. O repositório fornece `.env.production.example` apenas como modelo. Como `DATABASE_URL` é uma URL, caracteres especiais do usuário ou da senha (`@`, `:`, `/`, `#`, `%` e outros) devem ser codificados por percent-encoding; não monte essa URL por concatenação no Compose.

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
4. fazer backup de produção;
5. aplicar `prisma migrate deploy`;
6. publicar aplicações compatíveis;
7. executar smoke tests.

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

## 14. Alternativa sem VPS

Na hospedagem gerenciada compatível com Node.js:

- criar aplicação Next.js e aplicação NestJS separadas;
- usar o MySQL fornecido no hPanel;
- configurar variáveis por aplicação;
- publicar por GitHub ou pacote;
- confirmar armazenamento persistente dos anexos ou contratar armazenamento externo;
- configurar domínios e webhook;
- verificar se há comando de release para migração.

A alternativa somente é adequada após validar limites de runtime, processo persistente, tamanho de upload, cron/jobs, logs e backup.
