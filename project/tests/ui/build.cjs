const esbuild=require('/home/claude/proj/node_modules/esbuild');const path=require('path');
const M='/tmp/claude-0/-home-claude/5d71bcdd-e1e4-5922-bd31-a439f24a6b2c/scratchpad/p01/ui/mocks.tsx';
esbuild.build({entryPoints:['/tmp/claude-0/-home-claude/5d71bcdd-e1e4-5922-bd31-a439f24a6b2c/scratchpad/p01/ui/entry.tsx'],bundle:true,outfile:'/tmp/claude-0/-home-claude/5d71bcdd-e1e4-5922-bd31-a439f24a6b2c/scratchpad/p01/ui/dist/app.js',jsx:'automatic',loader:{'.css':'empty'},logLevel:'warning',nodePaths:['/home/claude/proj/node_modules'],
 define:{'process.env.NODE_ENV':'"development"'},
 plugins:[{name:'mock',setup(b){
  b.onResolve({filter:/\/supabase$/},()=>({path:'/tmp/claude-0/-home-claude/5d71bcdd-e1e4-5922-bd31-a439f24a6b2c/scratchpad/p01/unit/stub.js'}));
  b.onResolve({filter:/context\/(AuthContext|OrgConfigContext|LanguageContext)$/},()=>({path:M}));
  b.onResolve({filter:/^\.\/salesInvoiceApi$/},()=>({path:M}));
  b.onResolve({filter:/^\.\.\/lib\/accountingDb$/},a=>a.importer.endsWith('SalesInvoicePage.tsx')?{path:M}:undefined);
 }}]}).catch(()=>process.exit(1));
