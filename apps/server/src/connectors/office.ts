import { z } from "zod";
import { ConnectorError, boundedText } from "./http";
import type { AppDefinition } from "./catalog";
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  schema: z.ZodType<Record<string, unknown>>;
}
const text = (n = 2000) => z.string().min(1).max(n);
const resource = text(500).refine(
  (v) => !/[\r\n]/.test(v) && v !== "." && v !== "..",
);
const query = z.object({ query: text(500).optional() }).strict();
const id = z.object({ id: resource }).strict();
const mail = z
  .object({
    to: z.array(z.email()).min(1).max(20),
    subject: text(500).refine((s) => !/[\r\n]/.test(s)),
    body: text(30000),
  })
  .strict();
const event = z
  .object({
    title: text(500),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    description: z.string().max(10000).optional(),
  })
  .strict()
  .refine(
    (v) => Date.parse(v.end) > Date.parse(v.start),
    "La fin doit suivre le début.",
  );
const tool = (
  name: string,
  title: string,
  readOnly: boolean,
  schema: ToolDefinition["schema"],
  description = title,
): ToolDefinition => ({ name, title, readOnly, schema, description });
export function officeTools(app: AppDefinition): ToolDefinition[] {
  if (app.id === "google-drive" || app.id === "onedrive")
    return [
      tool("search", "Rechercher des fichiers", true, query),
      tool("read", "Lire un fichier texte", true, id),
      tool(
        "create",
        "Créer un fichier texte",
        false,
        z
          .object({
            name: text(200).refine((n) => !/[\\/]/.test(n)),
            content: z.string().max(100000),
          })
          .strict(),
      ),
      tool(
        "update",
        "Modifier le contenu d’un fichier texte",
        false,
        z.object({ id: resource, content: z.string().max(100000) }).strict(),
      ),
      tool("delete", "Mettre le fichier à la corbeille", false, id),
    ];
  if (app.id === "gmail" || app.id === "outlook")
    return [
      tool("search", "Rechercher des messages", true, query),
      tool("read", "Lire un message", true, id),
      tool("draft", "Créer un brouillon", false, mail),
      tool("send", "Envoyer un e-mail", false, mail),
    ];
  return [
    tool(
      "list",
      "Consulter les événements",
      true,
      z
        .object({
          start: z.iso.datetime({ offset: true }).optional(),
          end: z.iso.datetime({ offset: true }).optional(),
        })
        .strict(),
    ),
    tool("read", "Lire un événement", true, id),
    tool("create", "Créer un événement", false, event),
    tool(
      "update",
      "Modifier un événement",
      false,
      z
        .object({
          id: resource,
          title: text(500),
          start: z.iso.datetime({ offset: true }),
          end: z.iso.datetime({ offset: true }),
          description: z.string().max(10000).optional(),
        })
        .strict()
        .refine((v) => Date.parse(v.end) > Date.parse(v.start)),
    ),
    tool("delete", "Annuler un événement", false, id),
  ];
}
const enc = encodeURIComponent;
const params = (v: Record<string, string>) => new URLSearchParams(v).toString();
export class OfficeAdapter {
  constructor(private request: typeof fetch = fetch) {}
  async execute(
    app: AppDefinition,
    name: string,
    args: Record<string, unknown>,
    token: string,
    signal: AbortSignal,
  ) {
    const definition = officeTools(app).find((t) => t.name === name);
    if (!definition) throw new ConnectorError("TOOL_UNKNOWN", "Outil inconnu.");
    const parsed = definition.schema.safeParse(args);
    if (!parsed.success)
      throw new ConnectorError(
        "ARGUMENTS_INVALID",
        "Paramètres d’outil invalides.",
      );
    const a = parsed.data as Record<string, any>; // Values are constrained by the per-tool schema above.
    const api = async (
      url: string,
      method = "GET",
      value?: unknown,
      contentType = "application/json",
    ) => {
      const u = new URL(url);
      const allowed =
        app.family === "google"
          ? ["www.googleapis.com", "gmail.googleapis.com"]
          : ["graph.microsoft.com"];
      if (u.protocol !== "https:" || !allowed.includes(u.hostname))
        throw new ConnectorError("HOST_DENIED", "Destination refusée.");
      let response: Response;
      try {
        response = await this.request(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": contentType,
          },
          body:
            value === undefined
              ? undefined
              : contentType === "application/json"
                ? JSON.stringify(value)
                : String(value),
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
        });
      } catch {
        throw new ConnectorError(
          "APP_NETWORK",
          definition.readOnly
            ? "Application injoignable."
            : "Résultat incertain. Vérifiez l’application avant toute nouvelle action.",
          !definition.readOnly,
        );
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403)
          throw new ConnectorError(
            "APP_PERMISSION",
            "Accès refusé ou expiré : reconnectez l’application et vérifiez les permissions ou l’administrateur.",
          );
        throw new ConnectorError(
          "APP_HTTP",
          `L’application a répondu HTTP ${response.status}.`,
          !definition.readOnly && response.status >= 500,
        );
      }
      try {
        const raw = await boundedText(response);
        return response.headers.get("content-type")?.includes("json") && raw
          ? JSON.parse(raw)
          : raw;
      } catch {
        throw new ConnectorError(
          "APP_RESULT",
          "Résultat incomplet. Vérifiez l’application avant de réessayer.",
          !definition.readOnly,
        );
      }
    };
    const graph = "https://graph.microsoft.com/v1.0/me";
    const calendar =
      "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    let result: any,
      sources: { label: string; url: string }[] = [];
    if (app.id === "google-drive") {
      const base = "https://www.googleapis.com/drive/v3/files";
      if (name === "search") {
        result = await api(
          `${base}?${params({ q: `trashed = false${a.query ? ` and name contains '${String(a.query).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'` : ""}`, pageSize: "20", fields: "files(id,name,mimeType,webViewLink)" })}`,
        );
        sources = (result.files || []).map((f: any) => ({
          label: f.name,
          url:
            f.webViewLink ||
            `https://drive.google.com/file/d/${enc(f.id)}/view`,
        }));
      } else if (name === "read" || name === "update") {
        const meta = await api(
          `${base}/${enc(a.id)}?fields=id,name,mimeType,webViewLink`,
        );
        const nativeDoc =
          meta.mimeType === "application/vnd.google-apps.document";
        if (name === "update" && nativeDoc)
          throw new ConnectorError(
            "FILE_TYPE",
            "Modification du contenu Google Docs non prise en charge ; créez un fichier texte ou modifiez un fichier texte existant.",
          );
        if (!nativeDoc && !/^text\//.test(meta.mimeType))
          throw new ConnectorError(
            "FILE_TYPE",
            "Cet outil lit uniquement les fichiers texte et Google Docs.",
          );
        if (name === "read")
          result = {
            ...meta,
            content: await api(
              nativeDoc
                ? `${base}/${enc(a.id)}/export?mimeType=text%2Fplain`
                : `${base}/${enc(a.id)}?alt=media`,
            ),
          };
        else
          result = await api(
            `https://www.googleapis.com/upload/drive/v3/files/${enc(a.id)}?uploadType=media`,
            "PATCH",
            a.content,
            "text/plain; charset=utf-8",
          );
        sources = [
          {
            label: meta.name,
            url:
              meta.webViewLink ||
              `https://drive.google.com/file/d/${enc(a.id)}/view`,
          },
        ];
      } else if (name === "create") {
        const boundary = "francestudent_" + crypto.randomUUID();
        result = await api(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
          "POST",
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: a.name, mimeType: "text/plain" })}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${a.content}\r\n--${boundary}--`,
          `multipart/related; boundary=${boundary}`,
        );
        sources = [
          {
            label: result.name,
            url:
              result.webViewLink ||
              `https://drive.google.com/file/d/${enc(result.id)}/view`,
          },
        ];
      } else
        result = await api(`${base}/${enc(a.id)}`, "PATCH", { trashed: true });
    } else if (app.id === "gmail") {
      const base = "https://gmail.googleapis.com/gmail/v1/users/me";
      if (name === "search") {
        result = await api(
          `${base}/messages?${params({ maxResults: "20", q: a.query || "" })}`,
        );
        sources = (result.messages || []).map((m: any) => ({
          label: `Message ${m.id}`,
          url: `https://mail.google.com/mail/u/0/#all/${enc(m.id)}`,
        }));
      } else if (name === "read") {
        const raw = await api(`${base}/messages/${enc(a.id)}?format=full`);
        result = {
          id: raw.id,
          snippet: raw.snippet,
          headers: raw.payload?.headers,
          text: mailText(raw.payload),
        };
        sources = [
          {
            label: "Message Gmail",
            url: `https://mail.google.com/mail/u/0/#all/${enc(a.id)}`,
          },
        ];
      } else {
        const raw = Buffer.from(
          `To: ${a.to.join(", ")}\r\nSubject: =?UTF-8?B?${Buffer.from(a.subject).toString("base64")}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(a.body).toString("base64")}`,
        ).toString("base64url");
        result = await api(
          `${base}/${name === "draft" ? "drafts" : "messages/send"}`,
          "POST",
          name === "draft" ? { message: { raw } } : { raw },
        );
      }
    } else if (app.id === "google-calendar") {
      if (name === "list")
        result = await api(
          `${calendar}?${params({ timeMin: a.start || new Date().toISOString(), ...(a.end ? { timeMax: a.end } : {}), singleEvents: "true", orderBy: "startTime", maxResults: "30" })}`,
        );
      else if (name === "read") result = await api(`${calendar}/${enc(a.id)}`);
      else if (name === "delete")
        result = await api(`${calendar}/${enc(a.id)}`, "DELETE");
      else
        result = await api(
          name === "update" ? `${calendar}/${enc(a.id)}` : calendar,
          name === "update" ? "PATCH" : "POST",
          {
            summary: a.title,
            start: { dateTime: a.start },
            end: { dateTime: a.end },
            description: a.description || "",
          },
        );
      const events =
        name === "list"
          ? result.items || []
          : typeof result === "object"
            ? [result]
            : [];
      sources = events
        .filter((e: any) => e.htmlLink)
        .map((e: any) => ({
          label: e.summary || "Événement",
          url: e.htmlLink,
        }));
    } else if (app.id === "onedrive") {
      const base = `${graph}/drive`;
      if (name === "search") {
        result = await api(
          `${base}/root/search(q='${enc(String(a.query || "").replace(/'/g, "''"))}')?$top=20&$select=id,name,webUrl,file`,
        );
        sources = (result.value || []).map((f: any) => ({
          label: f.name,
          url: f.webUrl,
        }));
      } else if (name === "read" || name === "update") {
        const meta = await api(
          `${base}/items/${enc(a.id)}?$select=id,name,file,webUrl`,
        );
        if (!/^text\//.test(meta.file?.mimeType || ""))
          throw new ConnectorError(
            "FILE_TYPE",
            "Cet outil prend en charge les fichiers texte, pas les formats Office binaires.",
          );
        // Graph /content redirects to a signed download host. Do not forward the OAuth token there.
        if (name === "read") {
          const r = await this.request(`${base}/items/${enc(a.id)}/content`, {
            headers: { Authorization: `Bearer ${token}` },
            redirect: "manual",
            signal,
          });
          if (r.status !== 302 && r.status !== 301) {
            if (!r.ok)
              throw new ConnectorError("APP_HTTP", "Lecture OneDrive refusée.");
            result = { name: meta.name, content: await boundedText(r) };
          } else {
            const location = new URL(r.headers.get("location") || "");
            if (
              location.protocol !== "https:" ||
              location.username ||
              location.password ||
              !/(?:^|\.)(?:sharepoint\.com|1drv\.com|onedrive\.com|storage\.live\.com)$/.test(
                location.hostname,
              )
            )
              throw new ConnectorError(
                "HOST_DENIED",
                "Hôte de téléchargement OneDrive non reconnu.",
              );
            const download = await this.request(location, {
              redirect: "error",
              signal,
            });
            if (!download.ok)
              throw new ConnectorError("APP_HTTP", "Téléchargement refusé.");
            result = { name: meta.name, content: await boundedText(download) };
          }
        } else
          result = await api(
            `${base}/items/${enc(a.id)}/content`,
            "PUT",
            a.content,
            "text/plain; charset=utf-8",
          );
        sources = [{ label: meta.name, url: meta.webUrl }];
      } else if (name === "create") {
        result = await api(
          `${base}/root:/${enc(a.name)}:/content?@microsoft.graph.conflictBehavior=fail`,
          "PUT",
          a.content,
          "text/plain; charset=utf-8",
        );
        sources = [{ label: result.name, url: result.webUrl }];
      } else result = await api(`${base}/items/${enc(a.id)}`, "DELETE");
    } else if (app.id === "outlook") {
      if (name === "search") {
        result = await api(
          `${graph}/messages?${params({ $top: "20", $select: "id,subject,from,receivedDateTime,webLink", ...(a.query ? { $search: JSON.stringify(a.query) } : {}) })}`,
        );
        sources = (result.value || []).map((m: any) => ({
          label: m.subject || "Message Outlook",
          url: m.webLink,
        }));
      } else if (name === "read") {
        result = await api(
          `${graph}/messages/${enc(a.id)}?${params({ $select: "id,subject,body,from,toRecipients,webLink" })}`,
        );
        sources = [
          { label: result.subject || "Message Outlook", url: result.webLink },
        ];
      } else {
        const message = {
          subject: a.subject,
          body: { contentType: "Text", content: a.body },
          toRecipients: a.to.map((address: string) => ({
            emailAddress: { address },
          })),
        };
        result = await api(
          name === "send" ? `${graph}/sendMail` : `${graph}/messages`,
          "POST",
          name === "send" ? { message, saveToSentItems: true } : message,
        );
      }
    } else {
      if (name === "list")
        result = await api(
          `${graph}/calendarView?${params({ startDateTime: a.start || new Date().toISOString(), endDateTime: a.end || new Date(Date.now() + 7 * 86400000).toISOString(), $top: "30" })}`,
        );
      else if (name === "read")
        result = await api(`${graph}/events/${enc(a.id)}`);
      else if (name === "delete")
        result = await api(`${graph}/events/${enc(a.id)}`, "DELETE");
      else
        result = await api(
          name === "update"
            ? `${graph}/events/${enc(a.id)}`
            : `${graph}/events`,
          name === "update" ? "PATCH" : "POST",
          {
            subject: a.title,
            start: {
              dateTime: new Date(a.start).toISOString().replace("Z", ""),
              timeZone: "UTC",
            },
            end: {
              dateTime: new Date(a.end).toISOString().replace("Z", ""),
              timeZone: "UTC",
            },
            body: { contentType: "Text", content: a.description || "" },
          },
        );
      sources = (
        name === "list"
          ? result.value || []
          : typeof result === "object"
            ? [result]
            : []
      )
        .filter((e: any) => e.webLink)
        .map((e: any) => ({ label: e.subject || "Événement", url: e.webLink }));
    }
    return { result, sources };
  }
}

function mailText(part: any): string {
  if (!part || typeof part !== "object") return "";
  const own =
    typeof part.body?.data === "string" &&
    /^text\/(?:plain|html)$/.test(part.mimeType || "")
      ? Buffer.from(part.body.data, "base64url").toString("utf8")
      : "";
  return [own, ...(Array.isArray(part.parts) ? part.parts.map(mailText) : [])]
    .filter(Boolean)
    .join("\n")
    .slice(0, 100000);
}
