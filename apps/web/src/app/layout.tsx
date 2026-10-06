import type { Metadata } from 'next';
import { ORCAPRO_ONLY, PRODUCT_NAME } from '@/lib/product-config';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  ...(ORCAPRO_ONLY ? { icons: { icon: '/orcapro-brand/icon.svg?v=20261006-auth3' } } : {}),
  title: {
    default: PRODUCT_NAME,
    template: `%s | ${PRODUCT_NAME}`,
  },
  description: ORCAPRO_ONLY ? 'Orçamentos de obras com SINAPI, BDI, planejamento e análise de riscos.' : 'Gestão integrada de manutenção predial, contratos e ordens de serviço.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      {ORCAPRO_ONLY ? <head>
        <link rel="stylesheet" href="/orcapro-brand/react-palette.css?v=20261006-auth3" precedence="orcapro-palette" />
        <link rel="stylesheet" href="/orcapro-brand/production.css?v=20261006-auth3" precedence="orcapro-brand" />
      </head> : <head><link rel="stylesheet" href="/orcapro-brand/development.css?v=20261006-dev1" precedence="orcapro-development" /></head>}
      <body>{children}</body>
    </html>
  );
}
