import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  apps,
  appById,
  configured,
  oauthConfig,
  type AppDefinition,
} from "./catalog";
import { OfficeAdapter, officeTools, type ToolDefinition } from "./office";
import { ConnectorError, tokenRequest } from "./http";
import { Vault } from "./vault";
import type { LocalStore } from "../store";
import type {
  ReplySource,
  ToolCall,
  ToolOperation,
} from "../../../../packages/francestudent-client/src/replies";
import { safeURL } from "../../../../packages/francestudent-client/src/replies";
interface Connection {
  appId: string;
  accountId: string;
  userId: string;
  tokens?: OAuthTokens;
  expiresAt?: number;
  revision?: number;
  client?: OAuthClientInformationMixed;
  tools?: Tool[];
  status: "connected" | "reconnect";
}
interface StoredOperation extends ToolOperation {
  userId: string;
  accountId: string;
  result?: unknown;
  sources?: ReplySource[];
  createdAt: number;
  executionId?: string;
}
export interface ConnectorConfig {
  clientId: string;
  clientSecret: string;
}
interface Data {
  config?: Record<string, ConnectorConfig>;
  connections: Record<string, Connection>;
  operations: Record<string, StoredOperation>;
}
interface PendingOAuth {
  appId: string;
  session: string;
  verifier: string;
  expires: number;
  client?: OAuthClientInformationMixed;
  url?: string;
}
export interface OperationResult {
  operation: ToolOperation;
  result?: unknown;
  sources: ReplySource[];
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const publicOperation = (o: StoredOperation): ToolOperation => ({
  id: o.id,
  appId: o.appId,
  tool: o.tool,
  arguments: o.arguments,
  status: o.status,
  title: o.title,
  summary: o.summary,
  conversationId: o.conversationId,
});
const readonlyRemote = new Set([
  "github:get_me",
  "github:get_file_contents",
  "github:list_branches",
  "github:list_commits",
  "github:search_code",
  "github:search_repositories",
  "github:search_issues",
  "github:search_pull_requests",
  "github:issue_read",
  "github:pull_request_read",
  "notion:notion-search",
  "notion:notion-fetch",
  "notion:search",
  "notion:fetch",
  "notion:API-post-search",
  "notion:API-retrieve-a-page",
  "notion:API-retrieve-a-block",
  "notion:API-get-block-children",
  "linear:list_issues",
  "linear:get_issue",
  "linear:list_projects",
  "linear:get_project",
  "linear:list_teams",
  "linear:get_team",
  "linear:list_comments",
  "linear:list_documents",
  "linear:get_document",
  "linear:list_users",
  "linear:get_user",
  "slack:slack_search_messages",
  "slack:slack_search_all",
  "slack:slack_read_channel",
  "slack:slack_read_thread",
  "slack:slack_search_channels",
  "slack:slack_search_users",
]);
/** Unknown remote tools always require approval, regardless of server-supplied annotations. */
export class ConnectorManager {
  private vault: Vault<Data>;
  private pending = new Map<string, PendingOAuth>();
  private refreshes = new Map<string, Promise<string>>();
  private outcomes = new Map<string, "pending" | "failed" | "connected">();
  private oauthLock = new Set<string>();
  private initializing?: Promise<void>;
  private adapter: OfficeAdapter;
  constructor(
    private store: LocalStore,
    readonly userId: string,
    private options: {
      fetch?: typeof fetch;
      key?: () => Promise<Buffer>;
      callbackOrigin?: string;
      sessionActive?: (id: string) => boolean;
    } = {},
  ) {
    this.vault = new Vault(
      store,
      userId,
      () => ({ connections: {}, operations: {} }),
      options.key,
    );
    this.adapter = new OfficeAdapter(options.fetch);
  }
  private async data() {
    this.initializing ??= (async () => {
      const data = await this.vault.read();
      for (const [family, config] of Object.entries(data.config || {})) {
        if (
          ![
            "google",
            "microsoft",
            "github",
            "slack",
            "notion",
            "linear",
          ].includes(family)
        )
          continue;
        process.env[`FS_${family.toUpperCase()}_CLIENT_ID`] ||= config.clientId;
        process.env[`FS_${family.toUpperCase()}_CLIENT_SECRET`] ||=
          config.clientSecret;
      }
      if (Object.values(data.operations).some((o) => o.status === "running"))
        await this.vault.update((d) => {
          for (const o of Object.values(d.operations))
            if (o.status === "running") {
              o.status = "uncertain";
              o.summary =
                "Le serveur a redémarré pendant l’exécution. Vérifiez l’application ; aucune relance automatique.";
            }
        });
    })();
    await this.initializing;
    return this.vault.read();
  }
  async configure(family: string, config: ConnectorConfig) {
    if (
      !["google", "microsoft", "github", "slack", "notion", "linear"].includes(
        family,
      ) ||
      !config.clientId ||
      !config.clientSecret ||
      config.clientId.length > 2000 ||
      config.clientSecret.length > 4000 ||
      /[\r\n]/.test(config.clientId + config.clientSecret)
    )
      throw new ConnectorError(
        "CONFIG_INVALID",
        "Configuration OAuth invalide.",
      );
    await this.vault.update((d) => {
      d.config ||= {};
      d.config[family] = config;
    });
  }
  callback(app: AppDefinition) {
    return `${this.options.callbackOrigin || "http://localhost:4000"}/api/connectors/oauth/callback/${app.family}`;
  }
  async catalog() {
    const data = await this.data();
    return apps.map((app) => ({
      id: app.id,
      name: app.name,
      description: app.description,
      category: app.category,
      permissions: app.permissions,
      configured: configured(app),
      oauthStatus: this.outcomes.get(app.id),
      status: data.connections[app.id]?.status || "disconnected",
      callback: this.callback(app),
      revision: data.connections[app.id]?.revision,
      toolCount:
        data.connections[app.id]?.tools?.length ||
        (["google", "microsoft"].includes(app.family)
          ? officeTools(app).length
          : 0),
    }));
  }
  private async remoteProvider(
    app: AppDefinition,
    pending?: PendingOAuth,
    state?: string,
  ): Promise<OAuthClientProvider> {
    const connection = (await this.data()).connections[app.id];
    const config = oauthConfig(app);
    const save = async (fn: (c: Connection) => void) =>
      this.vault.update((d) => {
        const c = (d.connections[app.id] ||= {
          appId: app.id,
          userId: this.userId,
          accountId: randomUUID(),
          status: "reconnect",
        });
        fn(c);
      });
    return {
      redirectUrl: this.callback(app),
      clientMetadata: {
        client_name: "FranceStudent Web personnel",
        redirect_uris: [this.callback(app)],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: config.clientSecret
          ? "client_secret_post"
          : "none",
        ...(app.scopes.length ? { scope: app.scopes.join(" ") } : {}),
      },
      state: () => state || "",
      clientInformation: async () =>
        pending?.client ||
        (await this.data()).connections[app.id]?.client ||
        (config.clientId
          ? { client_id: config.clientId, client_secret: config.clientSecret }
          : undefined),
      saveClientInformation: async (c) => {
        if (pending) pending.client = c;
        await save((cn) => {
          cn.client = c;
        });
      },
      tokens: async () => {
        const c = (await this.data()).connections[app.id];
        return c?.tokens
          ? {
              ...c.tokens,
              expires_in: c.expiresAt
                ? Math.max(0, Math.floor((c.expiresAt - Date.now()) / 1000))
                : undefined,
            }
          : undefined;
      },
      saveTokens: async (t) => {
        await save((c) => {
          c.tokens = t;
          c.expiresAt = t.expires_in
            ? Date.now() + t.expires_in * 1000
            : undefined;
          c.status = "connected";
          c.revision = Date.now();
        });
      },
      redirectToAuthorization: (url) => {
        if (!pending)
          throw new ConnectorError(
            "RECONNECT",
            "Reconnectez cette application.",
          );
        if (!app.hosts?.includes(url.hostname) || url.protocol !== "https:")
          throw new ConnectorError("HOST_DENIED", "Serveur OAuth non reconnu.");
        pending.url = url.href;
      },
      saveCodeVerifier: (v) => {
        if (!pending)
          throw new ConnectorError(
            "RECONNECT",
            "Reconnectez cette application.",
          );
        pending.verifier = v;
      },
      codeVerifier: () => {
        if (!pending?.verifier)
          throw new ConnectorError("OAUTH_STATE", "Connexion OAuth expirée.");
        return pending.verifier;
      },
      invalidateCredentials: async (scope) => {
        await save((c) => {
          if (scope === "all" || scope === "tokens") {
            delete c.tokens;
            c.status = "reconnect";
          }
          if (scope === "all" || scope === "client") delete c.client;
        });
      },
    };
  }
  private remoteFetch(app: AppDefinition): typeof fetch {
    return async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      if (
        url.protocol !== "https:" ||
        !app.hosts?.includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw new ConnectorError(
          "HOST_DENIED",
          "Destination MCP non autorisée.",
        );
      return (this.options.fetch || fetch)(input, {
        ...init,
        redirect: "error",
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(45000)])
          : AbortSignal.timeout(45000),
      });
    };
  }
  async start(appId: string, session: string) {
    await this.data();
    const app = appById(appId);
    if (!configured(app))
      throw new ConnectorError(
        "CONFIG_REQUIRED",
        "Cette application doit être configurée par l’administrateur. Consultez le guide OAuth local.",
      );
    for (const [key, p] of this.pending)
      if (
        p.expires < Date.now() ||
        (p.session === session && p.appId === appId)
      )
        this.pending.delete(key);
    if (this.pending.size >= 20)
      throw new ConnectorError("OAUTH_LIMIT", "Trop de connexions en attente.");
    // Acquire the vault before opening a browser so a missing key cannot produce a false connection.
    await this.vault.update(() => {});
    const state = randomBytes(32).toString("base64url");
    const pending: PendingOAuth = {
      appId,
      session,
      verifier: randomBytes(32).toString("base64url"),
      expires: Date.now() + 600000,
    };
    this.pending.set(state, pending);
    this.outcomes.set(appId, "pending");
    try {
      if (app.remote) {
        const provider = await this.remoteProvider(app, pending, state);
        const transport = new StreamableHTTPClientTransport(
          new URL(app.remote),
          { authProvider: provider, fetch: this.remoteFetch(app) },
        );
        const client = new Client({
          name: "francestudent-web",
          version: "0.3.0",
        });
        try {
          await client.connect(transport);
          if (!pending.url) {
            await this.discover(appId);
            this.pending.delete(state);
            this.outcomes.set(appId, "connected");
            return { connected: true };
          }
        } catch (e) {
          if (!pending.url) throw e;
        } finally {
          await client.close().catch(() => {});
        }
        return { authorizationUrl: pending.url };
      }
      const c = oauthConfig(app);
      const url = new URL(
        app.family === "google"
          ? "https://accounts.google.com/o/oauth2/v2/auth"
          : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      );
      const values = {
        client_id: c.clientId!,
        redirect_uri: this.callback(app),
        response_type: "code",
        scope: app.scopes.join(" "),
        state,
        code_challenge: hashPKCE(pending.verifier),
        code_challenge_method: "S256",
        ...(app.family === "google"
          ? { access_type: "offline", prompt: "consent" }
          : { response_mode: "query" }),
      };
      for (const [k, v] of Object.entries(values)) url.searchParams.set(k, v);
      return { authorizationUrl: url.href };
    } catch {
      this.pending.delete(state);
      this.outcomes.set(appId, "failed");
      throw new ConnectorError(
        "OAUTH_START",
        "Connexion impossible. Vérifiez la configuration OAuth, le coffre et l’accès réseau du serveur.",
      );
    }
  }
  async complete(
    family: string,
    state: string,
    code?: string,
    denied?: string,
  ) {
    const pending = this.pending.get(state);
    this.pending.delete(state); // Consumed before any network request.
    if (
      !pending ||
      pending.expires < Date.now() ||
      appById(pending.appId).family !== family ||
      (this.options.sessionActive &&
        !this.options.sessionActive(pending.session))
    ) {
      if (pending) this.outcomes.set(pending.appId, "failed");
      throw new ConnectorError(
        "OAUTH_STATE",
        "Connexion expirée ou déjà utilisée. Recommencez depuis Applications.",
      );
    }
    if (denied || !code || code.length > 4096) {
      this.outcomes.set(pending.appId, "failed");
      throw new ConnectorError(
        "OAUTH_DENIED",
        "Autorisation refusée. Aucun accès n’a été accordé.",
      );
    }
    const app = appById(pending.appId);
    if (this.oauthLock.has(app.id))
      throw new ConnectorError(
        "OAUTH_BUSY",
        "Une connexion est déjà en cours.",
      );
    this.oauthLock.add(app.id);
    try {
      if (app.remote) {
        await this.vault.update((d) => {
          const old = d.connections[app.id];
          d.connections[app.id] = {
            ...old,
            appId: app.id,
            userId: this.userId,
            accountId: randomUUID(),
            status: "reconnect",
            tokens: undefined,
          };
        });
        const authProvider = await this.remoteProvider(app, pending, state);
        const transport = new StreamableHTTPClientTransport(
          new URL(app.remote),
          { authProvider, fetch: this.remoteFetch(app) },
        );
        await transport.finishAuth(code);
        await transport.close();
        await this.discover(app.id);
        this.outcomes.set(app.id, "connected");
        return;
      }
      const config = oauthConfig(app);
      const t = await tokenRequest(
        tokenURL(app),
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.clientId!,
          client_secret: config.clientSecret!,
          code,
          code_verifier: pending.verifier,
          redirect_uri: this.callback(app),
        }),
        this.options.fetch,
      );
      await this.vault.update((d) => {
        d.connections[app.id] = {
          appId: app.id,
          userId: this.userId,
          accountId: randomUUID(),
          tokens: t,
          expiresAt: Date.now() + (t.expires_in || 3600) * 1000,
          status: "connected",
          revision: Date.now(),
        };
      });
      this.outcomes.set(app.id, "connected");
    } catch (e) {
      this.outcomes.set(app.id, "failed");
      throw e;
    } finally {
      this.oauthLock.delete(app.id);
    }
  }
  cancel(appId: string, session: string) {
    appById(appId);
    for (const [state, p] of this.pending)
      if (p.appId === appId && p.session === session)
        this.pending.delete(state);
    this.outcomes.delete(appId);
    return { cancelled: true };
  }
  async disconnect(appId: string) {
    const app = appById(appId);
    const c = (await this.data()).connections[app.id];
    for (const [state, p] of this.pending)
      if (p.appId === appId) this.pending.delete(state);
    // Revoke Google token at the provider; Microsoft/remote providers also offer their account permission page.
    let revoked = false;
    if (c?.tokens && app.family === "google") {
      try {
        const r = await (this.options.fetch || fetch)(
          "https://oauth2.googleapis.com/revoke",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              token: c.tokens.refresh_token || c.tokens.access_token,
            }),
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          },
        );
        revoked = r.ok;
      } catch {}
    }
    await this.vault.update((d) => {
      delete d.connections[app.id];
      for (const o of Object.values(d.operations))
        if (o.appId === app.id && o.status === "pending") {
          o.status = "rejected";
          o.summary = "Application déconnectée.";
        }
    });
    return {
      disconnected: true,
      providerRevoked: revoked,
      notice: revoked
        ? "Accès révoqué chez Google et supprimé localement."
        : "Accès supprimé localement. Vous pouvez aussi révoquer FranceStudent Web dans les applications autorisées de votre compte externe.",
    };
  }
  private async access(app: AppDefinition): Promise<string> {
    const existing = this.refreshes.get(app.id);
    if (existing) return existing;
    const refresh = (async () => {
      const c = (await this.data()).connections[app.id];
      if (!c?.tokens || c.status !== "connected")
        throw new ConnectorError(
          "RECONNECT",
          "Connectez ou reconnectez cette application.",
        );
      if (!c.expiresAt || c.expiresAt > Date.now() + 60000)
        return c.tokens.access_token;
      if (!c.tokens.refresh_token)
        throw new ConnectorError(
          "RECONNECT",
          "Autorisation expirée. Reconnectez cette application.",
        );
      try {
        const config = oauthConfig(app);
        const t = await tokenRequest(
          tokenURL(app),
          new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: c.tokens.refresh_token,
            client_id: config.clientId!,
            client_secret: config.clientSecret!,
          }),
          this.options.fetch,
        );
        await this.vault.update((d) => {
          const current = d.connections[app.id];
          if (!current || current.accountId !== c.accountId)
            throw new ConnectorError(
              "RECONNECT",
              "Compte déconnecté pendant le renouvellement.",
            );
          current.tokens = { ...c.tokens, ...t };
          current.expiresAt = Date.now() + (t.expires_in || 3600) * 1000;
        });
        return t.access_token;
      } catch (e) {
        await this.vault.update((d) => {
          if (d.connections[app.id]?.accountId === c.accountId)
            d.connections[app.id].status = "reconnect";
        });
        throw e;
      }
    })();
    this.refreshes.set(app.id, refresh);
    try {
      return await refresh;
    } finally {
      this.refreshes.delete(app.id);
    }
  }
  async discover(appId: string) {
    const app = appById(appId);
    if (!app.remote)
      return officeTools(app).map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: z.toJSONSchema(t.schema, { unrepresentable: "any" }),
        annotations: { readOnlyHint: t.readOnly },
      }));
    const client = new Client({ name: "francestudent-web", version: "0.3.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(app.remote), {
          authProvider: await this.remoteProvider(app),
          fetch: this.remoteFetch(app),
        }),
      );
      const tools: Tool[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : {});
        tools.push(...page.tools);
        cursor = page.nextCursor;
        if (tools.length > 300)
          throw new ConnectorError(
            "TOOL_LIMIT",
            "Catalogue MCP trop volumineux.",
          );
      } while (cursor);
      await this.vault.update((d) => {
        const c = d.connections[app.id];
        if (c) {
          c.tools = tools;
          c.status = "connected";
        }
      });
      return tools;
    } finally {
      await client.close().catch(() => {});
    }
  }
  async availableTools() {
    const data = await this.data();
    const result: {
      appId: string;
      name: string;
      title: string;
      description: string;
      readOnly: boolean;
      inputSchema: unknown;
    }[] = [];
    for (const app of apps) {
      const c = data.connections[app.id];
      if (c?.status !== "connected") continue;
      if (app.remote) {
        for (const t of c.tools || [])
          result.push({
            appId: app.id,
            name: t.name,
            title: t.title || t.name,
            description: t.description || "",
            readOnly: readonlyRemote.has(`${app.id}:${t.name}`),
            inputSchema: t.inputSchema,
          });
      } else
        for (const t of officeTools(app))
          result.push({
            appId: app.id,
            name: t.name,
            title: t.title,
            description: t.description,
            readOnly: t.readOnly,
            inputSchema: z.toJSONSchema(t.schema, { unrepresentable: "any" }),
          });
    }
    return result;
  }
  async modelTools() {
    const tools = await this.availableTools();
    const remoteIds = [
      ...new Set(
        tools.filter((t) => appById(t.appId).remote).map((t) => t.appId),
      ),
    ];
    return [
      ...tools.filter((t) => !appById(t.appId).remote),
      ...remoteIds.map((appId) => ({
        appId,
        name: "describe_tools",
        title: `Trouver les outils ${appById(appId).name}`,
        description:
          "Rechercher les outils disponibles et obtenir leurs schémas avant un appel. query en mots-clés anglais, ou names pour des noms exacts ; huit résultats maximum.",
        readOnly: true,
        inputSchema: z.toJSONSchema(describeSchema),
      })),
    ];
  }
  async operations(conversationId?: string) {
    return Object.values((await this.data()).operations)
      .filter(
        (o) =>
          o.userId === this.userId &&
          (!conversationId || o.conversationId === conversationId),
      )
      .map(publicOperation);
  }
  async propose(
    call: ToolCall,
    conversationId: string,
    signal: AbortSignal,
  ): Promise<OperationResult> {
    const app = appById(call.appId);
    const c = (await this.data()).connections[app.id];
    if (!c || c.status !== "connected")
      throw new ConnectorError("RECONNECT", "Application non connectée.");
    const tool =
      call.tool === "describe_tools"
        ? {
            title: "Consulter les outils disponibles",
            readOnly: true,
            inputSchema: z.toJSONSchema(describeSchema),
          }
        : (await this.availableTools()).find(
            (t) => t.appId === call.appId && t.name === call.tool,
          );
    if (!tool) throw new ConnectorError("TOOL_UNKNOWN", "Outil indisponible.");
    if (call.tool === "describe_tools") {
      if (!describeSchema.safeParse(call.arguments).success)
        throw new ConnectorError(
          "ARGUMENTS_INVALID",
          "Recherche d’outils invalide.",
        );
    } else if (!app.remote) {
      const d = officeTools(app).find((t) => t.name === call.tool)!;
      if (!d.schema.safeParse(call.arguments).success)
        throw new ConnectorError(
          "ARGUMENTS_INVALID",
          "Paramètres d’outil invalides.",
        );
    } else {
      // Validate remote JSON schemas with the SDK's validator in callTool before execution; size is bounded at the framing layer.
      const { AjvJsonSchemaValidator } = await import(
        "@modelcontextprotocol/sdk/validation/ajv"
      );
      const validator = new AjvJsonSchemaValidator().getValidator(
        tool.inputSchema as Record<string, unknown>,
      );
      if (!validator(call.arguments).valid)
        throw new ConnectorError(
          "ARGUMENTS_INVALID",
          "Paramètres MCP invalides.",
        );
    }
    const operation: StoredOperation = {
      id: randomUUID(),
      userId: this.userId,
      accountId: c.accountId,
      conversationId,
      appId: call.appId,
      tool: call.tool,
      arguments: clone(call.arguments),
      title: tool.title,
      status: tool.readOnly ? "running" : "pending",
      createdAt: Date.now(),
    };
    await this.vault.update((d) => {
      const current = d.connections[app.id];
      if (!current || current.accountId !== c.accountId)
        throw new ConnectorError("RECONNECT", "Compte modifié.");
      d.operations[operation.id] = operation;
    });
    return tool.readOnly
      ? this.execute(operation, signal)
      : { operation: publicOperation(operation), sources: [] };
  }
  async decide(
    id: string,
    approved: boolean,
    signal: AbortSignal,
  ): Promise<OperationResult> {
    await this.data(); // Recover persisted running operations before considering any repeated approval.
    let operation: StoredOperation | undefined;
    await this.vault.update((d) => {
      const o = d.operations[id];
      if (!o || o.userId !== this.userId)
        throw new ConnectorError("OPERATION_UNKNOWN", "Action introuvable.");
      if (o.status !== "pending") {
        operation = clone(o);
        return;
      }
      const c = d.connections[o.appId];
      if (!c || c.accountId !== o.accountId || c.status !== "connected")
        throw new ConnectorError(
          "RECONNECT",
          "Le compte externe a changé. Demandez une nouvelle action.",
        );
      if (Date.now() - o.createdAt > 86400000)
        throw new ConnectorError(
          "OPERATION_EXPIRED",
          "Cette proposition a expiré. Demandez une nouvelle action.",
        );
      o.status = approved ? "running" : "rejected";
      o.summary = approved ? undefined : "Action refusée par l’utilisateur.";
      if (approved) o.executionId = randomUUID();
      operation = clone(o);
    });
    if (!operation)
      throw new ConnectorError("OPERATION_UNKNOWN", "Action introuvable.");
    // Only the transition above owns this execution; a second caller never executes it.
    if (operation.status === "running" && operation.executionId) {
      const claimed = operation.executionId;
      let own = false;
      await this.vault.update((d) => {
        const o = d.operations[id];
        if (o.executionId === claimed) {
          delete o.executionId;
          own = true;
        }
      });
      if (own) return this.execute(operation, signal);
    }
    return {
      operation: publicOperation(operation),
      result: operation.result,
      sources: operation.sources || [],
    };
  }
  private async officeCall(
    app: AppDefinition,
    definition: ToolDefinition,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) {
    const server = new Server(
      { name: `francestudent-${app.id}`, version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: definition.name,
          description: definition.description,
          inputSchema: z.toJSONSchema(definition.schema, {
            unrepresentable: "any",
          }) as Tool["inputSchema"],
        },
      ],
    }));
    let payload: unknown;
    let executionError: unknown;
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== definition.name)
        throw new Error("Outil refusé");
      const args = definition.schema.parse(request.params.arguments || {});
      try {
        payload = await this.adapter.execute(
          app,
          definition.name,
          args,
          await this.access(app),
          signal,
        );
      } catch (e) {
        executionError = e;
        throw e;
      }
      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    });
    const client = new Client({ name: "francestudent-web", version: "0.3.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);
      await client.connect(a);
      const result = await client.callTool(
        { name: definition.name, arguments: args },
        undefined,
        { signal, timeout: 60000 },
      );
      if (result.isError)
        throw (
          executionError ||
          new ConnectorError(
            "TOOL_FAILED",
            "L’outil bureautique a échoué.",
            !definition.readOnly,
          )
        );
      return payload as {
        result: unknown;
        sources: { label: string; url: string }[];
      };
    } finally {
      await client.close();
      await server.close();
    }
  }
  private async execute(
    o: StoredOperation,
    signal: AbortSignal,
  ): Promise<OperationResult> {
    const app = appById(o.appId);
    let result: unknown,
      sources: ReplySource[] = [];
    try {
      signal.throwIfAborted();
      const c = (await this.data()).connections[app.id];
      if (!c || c.accountId !== o.accountId)
        throw new ConnectorError("RECONNECT", "Le compte externe a changé.");
      if (o.tool === "describe_tools") {
        const a = describeSchema.parse(o.arguments);
        const tools = (await this.availableTools()).filter(
          (t) => t.appId === app.id,
        );
        const terms = (a.query || "")
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);
        result = tools
          .filter((t) =>
            a.names?.length
              ? a.names.includes(t.name)
              : !terms.length ||
                terms.some((term) =>
                  `${t.name} ${t.title} ${t.description}`
                    .toLowerCase()
                    .includes(term),
                ),
          )
          .slice(0, 8);
      } else if (app.remote) {
        const client = new Client({
          name: "francestudent-web",
          version: "0.3.0",
        });
        try {
          await client.connect(
            new StreamableHTTPClientTransport(new URL(app.remote), {
              authProvider: await this.remoteProvider(app),
              fetch: this.remoteFetch(app),
            }),
          );
          result = await client.callTool(
            { name: o.tool, arguments: o.arguments },
            undefined,
            { signal, timeout: 60000 },
          );
          if ((result as { isError?: boolean })?.isError)
            throw new ConnectorError(
              "TOOL_FAILED",
              "Le serveur MCP a signalé un échec.",
            );
        } finally {
          await client.close().catch(() => {});
        }
      } else {
        const payload = await this.officeCall(
          app,
          officeTools(app).find((t) => t.name === o.tool)!,
          o.arguments,
          signal,
        );
        result = payload.result;
        sources = payload.sources
          .filter((s) => safeURL(s.url) && typeof s.label === "string")
          .slice(0, 30)
          .map((s) => ({
            id: randomUUID(),
            label: s.label.slice(0, 200),
            url: s.url,
          }));
      }
      // A remote tool result is data, never a channel for returning stored OAuth credentials.
      const credentials = [
        c.tokens?.access_token,
        c.tokens?.refresh_token,
        c.client?.client_secret,
        oauthConfig(app).clientSecret,
      ].filter((v): v is string => typeof v === "string" && v.length >= 4);
      const sanitized = JSON.stringify(result, (_key, value: unknown) => {
        if (typeof value !== "string") return value;
        for (const secret of credentials) {
          value = (value as string).replaceAll(secret, "[secret masqué]").replaceAll(encodeURIComponent(secret), "[secret masqué]");
        }
        return value;
      });
      if (sanitized) result = JSON.parse(sanitized);
      if (app.remote) {
        const domains =
          app.id === "github"
            ? ["github.com"]
            : app.id === "notion"
              ? ["notion.so", "notion.com", "notion.site"]
              : app.id === "linear"
                ? ["linear.app"]
                : ["slack.com"];
        const urls = [
          ...new Set(
            (sanitized || "").match(/https:\/\/[^\s<>"'\\)\]]+/g) || [],
          ),
        ];
        sources = urls
          .filter(
            (url) =>
              safeURL(url) &&
              domains.some(
                (domain) =>
                  new URL(url).hostname === domain ||
                  new URL(url).hostname.endsWith(`.${domain}`),
              ),
          )
          .slice(0, 20)
          .map((url) => ({
            id: randomUUID(),
            label: `Source ${app.name}`,
            url,
          }));
      }
      // Bound stored and model-visible output. A completed write remains completed even if its display is shortened.
      const raw = JSON.stringify(result);
      if (raw && raw.length > 100000)
        result = {
          notice: "Résultat tronqué pour le contexte.",
          text: raw.slice(0, 100000),
        };
      o.status = "succeeded";
      o.summary = "Exécution terminée.";
      o.result = result;
      o.sources = sources;
    } catch (e) {
      const error =
        e instanceof ConnectorError
          ? e
          : new ConnectorError(
              "TOOL_NETWORK",
              "Exécution interrompue ; vérifiez l’application.",
              true,
            );
      o.status = error.uncertain ? "uncertain" : "failed";
      o.summary = error.message;
      if (["APP_PERMISSION", "RECONNECT", "OAUTH_DENIED"].includes(error.code))
        await this.vault.update((d) => {
          const c = d.connections[app.id];
          if (c?.accountId === o.accountId) c.status = "reconnect";
        });
    }
    await this.vault.update((d) => {
      d.operations[o.id] = { ...o };
    });
    return {
      operation: publicOperation(o),
      result: o.result,
      sources: o.sources || [],
    };
  }
  async context(conversationId: string, ids?: string[]) {
    const all = (await this.data()).operations;
    return Object.values(all)
      .filter(
        (o) =>
          o.userId === this.userId &&
          o.conversationId === conversationId &&
          o.status !== "pending" &&
          o.status !== "running" &&
          (!ids || ids.includes(o.id)),
      )
      .slice(-10)
      .map((o) => ({
        operation: publicOperation(o),
        result: o.result,
        sources: o.sources || [],
      }));
  }
}
function tokenURL(app: AppDefinition) {
  return app.family === "google"
    ? "https://oauth2.googleapis.com/token"
    : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
}
function hashPKCE(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

const describeSchema = z
  .object({
    query: z.string().max(200).optional(),
    names: z.array(z.string().max(100)).max(8).optional(),
  })
  .strict();
