import { test, expect } from "@playwright/test";
test("OAuth popup returns to local server, GPT proposes an exact write, confirmation resumes and survives reload", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("https://accounts.google.com/**", async (route) => {
    const url = new URL(route.request().url());
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", url.searchParams.get("state")!);
    callback.searchParams.set("code", "offline-test-code");
    await route.fulfill({
      status: 302,
      headers: { location: callback.href },
      body: "",
    });
  });
  await page.goto("/");
  await page.getByLabel("Mot de passe local").fill("Local-e2e-password-123");
  await page.getByRole("button", { name: "Ouvrir mon espace" }).click();
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await page.getByLabel("Rechercher une application").fill("gmail");
  await expect(page.locator(".app-card")).toHaveCount(1);
  await expect(
    page
      .locator(".app-card")
      .getByRole("button", { name: "Connecter", exact: true }),
  ).toBeEnabled();
  await page
    .locator(".app-card")
    .getByRole("button", { name: "Connecter", exact: true })
    .click();
  await expect(page.locator(".app-card")).toContainText("Connectée", {
    timeout: 20000,
  });
  await page.keyboard.press("Escape");
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Prépare un e-mail pour ma réunion.");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmer cette action", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".tool-card")).toContainText(
    "Confirmation requise",
  );
  await expect(page.locator(".tool-card")).toContainText(
    "destinataire@example.test",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Confirmer cette action", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmer cette action", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Envoi terminé", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".tool-card")).toContainText("Action exécutée");
  await expect(
    page.getByRole("button", { name: "Confirmer cette action", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".tool-card")).toContainText("Action exécutée");
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toMatch(
    /offline-oauth-secret|offline-refresh-secret|offline-fixture-secret|secret-jwt|next-auth/,
  );
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await page.getByLabel("Rechercher une application").fill("gmail");
  await page.getByRole("button", { name: "Déconnecter", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmer la déconnexion", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connecter", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
