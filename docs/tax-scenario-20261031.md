# Cenário tributário de desenvolvimento — 31/10/2026

Escopo: OrçaPro e OrçaPro Infraestrutura em gestaodepredios.com.br. A publicação não modifica produção, e-mails, catálogos oficiais, preços, quantidades ou BDI aplicado ao orçamento.

## Premissas anuais editáveis

| Ano | CBS | IBS |
|---|---:|---:|
|2026|0,90%|0,10%|
|2027–2028|11,20%|0,10%|
|2029|11,30%|1,87%|
|2030|11,30%|3,74%|
|2031|11,30%|5,61%|
|2032|11,30%|7,48%|
|2033–2037|11,30%|18,70%|

São premissas do cenário fornecido pelo usuário, não certificação de alíquotas legais futuras. A transição constitucional do ICMS/ISS permanece fixa. O padrão das três calculadoras de BDI passa a usar redutor governamental de 44,2%, sem reaplicar automaticamente o BDI ao orçamento. Configurações de BDI já salvas continuam próprias do projeto; a restauração dos padrões usa os novos valores.

## Depreciação progressiva

Terceira opção em Reforma Tributária → Premissas → Tratamento do equipamento. Fator = máximo(0; mínimo(1; (ano do crédito − 2027)/10)). Portanto: 2027 = 0%; 2028 = 10%; …; 2031 = 40%; …; 2037 = 100%. Depois de 2033, a tabela de alíquotas nominais permanece editável.

O fator multiplica uma única vez o aproveitamento da depreciação elegível, antes do fator dos anexos. Não modifica depreciação, custo horário, coeficientes, juros, manutenção, combustível ou operador. O ano de crédito consultado determina o fator; o ano manual de aquisição não governa essa terceira modalidade. A memória registra o percentual aplicado. As duas modalidades anteriores permanecem disponíveis.

## CBS específica de combustíveis

Fonte documental: PDF fornecido da Portaria MF nº 3.074, de 09/10/2026, Anexo; efeitos a partir do 91º dia da publicação (08/01/2027). O modelo é anual: não faz rateio diário da vigência de janeiro. O tratamento potencial/suspenso de 2026 permanece separado.

Gasolina: R$ 0,7925/L; EAC e EHC: R$ 0,1922/L; diesel puro: R$ 0,3515/L; biodiesel B100 do item IV: R$ 0,1480/L; GLP não abrangido pela exceção doméstica até 13 kg: R$ 0,1677/kg; QAV: R$ 0,0712/L; óleo combustível: R$ 0,3403/kg.

Para equipamentos a diesel, o padrão é a hipótese B15: 0,85 × 0,3515 + 0,15 × 0,1480 = **R$ 0,320975/L**. Não é alíquota expressa da mistura na Portaria. Pressupõe biodiesel do item IV, sem a exceção de agricultura familiar. O valor é mantido com precisão integral no motor; não é R$ 0,42/L. A fonte aparece junto da premissa editável. As cargas estaduais anteriores não são substituídas; nos três combustíveis acrescentados sem referência estadual, esta inicia em zero e deve ser preenchida conforme a operação.

## Compatibilidade e verificação

Cenário versão 8: atualiza os vetores completos que coincidam com os antigos padrões e os conhecidos padrões federais de combustível. Parâmetros personalizados e substituições anuais explícitas são preservados. A validação não modifica o objeto de entrada. Não há migração SQL ou exclusão de projetos.

Testes: motores SINAPI/SICRO, B15 e demais combustíveis, recuperação proporcional 2027–2037, alíquotas anuais de BDI, redutores das três abas, preservação de ajustes manuais e regressão dos projetos históricos com suas premissas fiscais explicitamente fixadas. Dois autotestes de cobertura documental da matriz original de 4.876 insumos são independentes da aritmética fiscal e não se aplicam à fixture com 6.120 insumos.
