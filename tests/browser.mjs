import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const output = fileURLToPath(new URL("../test-results/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = "http://localhost:5173";
const screenshot = async (name) =>
  page.screenshot({ path: output + name + ".png", fullPage: true });
try {
  await page.goto(base + "/login");
  await page.getByRole("button", { name: "Explorar demonstração" }).waitFor();
  await screenshot("01-login");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.waitForURL(base + "/app");
  await page
    .getByRole("heading", { name: "Visão geral", exact: true })
    .waitFor();
  await page.locator(".opportunity-card").first().waitFor();
  assert.ok(await page.locator(".demo-banner").isVisible());
  await screenshot("02-dashboard");
  await page
    .getByLabel("Distribuir oportunidades por")
    .selectOption("modality");
  await page
    .getByRole("heading", { name: "Modalidades em destaque", exact: true })
    .waitFor();
  assert.ok(
    (await page.locator(".distribution-modalities .distribution-row").count()) >
      0,
  );
  await page.getByLabel("Distribuir oportunidades por").selectOption("state");
  console.log("OK: demonstração e dashboard");
  for (const [route, heading] of [
    ["/app/oportunidades", "Oportunidades"],
    ["/app/radar", "Meu radar"],
    ["/app/catalogo", "Catálogo de soluções"],
    ["/app/documentos", "Documentos e certidões"],
    ["/app/perfil", "Perfil comercial"],
    ["/app/fontes", "Fontes de dados"],
    ["/app/notificacoes", "Notificações"],
    ["/app/configuracoes", "Configurações"],
  ]) {
    await page.goto(base + route);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    await page
      .locator(".loading-state")
      .waitFor({ state: "hidden" })
      .catch(() => {});
    assert.equal(
      await page.locator(".error-notice").count(),
      0,
      route + " mostrou erro",
    );
    console.log("OK: " + route);
  }
  await page.goto(base + "/app/catalogo");
  await page
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  await page.getByLabel("Nome do item").fill("Notebook QA navegador");
  await page.getByLabel("Categoria", { exact: true }).fill("Equipamentos");
  await page
    .getByLabel("Palavras-chave relacionadas")
    .fill("notebook, computadores");
  await page
    .getByRole("button", { name: "Cadastrar item", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Notebook QA navegador", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Editar Notebook QA navegador", exact: true })
    .click();
  await page.getByLabel("Nome do item").fill("Notebook QA atualizado");
  await page.getByRole("button", { name: "Salvar item", exact: true }).click();
  await page
    .getByRole("heading", { name: "Notebook QA atualizado", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Notebook QA atualizado", exact: true })
    .waitFor();
  await screenshot("03-catalogo");
  console.log("OK: criar, editar e persistir catálogo");
  await page.goto(base + "/app/oportunidades");
  await page.getByRole("button", { name: "Mais filtros" }).click();
  const filtered = page.waitForResponse(
    (response) =>
      response.url().includes("/api/opportunities?") &&
      response.url().includes("status=open") &&
      response.ok(),
  );
  await page.getByLabel("Situação das propostas").selectOption("open");
  const openResults = await (await filtered).json();
  assert.ok(openResults.items.length > 0);
  assert.ok(
    openResults.items.every(
      (item) => new Date(item.closesAt).getTime() >= Date.now(),
    ),
  );
  await page.getByLabel("Situação das propostas").selectOption("");
  await page.getByLabel("Buscar oportunidades").fill("videoconferência");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.locator(".opportunity-card").first().click();
  await page
    .getByRole("button", { name: "Adicionar ao radar", exact: true })
    .click();
  await page.waitForURL(/\/app\/radar\/.+/);
  await page
    .getByRole("heading", { name: "Checklist de preparação" })
    .waitFor();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page
    .getByLabel("O que precisa ser feito?")
    .fill("Validar especificação QA");
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Validar especificação QA", exact: true })
    .check();
  await page.getByLabel("Etapa atual").selectOption("WILL_PARTICIPATE");
  await page
    .getByLabel("Notas internas")
    .fill("Registro persistente criado no teste do navegador.");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Participação atualizada" })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Checklist de preparação" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Etapa atual").inputValue(),
    "WILL_PARTICIPATE",
  );
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Validar especificação QA", exact: true })
      .isChecked(),
    true,
  );
  await screenshot("04-participacao");
  console.log("OK: oportunidade, radar, tarefa, decisão e persistência");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/app");
  await page
    .getByRole("heading", { name: "Visão geral", exact: true })
    .waitFor();
  await page.locator(".opportunity-card").first().waitFor();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  assert.equal(overflow, false, "Dashboard móvel com overflow");
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("link", { name: "Catálogo", exact: true }).click();
  await page
    .getByRole("heading", { name: "Catálogo de soluções", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
  );
  await screenshot("05-mobile");
  console.log("OK: menu e layout móvel");
  assert.deepEqual(errors, [], "Erros de execução no navegador");
  console.log(
    "Todos os fluxos de navegador passaram. Capturas em test-results.",
  );
} catch (e) {
  await screenshot("erro");
  throw e;
} finally {
  await browser.close();
}
