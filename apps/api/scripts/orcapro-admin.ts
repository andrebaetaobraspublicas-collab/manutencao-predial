import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';

// Read-only bootstrap: resolve an existing account without changing passwords or maintenance roles.
async function main() {
  const email = process.argv.find(a => a.startsWith('--email='))?.slice(8);
  if (!email) throw new Error('Use --email=<email autorizado já existente>.');
  const prisma = new PrismaService();
  try {
    const user = await prisma.user.findFirst({ where: { email, status: 'ACTIVE', deletedAt: null }, select: { id: true, email: true } });
    if (!user) throw new Error('Conta ativa não encontrada. Convide/verifique a conta pelo fluxo seguro existente; não crie senha hardcoded.');
    console.log(JSON.stringify({ userId: user.id, setting: 'ORCAPRO_ADMIN_USER_IDS', value: user.id, maintenanceChanged: false, instruction: 'Acrescente o UUID à configuração server-side do OrçaPro; ORCAPRO_ENABLED permanece false até homologação.' }));
  } finally { await prisma.$disconnect(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Não foi possível resolver a conta.'); process.exitCode = 1; });
