import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "pt-BR",
});
const page = await context.newPage();
let violationCount = 0;
try {
  await page.goto("http://localhost:5173/login");
  await page.getByRole("button", { name: "Explorar demonstração" }).waitFor();
  for (const route of [
    "login",
    "app",
    "app/catalogo",
    "app/perfil",
    "app/oportunidades",
    "app/radar",
    "app/documentos",
    "app/fontes",
    "app/notificacoes",
    "app/configuracoes",
    "app/simulador",
  ]) {
    if (route === "app") {
      await page.getByRole("button", { name: "Explorar demonstração" }).click();
      await page.waitForURL("http://localhost:5173/app");
      await page.locator(".opportunity-card").first().waitFor();
    } else if (route !== "login") {
      await page.goto("http://localhost:5173/" + route);
      await page.locator("main h1").waitFor();
      await page
        .locator(".loading-state")
        .waitFor({ state: "hidden" })
        .catch(() => {});
    }
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    violationCount += result.violations.length;
    console.log(
      JSON.stringify(
        {
          route,
          violations: result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: [
              ...new Map(
                v.nodes.map((n) => [
                  n.failureSummary,
                  { target: n.target, summary: n.failureSummary },
                ]),
              ).values(),
            ],
          })),
        },
        null,
        2,
      ),
    );
  }
} finally {
  await browser.close();
}
if (violationCount > 0) process.exitCode = 1;
