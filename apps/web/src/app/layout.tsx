import type { Metadata } from 'next';
import { ORCAPRO_ONLY, PRODUCT_NAME } from '@/lib/product-config';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: PRODUCT_NAME,
    template: `%s | ${PRODUCT_NAME}`,
  },
  description: ORCAPRO_ONLY ? 'Orçamentos de obras com SINAPI, BDI, planejamento e análise de riscos.' : 'Gestão integrada de manutenção predial, contratos e ordens de serviço.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
