# v0.11.0 — interface, contratos e SINAPI

Data de referência: **2 de agosto de 2026**.

## Escopo entregue

- mapa gerencial com estilo cartográfico rotulado, zoom urbano, indicação da localidade e
  fallback raster quando o estilo vetorial não puder ser carregado;
- fornecedor do tipo empresa ou consórcio, endereço normalizado, múltiplas áreas vinculadas às
  categorias operacionais, integrantes e histórico de sanções;
- contrato com identificação do processo licitatório/contratação de origem e datas nomeadas
  explicitamente como vigência;
- dossiê contratual com aditivos/prorrogações, subcontratações autorizadas, sanções, OS,
  reajustes/repactuações e empenhos;
- `currentValue` não é aceito nos DTOs de criação/edição. O servidor deriva o valor do
  original somado aos impactos ativos de aditivos e ajustes;
- upload `.xlsx` oficial do SINAPI para uma UF, gerando catálogos separados de insumos e
  composições sintéticas, com e sem desoneração;
- upload de tabela própria com `Código`, `Descrição`, `Unidade`, `Custo Unitário` e `Tipo`
  opcional.

## Regras da importação SINAPI

As abas aceitas do arquivo oficial são `ISD`, `ICD`, `CSD` e `CCD`. `ISE`, `CSE`, `Analítico`
e `Analítico com Custo` não são importadas. A competência é lida da própria planilha; a UF é
escolhida pelo usuário. O arquivo recebe SHA-256 e os itens são persistidos em lotes de 500.

No arquivo de referência `SINAPI_Referência_2026_04.xlsx`, a validação para MG reconheceu
29.364 itens com preço: 8.608 insumos e 20.756 composições, divididos igualmente entre os dois
regimes.

## Novas rotas

- `POST /suppliers/:id/penalties`
- `POST /contracts/:id/amendments`
- `POST /contracts/:id/adjustments`
- `POST /contracts/:id/subcontracts`
- `POST /contracts/:id/penalties`
- `POST /budgets/catalogs/import-file` (`multipart/form-data`, até 40 MB)

Todas as consultas relacionais validam `tenantId`, e criações/edições relevantes geram
registro de auditoria.
