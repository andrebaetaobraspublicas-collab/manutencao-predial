export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: 'detalhe' }];
}

export default function WorkOrderDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
