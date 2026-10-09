# Revisão funcional da referência SINAPI 09/2026

Revisão de 09/10/2026 para o desenvolvimento em `www.gestaodepredios.com.br`.
Referência publicada: `2fde6dec-f430-4f06-b3d2-0b6fa06bb0ea`, revisão 1.
Checksum do XLSX importado: `9f1a69dfbe103bdaecb39b871a74435c364b4e6652fdbc677d8537e6742cf0d2`.

## Cobertura e critérios

- 10.599 composições, 6.124 insumos, 172 cadernos.
- Todas as composições localizadas nas árvores, sem caminhos inválidos ou ambíguos após a revisão.
- 58 novas composições e 312 analíticos alterados revisados em equipes e recursos.
- 4 novos insumos revisados nos perfis econômicos do motor tributário.
- 27 UFs × 3 regimes × 8 anos (2026–2033): 242.352 avaliações tributárias das 370 composições e dos 4 insumos.
- Sem exceções ou divergências de conciliação: linhas = ABC de insumos = serviços = IBS + CBS, em centavos.
- 36.288 avaliações anuais parciais, correspondentes a 4.536 contextos código/UF/regime com preço ausente. A ausência continua explícita, não é convertida em preço ou crédito zero determinado.

A execução é reproduzível com:

```powershell
node scripts/orcapro/audit-reference.cjs setembro.raw.json agosto.raw.json revisao.json
```

Esse teste verifica cobertura, recursos finitos e conciliação do motor; não certifica enquadramento fiscal de uma operação real nem substitui leitura dos cadernos técnicos.

## Ajustes de interpretação

O overlay `reference-review.js` é aplicado igualmente ao runtime da API e ao editor derivado. As 41 fontes originais e suas fórmulas/hashes permanecem intactos. A regra é limitada a `09/2026`.

As árvores dos pares 96520/96521, 96522/96523, 96524/96525 e 96526/96527 recebem uma variante adicional para distinguir a escavação com ou sem espaço para colocação de fôrmas. O qualificador vem da descrição oficial. Todas as alternativas e códigos continuam acessíveis.

45807 e 45808 são equipamentos de aquisição. 45809 e 45810 são bate-estacas; a classificação `SEM PREÇO` indica a indisponibilidade de cotação. Seus perfis de aquisição são identificados sem preencher preços ausentes. Na explosão das auxiliares, depreciação, juros e manutenção mantêm seus contextos próprios, em vez de reaplicar o crédito de aquisição ao preço integral do equipamento. Os códigos novos não recebem benefícios fiscais específicos por inferência; continuam nas premissas gerais editáveis de perfil/UF, com aviso de ausência no acervo específico do anexo.

Há 12 novas composições com pendências de preço nos contextos avaliados: 107709, 107712, 107714, 107715, 107716, 107718, 107719, 107720, 107721, 107722, 107724, 107725. Seus créditos continuam parciais ou não determinados. As auxiliares econômicas sem horas diretas não ganham equipes artificiais; a produtividade do serviço é obtida dos recursos horários da sua estrutura.

## Padrão e orçamento histórico

“Usar como padrão” governa projetos novos. A barra do editor identifica **a referência deste orçamento**, incluindo referências arquivadas que foram publicadas. Os exemplos conservam a referência de sua versão; escolhê-los não reescreve o exemplo global nem migra silenciosamente seu conteúdo.

Em **Orçamento → Comparar e atualizar referência**, a consulta prepara uma comparação sem gravação, com custo direto, preço com BDI, IVA, prazo e serviços. Aplicar exige confirmação e `expectedVersion`; outra sessão causa 409. O histórico anterior continua disponível.

Quantidades, equipes editadas, BDI, adaptações privadas e custos informados são preservados. Cotações específicas de outra referência não migram automaticamente. Os 6 códigos excluídos (93957, 93959, 93961, 93967, 93969, 93971) não recebem substitutos automáticos: um grafo com dependência excluída bloqueia a comparação e indica a pendência. Análises de riscos conservam sua fotografia e devem ser refeitas após a atualização.

Rollback: voltar ao release anterior do desenvolvimento. Não há migrations nem alteração dos catálogos publicados neste ajuste; a nova revisão auditável do orçamento pode ser restaurada pela tela de histórico.
