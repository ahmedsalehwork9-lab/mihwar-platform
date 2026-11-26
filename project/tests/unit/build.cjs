const esbuild=require('/home/claude/proj/node_modules/esbuild');
esbuild.build({entryPoints:['/tmp/claude-0/-home-claude/5d71bcdd-e1e4-5922-bd31-a439f24a6b2c/scratchpad/p01/unit/calc.test.ts'],bundle:true,platform:'node',format:'cjs',outfile:'/tmp/claude-0/-home-claude/5d71bcdd-e1e4-5922-bd31-a439f24a6b2c/scratchpad/p01/unit/calc.test.cjs',logLevel:'warning',
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/\/supabase$/},()=>({path:'/tmp/claude-0/-home-claude/5d71bcdd-e1e4-5922-bd31-a439f24a6b2c/scratchpad/p01/unit/stub.js'}));}}]}).catch(()=>process.exit(1));
