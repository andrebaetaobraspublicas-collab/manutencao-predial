import type { ReactNode } from 'react';
export const metadata={icons:{icon:'/orcapro-brand/icon.svg?v=20261006-dev1'}};
export default function OrcaProLayout({children}:{children:ReactNode}) {
  return <div className="orcapro-brand-scope">{children}</div>;
}
