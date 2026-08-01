# ADR 0004 — Arquivos sempre privados

- **Status:** aceito
- **Data:** 2026-08-01

## Contexto

Fotos, notas fiscais e documentos contratuais não podem ficar expostos em pasta pública.

## Decisão

Armazenar arquivos fora do diretório público, registrar metadados/hash no banco e servir download por endpoint autenticado e filtrado por tenant.

## Consequências

- o MVP usa volume local persistente;
- produção deve incluir backup e varredura antimalware;
- migração futura para objeto/S3 preservará a chave lógica e autorização.
