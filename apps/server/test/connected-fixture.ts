// Offline integration fixture only. Production main.ts has no mock/provider URL switch.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStore } from "../src/store";
import { createLocalServer } from "../src/server";
import { fixture } from "./fixture";
const provider = await fixture(); provider.delay = 1800;
const directory = await mkdtemp(path.join(tmpdir(), "fs-web-e2e-"));
const store = new LocalStore(directory); await store.createOwner("Local-e2e-password-123");
const server = await createLocalServer({ store, client: provider.client() });
server.listen(4000, "127.0.0.1", () => console.log("Connected integration fixture ready (offline, no account credentials)."));
let stopped = false;
async function stop() { if (stopped) return; stopped = true; server.closeAllConnections(); server.close(); provider.close(); await rm(directory, { recursive: true, force: true }); }
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { void stop(); });
