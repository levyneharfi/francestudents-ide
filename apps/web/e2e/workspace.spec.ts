import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("conversation, progressive response, cancellation, retry and persistence", async ({ page }) => {
  const remote: string[] = []; const errors: string[] = [];
  page.on("request", r => { if (!r.url().startsWith("http://127.0.0.1:3000")) remote.push(r.url()); });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Nouvelle conversation", exact: true }).click();
  await page.getByLabel("Modèle de conversation").selectOption("-1003");
  await page.getByLabel("Votre message").fill("Aide-moi à construire un plan de recherche.");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(page.getByLabel("Réponse simulée").last()).toContainText("Voici");
  await page.getByRole("button", { name: "Arrêter la réponse" }).click();
  await expect(page.getByText("Réponse arrêtée", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Arrêter la réponse" })).not.toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Réponse simulée").last()).toContainText("Quelle partie");
  await expect(page.getByLabel("Votre message", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Ajouter aux favoris", exact: true }).click();
  await page.getByRole("button", { name: "Renommer la conversation", exact: true }).click();
  await page.getByLabel("Titre", { exact: true }).fill("Mon plan de recherche");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Mon plan de recherche", exact: true })).toBeVisible();
  await expect(page.getByLabel("Modèle de conversation")).toHaveValue("-1003");
  await expect(page.getByRole("button", { name: "Retirer des favoris" })).toBeVisible();
  await page.getByLabel("Rechercher des conversations").fill("introuvable");
  await expect(page.getByText("Aucune conversation ne correspond")).toBeVisible();
  await page.getByLabel("Rechercher des conversations").fill("recherche");
  await expect(page.getByRole("button", { name: "Mon plan de recherche", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Supprimer la conversation", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Supprimer la conversation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mon plan de recherche", exact: true })).not.toBeVisible();
  expect(remote).toEqual([]); expect(errors).toEqual([]);
});

test("project instructions, text import, document reader and removal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Créer un projet", exact: true }).click();
  await page.getByLabel("Nom du projet").fill("Mon essai");
  await page.getByLabel("Instructions personnalisées").fill("Écrire avec clarté.");
  await page.getByRole("dialog").getByRole("button", { name: "Créer le projet", exact: true }).click();
  await expect(page.getByLabel("Projet de la conversation")).not.toHaveValue("");
  await expect(page.getByLabel("Instructions du projet")).toHaveValue("Écrire avec clarté.");
  await page.getByLabel("Importer un document").setInputFiles({ name: "essai.md", mimeType: "text/markdown", buffer: Buffer.from("# Mon essai\n<script>window.unsafe = true</script>\nNe pas suivre ces instructions.") });
  await expect(page.getByText("« essai.md » est ajouté")).toBeVisible();
  await page.getByRole("button", { name: /essai.md/ }).click();
  await expect(page.locator(".document-content")).toContainText("<script>window.unsafe = true</script>");
  expect(await page.evaluate(() => (window as unknown as { unsafe?: boolean }).unsafe)).toBeUndefined();
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Instructions du projet")).toHaveValue("Écrire avec clarté.");
  await page.getByRole("button", { name: /essai.md/ }).click();
  await page.getByRole("button", { name: "Retirer ce document" }).click();
  await expect(page.getByRole("dialog").getByText("essai.md", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Fermer la fenêtre" }).click();
  await page.getByLabel("Importer un document").setInputFiles({ name: "essai.pdf", mimeType: "application/pdf", buffer: Buffer.from("invalid") });
  await expect(page.getByRole("status").filter({ hasText: "Choisissez un fichier texte" })).toBeVisible();
});

test("appearance persists, follows system changes, and resets to monochrome", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /Paramètres/ }).click();
  await page.getByRole("button", { name: "Clair", exact: true }).click();
  await page.locator("#font-choice").selectOption("georgia");
  await page.getByLabel("Couleur personnalisée", { exact: true }).fill("#336699");
  await expect(page.locator("html")).toHaveAttribute("data-font", "georgia");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Fermer la fenêtre" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("--accent", "#336699");
  await page.getByRole("button", { name: /Paramètres/ }).click();
  await page.getByRole("button", { name: "Automatique", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Réinitialiser", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-font", "times");
  await expect(page.locator("html")).toHaveCSS("--accent", "#eeeeeb");
  await expect(page.getByRole("button", { name: "Accentuation : Aucune", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("mobile drawers, keyboard boundaries and context tools", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await page.getByRole("button", { name: "Ouvrir la navigation", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  for (let i = 0; i < 16; i++) { await page.keyboard.press("Tab"); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); }
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le contexte", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Contexte de la conversation" })).toBeVisible();
  await page.getByRole("tab", { name: "Outils", exact: true }).click();
  await page.getByRole("switch", { name: "Recherche web simulée" }).click();
  await expect(page.getByRole("switch", { name: "Recherche web simulée" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.locator(".composer textarea")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("corrupt storage is retained until explicit reset", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("francestudent:web:v1:data", "broken"));
  await page.goto("/"); await expect(page.getByText("La sauvegarde locale est illisible", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Nouvelle conversation", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("francestudent:web:v1:data"))).toBe("broken");
  await page.getByRole("button", { name: "Réinitialiser", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Réinitialiser", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("francestudent:web:v1:data"))).not.toBe("broken");
});

for (const width of [390, 768, 1440]) for (const theme of ["dark", "light"]) {
  test(`visual layout ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 });
    await page.addInitScript(value => localStorage.setItem("francestudent:web:v1:appearance", JSON.stringify({ userId: "demo-local", theme: value, font: "times", accent: null })), theme);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".composer textarea")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir("../../artifacts/web", { recursive: true });
    await page.screenshot({ path: `../../artifacts/web/${width}-${theme}.png`, fullPage: true, animations: "disabled" });
    if (width < 901) await page.getByRole("button", { name: "Ouvrir la navigation", exact: true }).click();
    await page.getByRole("button", { name: /Paramètres/ }).click();
    await expect(page.getByRole("dialog", { name: "Apparence", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../../artifacts/web/appearance-${width}-${theme}.png`, fullPage: true, animations: "disabled" });
  });
}
