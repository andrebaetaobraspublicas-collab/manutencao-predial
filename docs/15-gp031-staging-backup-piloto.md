# GP-031 — staging, backup e piloto

Data-base: 2 de agosto de 2026. Este roteiro é o gate operacional da v0.9.0 e não autoriza o uso
de dados pessoais ou documentos sensíveis antes do ensaio de restauração.

## 1. Topologia exigida

O staging deve possuir banco, `JWT_ACCESS_SECRET`, cookies, uploads, e-mail, Stripe e domínios
próprios. Nenhum serviço de staging pode apontar para o MySQL ou para o diretório de anexos da
produção. Use `.env.staging.example` como inventário, nunca como arquivo de segredos.

Configuração-alvo:

- `staging.gestaodepredios.com.br`: frontend estático da branch/tag candidata;
- `api-staging.gestaodepredios.com.br`: API da mesma revisão;
- `gestaopredios_staging`: banco descartável, com dados sintéticos ou cópia anonimizada;
- `uploads-staging`: armazenamento isolado;
- worker de notificação inicialmente desabilitado ou com destinatários de teste.

O plano Hostinger observado na implantação atual não possuía slot livre de Web App. Assim, o
repositório e o pipeline estão preparados, mas a criação do staging público exige liberar ou
contratar dois slots. Não se deve remover nem reaproveitar aplicações fora deste projeto sem uma
decisão explícita do proprietário.

## 2. Pipeline da candidata

O workflow `Pilot readiness` pode ser iniciado manualmente ou por tag `v*`. Ele:

1. cria MySQL vazio e aplica todas as migrations versionadas;
2. confirma `prisma migrate status`;
3. executa lint, testes unitários, e2e e builds;
4. publica por 90 dias a evidência com migrations, lockfile e este roteiro.

A promoção ocorre somente com o workflow aprovado, backup verificado e aceite do responsável.
O auto-deploy Hostinger continua vinculado a `main`; portanto, merge em `main` é uma promoção.

## 3. Backup e restauração

O backup lógico consistente do MySQL usa arquivo temporário de credenciais e gera ZIP com hash:

```powershell
$env:DATABASE_URL = '<URL obtida do cofre>'
./scripts/backup-mysql.ps1 -OutputDirectory 'D:\Backups\GestaoPredios'
```

Copie o ZIP para armazenamento fora da Hostinger, com criptografia e retenção. Registre hash,
horário UTC, tamanho, responsável e resultado. Os anexos privados exigem cópia separada do
`UPLOAD_ROOT`, preservando nomes, permissões e hash.

O teste de restauração aceita somente banco cujo nome contenha `restore`, `staging` ou `test`:

```powershell
$env:RESTORE_DATABASE_URL = '<URL de banco descartável>'
./scripts/verify-mysql-restore.ps1 -BackupPath 'D:\Backups\GestaoPredios\arquivo.zip'
```

Depois do retorno `verified`, executar migration status, seed idempotente, API e smoke funcional.
Meta inicial: RPO de 24 horas e RTO de 4 horas. A meta somente é considerada comprovada depois de
um ensaio cronometrado com registro da evidência.

## 4. Roteiro do piloto

Usar apenas dados sintéticos no primeiro ciclo:

- cadastrar duas organizações e provar isolamento de edificação, OS, medição, empenho,
  orçamento, plano e KPI;
- cadastrar contrato, empenho e base SINAPI reduzida;
- criar e aprovar orçamento de OS;
- concluir/aceitar a OS, criar medição, submeter, revisar, aprovar, liquidar e pagar;
- conciliar valor vigente, medido, liquidado, pago e saldos;
- criar ativo/plano e executar o gerador duas vezes, comprovando ausência de OS duplicada;
- calcular duas competências de KPI e conferir tendência, PDF e CSV;
- validar convite, troca de senha, RBAC, anexo privado, comentário, checklist e notificação;
- executar `/api/v1/health/live`, `/api/v1/health/ready` e `npm run smoke:production` contra o
  ambiente correto;
- restaurar backup em banco descartável e conferir amostras/totais.

## 5. Aceite e incidentes

O piloto é aprovado somente quando não houver falha de isolamento, divergência financeira,
duplicidade preventiva ou restauração pendente. Para cada incidente registrar: horário UTC,
release SHA, tenant afetado, rota, impacto, evidência, contenção, causa, correção e teste de
regressão. Segredos, cookies e dados pessoais nunca entram em issues ou logs de evidência.

