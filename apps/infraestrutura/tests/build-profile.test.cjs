const test=require('node:test'),assert=require('node:assert/strict');
test('commercial Infraestrutura refuses OrçaPro-only and mixed API configurations before skipping its editor build',async()=>{
 const {assertInfraBuildProfile:check}=await import('../../../scripts/shared/infra-build-profile.mjs');
 assert.throws(()=>check({NEXT_PUBLIC_API_URL:'https://api.orcaproinfra.com.br/api/v1',NEXT_PUBLIC_ORCAPRO_ONLY:'true'}),/ORCAPRO_ONLY=false/);
 assert.throws(()=>check({NEXT_PUBLIC_API_URL:'https://api.orcaproinfra.com.br/api/v1',VITE_API_BASE:'https://api.gestaodepredios.com.br/api/v1',NEXT_PUBLIC_ORCAPRO_ONLY:'false'}),/origins must match/);
 for(const env of [{NEXT_PUBLIC_API_URL:'https://api.orcaproinfra.com.br/api/v1',NEXT_PUBLIC_ORCAPRO_ONLY:'false'},{NEXT_PUBLIC_API_URL:'https://api.orcaproobras.com.br/api/v1',NEXT_PUBLIC_ORCAPRO_ONLY:'true'},{NEXT_PUBLIC_API_URL:'https://api.gestaodepredios.com.br/api/v1'}])assert.doesNotThrow(()=>check(env));
});
