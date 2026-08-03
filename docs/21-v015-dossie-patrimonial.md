# v0.15.0 — Dossiê patrimonial e vistorias

Data de referência: **3 de agosto de 2026**.

## Resultado entregue

- mapa das edificações baseado em mosaicos cartográficos com ruas, avenidas,
  cidades e demais rótulos, configurável por variável de ambiente;
- laudos de inspeção e documentos do imóvel em PDF;
- fotografias da edificação em JPG, PNG ou WebP;
- cadastro e histórico de vistorias, com data, tipo, responsável técnico,
  equipe e observações;
- data da última vistoria calculada pelo histórico, sem digitação redundante;
- consulta, dentro da edição da edificação, aos planos de manutenção associados;
- análise prévia dos vínculos antes do arquivamento de uma edificação;
- ação de arquivamento disponível somente para proprietário ou administrador.

## Segurança e integridade

Os arquivos são gravados fora da área pública e baixados apenas por endpoint
autenticado, sempre filtrado pelo `tenantId` da sessão. O backend valida tipo
MIME, assinatura binária, tamanho e hash SHA-256. A remoção de anexos,
vistorias e edificações é lógica e auditada.

Ao arquivar uma edificação, o sistema informa os totais de contratos, ordens de
serviço e planos associados. O histórico é preservado; planos ativos da
edificação são suspensos na mesma transação para impedir novas gerações
automáticas de OS.

## Banco e reversão

A migration `20260804010000_building_dossier_inspections` cria as tabelas
`BuildingInspection` e `BuildingAttachment` de forma aditiva. O procedimento de
reversão está documentado no arquivo `ROLLBACK.md` da própria migration.

## Critérios de verificação

- schema Prisma válido e client gerado;
- lint da API e do frontend;
- testes unitários, incluindo isolamento entre organizações na análise de
  impacto de exclusão;
- builds de produção NestJS e Next.js;
- aplicação da migration pelo pipeline antes da promoção da API;
- smoke test da API e verificação visual do mapa após a publicação.
