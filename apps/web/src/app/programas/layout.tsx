import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Trocar programa | OrçaPro' },
  description: 'Acesse OrçaPro, OrçaPro Infraestrutura e OrçaPro Gestão Contratual.',
};

export default function ProgramsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
