# Modelo de monetização

## 1. Princípio

Cobrar pelo valor gerenciado sem criar barreira para que demandantes abram chamados. Por isso, a unidade principal recomendada é uma combinação de:

- número de edificações ativas;
- usuários operacionais/administrativos;
- volume anual de OS;
- armazenamento;
- recursos avançados.

**Demandantes somente de abertura e acompanhamento devem ser gratuitos ou muito amplos.** Cobrá-los individualmente reduz adoção e prejudica a qualidade do backlog.

Os valores abaixo são hipótese de lançamento e devem ser validados com clientes reais, custos de suporte e posicionamento. Não são compromisso comercial definitivo.

## 2. Planos sugeridos

| Plano | Mensalidade sugerida | Edificações | Usuários operacionais | OS/ano | Armazenamento | Público |
|---|---:|---:|---:|---:|---:|---|
| Trial assistido | R$ 0 por 30 dias | 3 | 5 | 500 | 2 GB | avaliação guiada |
| Essencial | R$ 349/mês | 3 | 5 | 1.500 | 5 GB | condomínio/pequena organização |
| Profissional | R$ 799/mês | 15 | 15 | 10.000 | 25 GB | carteira média e contratos completos |
| Gestão Ampla | R$ 1.990/mês | 50 | 50 | 50.000 | 100 GB | portfólio corporativo ou órgão público |
| Enterprise | proposta, referência a partir de R$ 4.900/mês | negociado | negociado | negociado | negociado | requisitos de segurança, implantação e SLA próprios |

### Recursos por camada

**Essencial**

- edificações e mapa;
- OS, backlog, pendências, fotos/PDF;
- fornecedores e contratos básicos;
- dashboard e relatórios essenciais;
- suporte por e-mail.

**Profissional**

- tudo do Essencial;
- contratos, prazos, aditivos e ajustes;
- medições e orçamento quando lançados;
- planos preventivos e KPIs;
- relatórios avançados;
- perfis de fiscalização;
- prioridade de suporte.

**Gestão Ampla**

- tudo do Profissional;
- empenhos, penalidades e fiscalização administrativa;
- governança e auditoria ampliadas;
- mais armazenamento e portfólio;
- onboarding estruturado;
- revisão periódica de uso.

**Enterprise**

- limites, retenção e backup negociados;
- SSO/MFA obrigatório quando implementado;
- ambiente ou banco segregado se contratado;
- migração, treinamento e suporte com SLA próprio;
- contratação por instrumento comercial/manual, sem depender exclusivamente de cartão.

## 3. Add-ons sugeridos

| Add-on | Hipótese inicial |
|---|---:|
| bloco de 10 edificações | R$ 199/mês |
| usuário operacional adicional | R$ 29/mês |
| 50 GB adicionais | R$ 79/mês |
| implantação e configuração | R$ 2.500 a R$ 15.000, conforme porte |
| migração de dados | orçamento por volume e qualidade |
| treinamento remoto adicional | pacote fechado |
| ambiente segregado/backup especial | proposta enterprise |

Evitar uma tabela excessivamente fragmentada. Add-ons devem resolver limites reais, não ocultar recursos básicos.

## 4. Cobrança anual

Recomendação inicial:

- mensal: preço cheio;
- anual antecipado: desconto equivalente a cerca de dois meses;
- contratos públicos/corporativos: faturamento por instrumento próprio, com entitlement manual e vigência registrada no sistema.

## 5. Trial e aquisição

- trial de 30 dias sem cartão para leads qualificados;
- onboarding com exemplo e importação mínima;
- marcos de ativação: primeira edificação, primeiro contrato, primeira OS e primeiro fechamento;
- mensagens orientadas por uso, não por contagem regressiva agressiva;
- bloqueio após trial preserva leitura e exportação por período de carência, mas impede novas operações conforme política transparente.

Não iniciar com plano gratuito permanente. O produto exige suporte, armazenamento e governança; um trial assistido seleciona melhor os usuários e reduz base inativa.

## 6. Stripe e contratos manuais

Stripe deve administrar:

- cliente;
- preço recorrente;
- checkout;
- pagamento e falha;
- portal;
- cancelamento;
- webhooks.

A aplicação administra entitlement e limites. O status exibido deve vir do processamento do webhook, não apenas da página de sucesso.

Para clientes que não usam cartão, criar assinatura `MANUAL_CONTRACT` com plano, limites, vigência e referência do instrumento de contratação. Isso preserva uma única camada de autorização comercial.

## 7. Métricas econômicas

Acompanhar por plano e coorte:

- MRR e ARR;
- receita média por tenant;
- conversão trial→pago;
- tempo até primeira OS fechada;
- churn de clientes e de receita;
- expansão por edifícios/usuários;
- custo de suporte por tenant;
- armazenamento e tráfego por tenant;
- margem bruta;
- CAC e prazo de retorno;
- retenção líquida de receita.

Fórmulas mínimas:

```text
Margem bruta = (Receita - infraestrutura - Stripe - suporte direto) / Receita
LTV simplificado = ARPA mensal × margem bruta / churn mensal
Payback CAC = CAC / (ARPA mensal × margem bruta)
```

Não usar LTV como certeza quando a base histórica ainda for pequena.

## 8. Processo de validação do preço

1. entrevistar clientes por porte e tipo de contrato;
2. registrar ferramentas atuais e custo do problema, sem ancorar na tabela sugerida;
3. testar três propostas com limites distintos;
4. medir uso de edifícios, usuários, OS e armazenamento;
5. revisar preço após clientes pilotos e antes de publicidade em escala;
6. manter contratos existentes conforme política comercial clara.

## 9. Recomendação final

Começar com três planos públicos — Essencial, Profissional e Gestão Ampla — mais Enterprise sob proposta. Posicionar **Profissional** como opção principal. Usar edifícios e usuários operacionais como limites compreensíveis, deixando demandantes livres para maximizar adoção e qualidade dos dados.
