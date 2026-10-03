import { Building2, Calculator } from 'lucide-react';
import { ORCAPRO_ONLY, PRODUCT_NAME } from '@/lib/product-config';

export function AuthBrand() {
  return <div className="auth-brand">{ORCAPRO_ONLY ? <Calculator size={24} /> : <Building2 size={24} />}{PRODUCT_NAME}</div>;
}
