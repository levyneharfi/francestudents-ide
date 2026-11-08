import { cp, mkdir, rm } from 'node:fs/promises';
if (process.env.NEXT_PUBLIC_FS_CONNECTED === 'true') { console.log('Mode serveur local : aucun export statique.'); process.exit(0); }
const output = new URL('../../../out/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('../out/', import.meta.url), output, { recursive: true });
