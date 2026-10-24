import Link from 'next/link';
export default function InfraRegistration() {
  return <main className="login-panel"><h1>Acesso ao OrçaPro Infraestrutura</h1><p>Nesta etapa, solicite seu cadastro ao administrador do sistema.</p><Link href="/login?next=/orcapro-infraestrutura">Entrar no sistema</Link></main>;
}
