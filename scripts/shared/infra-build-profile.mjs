// Fail before retaining a stale Infraestrutura bundle in a commercial release.
export function assertInfraBuildProfile(env) {
  const bases=[env.NEXT_PUBLIC_API_URL,env.NEXT_PUBLIC_API_BASE,env.VITE_API_BASE].filter(Boolean);
  const commercial=bases.some(base=>new URL(base).hostname==='api.orcaproinfra.com.br');
  if(commercial&&env.NEXT_PUBLIC_ORCAPRO_ONLY==='true')throw new Error('Infraestrutura production requires NEXT_PUBLIC_ORCAPRO_ONLY=false; the OrçaPro-only profile blocks its editor and skips its bundle.');
  if(commercial&&bases.some(base=>new URL(base).hostname!=='api.orcaproinfra.com.br'))throw new Error('Infraestrutura production API origins must match.');
}
