# Regressão Infra: rodovia e inventário — 16/11/2026

As duas falhas subsequentes da CI foram reproduzidas localmente. O exemplo conserva 64 serviços, 172 dias úteis, custo direto de 2.964.114.491 centavos e preço de 3.563.786.534 centavos. A desigualdade estava somente no agregado informativo de IVA: a comparação usava os novos padrões fiscais contra o cenário antigo do HTML original.

O commit `5f75e7c` alterou intencionalmente as premissas fiscais e de BDI, conforme `tax-scenario-20261031.md`. O teste agora compara integralmente os totais orçamentários sem confundir cenários fiscais diferentes. Um segundo teste carrega uma instância independente do motor atual com as premissas históricas explicitamente fixadas em schema 8 (sem migração automática de padrões antigos), e exige igualdade de todo o agregado, inclusive IVA, com o HTML histórico. Valores, itens e prazo esperados não foram alterados.

O inventário estava desatualizado para dois módulos: `21_bdi_core.js`, modificado em `5f75e7c`, e `28_abc_ui.js`, modificado no mesmo commit e em `b889806` (autotestes SICRO e deduplicação da interface tributária). Foram atualizados somente seus hashes extraídos e tamanhos, com indicação dos commits e documentos de origem. Os hashes originais e o HTML histórico permanecem preservados; a conferência de todos os módulos continua obrigatória.

Nenhum código do motor ou aplicativo foi alterado nesta correção. A execução dos testes usa fixtures locais/CI, sem conexão aos bancos dos ambientes. Sincronização Git não autoriza publicação, migration ou reinício; promoção automática do GitHub permanece desativada e o frontend de desenvolvimento tem publicação Git nativa desligada.
