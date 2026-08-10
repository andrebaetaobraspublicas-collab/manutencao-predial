import path from 'node:path';
import { resolveUploadRoot, sanitizeUploadOriginalName } from './upload-storage';

describe('upload storage', () => {
  it('recupera nomes UTF-8 interpretados como latin1 pelo multipart', () => {
    expect(sanitizeUploadOriginalName('instalaÃ§Ãµes elÃ©tricas.png')).toBe(
      'instalações elétricas.png',
    );
    expect(sanitizeUploadOriginalName('ESTUDO_TÃ‰CNICO_PRELIMINAR.pdf')).toBe(
      'ESTUDO_TÉCNICO_PRELIMINAR.pdf',
    );
    expect(sanitizeUploadOriginalName('instalaÃƒÂ§ÃƒÂµes elÃƒÂ©tricas.png')).toBe(
      'instalações elétricas.png',
    );
    expect(
      sanitizeUploadOriginalName(
        'ESTUDO_TÃ\u0089CNICO_PRELIMINARâ\u0080\u0093EUCLIDES_BEZERRA_PARANÃ\u0083_ATUALIZADO.pdf',
      ),
    ).toBe('ESTUDO_TÉCNICO_PRELIMINAR–EUCLIDES_BEZERRA_PARANÃ_ATUALIZADO.pdf');
  });

  it('preserva nomes UTF-8 que já estão corretos e remove caminhos', () => {
    expect(sanitizeUploadOriginalName('../Laudo de inspeção.pdf')).toBe(
      'Laudo de inspeção.pdf',
    );
  });

  it('usa armazenamento persistente fora de builds da Hostinger', () => {
    const cwd = path.join(
      path.parse(process.cwd()).root,
      'home',
      'user',
      'domains',
      'api.gestaodepredios.com.br',
      '.builds',
      'current',
      'nodejs',
      'apps',
      'api',
    );
    expect(resolveUploadRoot('./uploads', cwd)).toBe(
      path.join(
        path.parse(cwd).root,
        'home',
        'user',
        'domains',
        'api.gestaodepredios.com.br',
        'storage',
        'uploads',
      ),
    );
  });
});
