import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { LocalStore } from "../store";
const exec = promisify(execFile);
/** macOS Keychain, never a command-line secret argument or plaintext key file. */
export async function keychainKey(directory: string): Promise<Buffer> {
  if (process.env.FS_VAULT_KEY) {
    const key = Buffer.from(process.env.FS_VAULT_KEY, "base64");
    if (key.length !== 32)
      throw new Error("FS_VAULT_KEY doit contenir 32 octets en base64.");
    return key;
  }
  if (process.platform !== "darwin")
    throw new Error(
      "Coffre indisponible : configurer FS_VAULT_KEY côté serveur ou utiliser le Trousseau macOS.",
    );
  const account = createHash("sha256").update(directory).digest("hex");
  try {
    const { stdout } = await exec("/usr/bin/security", [
      "find-generic-password",
      "-a",
      account,
      "-s",
      "FranceStudent Web MCP",
      "-w",
    ]);
    const key = Buffer.from(stdout.trim(), "base64");
    if (key.length !== 32) throw new Error("Clé invalide");
    return key;
  } catch (e) {
    if ((e as { code?: number }).code !== 44)
      throw new Error("Impossible de déverrouiller le Trousseau macOS.");
  }
  const key = randomBytes(32);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/security", ["-q", "-i"], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    child.stderr.resume();
    child.on("error", () => reject(new Error("Trousseau macOS indisponible.")));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Enregistrement dans le Trousseau refusé.")),
    );
    child.stdin.end(
      `add-generic-password -a "${account}" -s "FranceStudent Web MCP" -w "${key.toString("base64")}"\n`,
    );
  });
  const saved = await exec("/usr/bin/security", [
    "find-generic-password",
    "-a",
    account,
    "-s",
    "FranceStudent Web MCP",
    "-w",
  ]);
  if (saved.stdout.trim() !== key.toString("base64"))
    throw new Error("La clé n’a pas été enregistrée dans le Trousseau.");
  return key;
}
export class Vault<T extends object> {
  private key?: Promise<Buffer>;
  private queue = Promise.resolve();
  constructor(
    private store: LocalStore,
    private userId: string,
    private empty: () => T,
    private loadKey = () => keychainKey(store.directory),
  ) {}
  private async cipherKey() {
    return (this.key ??= this.loadKey());
  }
  async read(): Promise<T> {
    let envelope: { iv: string; tag: string; ciphertext: string };
    try {
      envelope = await this.store.read("connectors.vault.json");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return this.empty();
      throw e;
    }
    const decrypt = createDecipheriv(
      "aes-256-gcm",
      await this.cipherKey(),
      Buffer.from(envelope.iv, "base64"),
    );
    decrypt.setAAD(Buffer.from(this.userId));
    decrypt.setAuthTag(Buffer.from(envelope.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decrypt.update(Buffer.from(envelope.ciphertext, "base64")),
        decrypt.final(),
      ]).toString("utf8"),
    );
  }
  update<R>(fn: (data: T) => R | Promise<R>): Promise<R> {
    let result: R;
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        const data = await this.read();
        result = await fn(data);
        const iv = randomBytes(12),
          cipher = createCipheriv("aes-256-gcm", await this.cipherKey(), iv);
        cipher.setAAD(Buffer.from(this.userId));
        const ciphertext = Buffer.concat([
          cipher.update(JSON.stringify(data), "utf8"),
          cipher.final(),
        ]);
        await this.store.write("connectors.vault.json", {
          v: 1,
          iv: iv.toString("base64"),
          tag: cipher.getAuthTag().toString("base64"),
          ciphertext: ciphertext.toString("base64"),
        });
      });
    this.queue = task;
    return task.then(() => result);
  }
}
