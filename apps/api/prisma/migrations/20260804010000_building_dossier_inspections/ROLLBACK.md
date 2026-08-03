# Rollback da v0.15.0

Esta migration é aditiva: cria apenas as tabelas `BuildingInspection` e
`BuildingAttachment`. O rollback operacional preferencial é republicar a
v0.14.0 e manter as tabelas no banco. A aplicação anterior simplesmente as
ignora e nenhum dado patrimonial precisa ser descartado.

Não remova as tabelas depois que houver laudos, documentos, fotografias ou
vistorias reais. Antes de qualquer reversão destrutiva, exporte os registros e
preserve os arquivos privados apontados por `storageKey` conforme a política de
retenção.

Somente em ambiente descartável, sem dados úteis, a reversão estrutural pode
ser executada nesta ordem:

```sql
DROP TABLE `BuildingAttachment`;
DROP TABLE `BuildingInspection`;
```

Os comandos SQL não removem os arquivos físicos do diretório privado de
uploads. A limpeza desses arquivos deve ser feita separadamente, por chaves
explicitamente conferidas, nunca por exclusão recursiva de um diretório amplo.
