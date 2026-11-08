import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { ProviderSession } from "../../../packages/francestudent-client/src/server";
export interface Owner { userId: string; salt: string; hash: string }
export const defaultDataDir = () => process.env.FS_WEB_DATA_DIR || path.join(homedir(), ".francestudent-web");
export class LocalStore {
  private writes = Promise.resolve();
  constructor(readonly directory = defaultDataDir()) {}
  async read<T>(name: string): Promise<T> { return JSON.parse(await readFile(path.join(this.directory, name), "utf8")); }
  async write(name: string, value: unknown) {
    const work = async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 }); await chmod(this.directory, 0o700);
      const destination = path.join(this.directory, name), temporary = `${destination}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await rename(temporary, destination); await chmod(destination, 0o600);
    };
    this.writes = this.writes.catch(() => {}).then(work); return this.writes;
  }
  async createOwner(password: string): Promise<Owner> {
    if (password.length < 12 || password.length > 256) throw new Error("Choisissez un mot de passe local de 12 à 256 caractères.");
    const salt = randomBytes(32).toString("hex"), userId = randomUUID();
    const owner = { userId, salt, hash: scryptSync(password, salt, 64).toString("hex") };
    await this.write("owner.json", owner); return owner;
  }
  async session(): Promise<ProviderSession> {
    const value = await this.read<ProviderSession>("session.json");
    if (!value?.cookies || typeof value.cookies["next-auth.session-token"] !== "string" || !value.cookies["next-auth.session-token"]) throw new Error("Session FranceStudent absente. Lancez npm run connect dans apps/server.");
    for (const [key, cookie] of Object.entries(value.cookies)) if (!/^[\w.-]+$/.test(key) || typeof cookie !== "string" || /[\r\n;]/.test(cookie)) throw new Error("Session locale invalide.");
    if (typeof value.deviceId !== "string" || !/^[\w-]{1,100}$/.test(value.deviceId)) value.deviceId = randomUUID();
    return value;
  }
}
export function verifyPassword(owner: Owner, password: string) {
  if (password.length > 256) return false;
  const hash = Buffer.from(owner.hash, "hex");
  return hash.length === 64 && timingSafeEqual(hash, scryptSync(password, owner.salt, 64));
}
