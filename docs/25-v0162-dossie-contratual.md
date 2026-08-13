# v0.16.2 — Dossiê contratual responsivo e editável

## Objetivo

Reorganizar a área de detalhe dos contratos para uso operacional em telas amplas e permitir a correção dos registros do dossiê sem excluir e recriar informações.

## Entregas

- dossiê contratual com a mesma largura da relação de contratos;
- navegação horizontal e rolável entre as treze seções;
- resumo em cartões uniformes, sem sobreposição de textos;
- correção das colunas de grade `2`, `5` e `10`, usadas pelos formulários;
- rodapé próprio para a ação de salvar, sem cobrir campos;
- botões de edição para aditivos, reajustes, subcontratações, sanções, equipe de fiscalização, garantias, apostilamentos, recebimentos, diários e comunicações;
- acesso direto à edição das ordens de serviço e à gestão dos empenhos;
- atualização auditada no backend, preservando o isolamento por organização;
- recálculo do valor atual do contrato após editar eventos financeiros.

## Validação

- verificação de tipos da API;
- lint do frontend;
- builds de produção da API e do frontend;
- cenário de integração cobrindo edição de aditivo, recálculo financeiro e bloqueio entre organizações.
