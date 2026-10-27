import { redirect } from 'next/navigation';
import { ORCAPRO_ONLY, INFRA_ONLY } from '@/lib/product-config';

export default function HomePage() {
  redirect(INFRA_ONLY ? '/orcapro-infraestrutura' : ORCAPRO_ONLY ? '/orcapro' : '/dashboard');
}
