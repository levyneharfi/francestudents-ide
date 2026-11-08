/** Fixed-host requests only; credentials never follow redirects or model-provided URLs. */
export class ConnectorError extends Error {
  constructor(
    public code: string,
    message: string,
    public uncertain = false,
  ) {
    super(message);
  }
}
export async function boundedText(
  response: Response,
  limit = 512_000,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit)
        throw new ConnectorError(
          "RESULT_TOO_LARGE",
          "Résultat trop volumineux ; affinez votre recherche.",
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function tokenRequest(
  url: string,
  params: URLSearchParams,
  request: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ConnectorError(
      "OAUTH_NETWORK",
      "Le service d’authentification est injoignable.",
    );
  }
  if (!response.ok)
    throw new ConnectorError(
      "OAUTH_DENIED",
      "Autorisation refusée ou expirée. Reconnectez cette application ; vérifiez les permissions et restrictions administrateur.",
    );
  const value = JSON.parse(await boundedText(response, 64000));
  if (typeof value.access_token !== "string" || !value.access_token)
    throw new ConnectorError(
      "OAUTH_INVALID",
      "Réponse d’authentification invalide.",
    );
  return value;
}
