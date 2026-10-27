const fs=require('node:fs'),{createRequire}=require('node:module'),{realpath}=require('node:fs/promises'),{pathToFileURL}=require('node:url'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const base='/home/u528277311/domains/api.orcaproinfra.com.br',mode=process.argv[2];
(async()=>{
 if(!['backup','imports'].includes(mode)||require('node:os').userInfo().username!=='u528277311')throw Error('Invalid operation');
 const root=await realpath(base+'/hbuilds/current/nodejs');if(!root.startsWith(base+'/hbuilds/versions/')||!root.endsWith('/nodejs'))throw Error('Wrong runtime');
 const req=createRequire(root+'/package.json'),file=base+'/hbuilds/config/.env';if(fs.statSync(file).mode&0o077)throw Error('Configuration is not private');
 const env={...process.env,...req('dotenv').parse(fs.readFileSync(file)),INFRA_ENV_FILE:file};req(root+'/apps/api/dist/config/env.validation.js').validateEnvironment(env);
 if(env.INFRA_COMMERCIAL!=='true'||env.WEB_BASE_URL!=='https://orcaproinfra.com.br'||new URL(env.DATABASE_URL).pathname!=='/u528277311_infra_auth'||new URL(env.INFRA_DATABASE_URL).pathname!=='/u528277311_infra_live')throw Error('Wrong database');
 if(mode==='backup'){
  const {runBackup}=await import(pathToFileURL(root+'/apps/api/scripts/infraestrutura-backup.mjs').href);
  const backupEnv={...env,INFRA_MYSQLDUMP_BIN:'/usr/bin/mysqldump',INFRA_BACKUP_UPLOAD_URL:'',INFRA_MYSQL_DEFAULTS_TEMP_DIR:base+'/hbuilds/ops'};
  await runBackup({...backupEnv,INFRA_BACKUP_DIR:'/home/u528277311/backups/orcaproinfra/catalog'});
  await runBackup({...backupEnv,INFRA_DATABASE_URL:env.DATABASE_URL,DATABASE_URL:env.INFRA_DATABASE_URL,INFRA_BACKUP_DIR:'/home/u528277311/backups/orcaproinfra/auth'});
 }else{
  await promisify(execFile)(process.execPath,[root+'/apps/api/scripts/infraestrutura-process-imports.mjs'],{cwd:root+'/apps/api',env,timeout:9*60*1000,maxBuffer:1024*1024});
 }
 console.log(JSON.stringify({operation:mode,completedAt:new Date().toISOString(),ok:true}));
})().catch(()=>{console.error(JSON.stringify({operation:mode,ok:false,message:'Infraestrutura operation failed; inspect the private configuration.'}));process.exitCode=1});
