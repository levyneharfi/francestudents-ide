import { cp, mkdir, rm } from 'node:fs/promises';
const output = new URL('../../../out/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('../out/', import.meta.url), output, { recursive: true });
