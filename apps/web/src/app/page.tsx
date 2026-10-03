import { redirect } from 'next/navigation';
import { ORCAPRO_ONLY } from '@/lib/product-config';

export default function HomePage() {
  redirect(ORCAPRO_ONLY ? '/orcapro' : '/dashboard');
}
