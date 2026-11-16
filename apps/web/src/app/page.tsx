import { redirect } from 'next/navigation';
import { ORCAPRO_ONLY, GESTAO_ONLY } from '@/lib/product-config';

export default function HomePage() {
  redirect(GESTAO_ONLY ? '/login?next=/gestao-contratual' : ORCAPRO_ONLY ? '/orcapro' : '/dashboard');
}
