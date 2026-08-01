import type { Metadata } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Gestão de Prédios',
    template: '%s | Gestão de Prédios',
  },
  description: 'Gestão integrada de manutenção predial, contratos e ordens de serviço.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
