import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { initialData } from "../lib/domain";
import { exampleBlocks } from "../lib/example-reply";
const seed = () => {
  const data = initialData();
  data.conversations[0].messages[1] = {
    id: "rich-demo",
    userId: data.userId,
    role: "assistant",
    modelId: "-1002",
    content:
      "Voici une proposition à ajuster. Les chiffres sont un exemple fictif.\n\n",
    status: "complete",
    blocks: exampleBlocks.map((block) => ({ block, offset: 81 })),
  };
  data.conversations[0].messages[1].blocks!.forEach(
    (p) => (p.offset = data.conversations[0].messages[1].content.length),
  );
  return data;
};
test("GPT selects rich responses without asking for a widget; checklist and form persist", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Nouvelle conversation", exact: true })
    .click();
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Aide-moi à préparer ma semaine.");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(
    page.getByRole("button", { name: "Arrêter la réponse" }),
  ).not.toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("region", { name: "Répartition proposée", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Relire les documents principaux", { exact: true })
    .check();
  await page.getByLabel("Les deux", { exact: true }).check();
  await page.reload();
  await expect(
    page.getByLabel("Relire les documents principaux", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Les deux", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page.getByLabel("Message envoyé").last()).toContainText(
    "Votre priorité : Les deux",
  );
  await expect(
    page.getByRole("button", { name: "Réponse envoyée", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
test("other model families keep text responses; applications catalogue is honestly simulated", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Nouvelle conversation", exact: true })
    .click();
  await page.getByLabel("Modèle de conversation").selectOption("-2001");
  await page
    .getByLabel("Votre message", { exact: true })
    .fill("Prépare ma semaine");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(
    page.getByRole("button", { name: "Arrêter la réponse" }),
  ).not.toBeVisible({ timeout: 15000 });
  await expect(page.locator(".reply-block")).toHaveCount(0);
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "aucune application n’est connectée",
  );
  await expect(
    page.getByRole("button", { name: "Connecter", exact: true }),
  ).toHaveCount(10);
  await page.getByLabel("Rechercher une application").fill("gmail");
  await expect(page.locator(".app-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Connecter", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
for (const width of [390, 768, 1440])
  for (const theme of ["dark", "light"]) {
    test(`rich visual ${width} ${theme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(
        ({ data, theme }) => {
          localStorage.setItem(
            "francestudent:web:v1:data",
            JSON.stringify(data),
          );
          localStorage.setItem(
            "francestudent:web:v1:appearance",
            JSON.stringify({
              userId: "demo-local",
              theme,
              font: "times",
              accent: null,
            }),
          );
        },
        { data: seed(), theme },
      );
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator(".reply-chart svg")).toBeVisible();
      await page
        .getByRole("region", {
          name: "Votre préparation, étape par étape",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await expect(page.locator(".reply-diagram svg")).toBeVisible({
        timeout: 20000,
      });
      await expect(page.locator(".composer textarea")).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await mkdir("../../artifacts/web-rich", { recursive: true });
      await page
        .locator(".message-scroller")
        .evaluate((el) => (el.scrollTop = 0));
      await page.screenshot({
        path: `../../artifacts/web-rich/chat-${width}-${theme}.png`,
        animations: "disabled",
      });
      if (width < 901)
        await page
          .getByRole("button", { name: "Ouvrir la navigation", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Applications", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `../../artifacts/web-rich/apps-${width}-${theme}.png`,
        animations: "disabled",
      });
      expect(errors).toEqual([]);
    });
  }
test("Markdown cannot execute HTML and diagram directives; table and code remain readable", async ({
  page,
}) => {
  const data = seed();
  const m = data.conversations[0].messages[1];
  m.blocks = [];
  m.content =
    "# Exemple\n\n<script>window.compromised=true</script>\n\n[Danger](javascript:alert(1))\n\n```js\nconst answer = 42;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n$E=mc^2$";
  await page.addInitScript(
    (data) =>
      localStorage.setItem("francestudent:web:v1:data", JSON.stringify(data)),
    data,
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Exemple", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".message-text table")).toBeVisible();
  await expect(page.locator(".katex")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copier le code" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { compromised?: boolean }).compromised,
    ),
  ).toBeUndefined();
  await expect(
    page.locator('.message-text a[href^="javascript:"]'),
  ).toHaveCount(0);
});
