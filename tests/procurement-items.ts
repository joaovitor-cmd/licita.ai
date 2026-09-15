import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { pool } from "../apps/api/src/db.js";

test("itens: privacidade, estados da interface, paginação, precisão e acessibilidade", async () => {
  const origin = "http://localhost:5173",
    accounts: any[] = [];
  let browser;
  async function client() {
    const r = await fetch(origin + "/api/auth/demo", {
      method: "POST",
      headers: { Origin: origin },
    });
    assert.equal(r.status, 201);
    const account = await r.json();
    accounts.push(account);
    const cookie = r.headers.getSetCookie().at(-1)!.split(";")[0];
    return {
      account,
      cookie,
      call: async (path: string, status = 200) => {
        const r = await fetch(origin + "/api" + path, {
            headers: { Cookie: cookie },
          }),
          body = await r.json();
        assert.equal(r.status, status, JSON.stringify(body));
        return body;
      },
    };
  }
  try {
    const a = await client(),
      b = await client();
    const id = (await a.call("/opportunities")).items[0].id;
    assert.equal((await a.call(`/opportunities/${id}/items`)).supported, false);
    await b.call(`/opportunities/${id}/items`, 404);
    await a.call(`/opportunities/${id}/items?page=401`, 400);
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const [name, ...value] = a.cookie.split("=");
    await context.addCookies([{ name, value: value.join("="), url: origin }]);
    const page = await context.newPage();
    // Only browser fixtures are mocked; API authorization above uses the real server.
    let mode = "normal";
    await page.route("**/api/opportunities/*/items?*", async (route) => {
      if (mode === "error")
        return route.fulfill({
          status: 502,
          json: { error: "Fonte indisponível para este teste." },
        });
      const current = Number(
        new URL(route.request().url()).searchParams.get("page"),
      );
      await route.fulfill({
        json: {
          supported: true,
          page: current,
          hasMore: current === 1,
          checkedAt: new Date().toISOString(),
          sourceUrl: "https://pncp.gov.br/api/pncp",
          items:
            mode === "empty"
              ? []
              : [
                  {
                    number: current,
                    description:
                      "Página monocromática — conferir franquia e atendimento técnico",
                    quantity: 10000,
                    unit: "Página",
                    estimatedUnit: 0.0345,
                    estimatedTotal: 345,
                    confidential: current === 2,
                    hasResult: true,
                    status: "Homologado",
                  },
                ],
        },
      });
    });
    await page.goto(origin + `/app/oportunidades/${id}`);
    await page
      .getByRole("tab", { name: "Itens e valores", exact: true })
      .click();
    await page.getByText("R$ 0,0345", { exact: true }).waitFor();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
    }
    await page.screenshot({
      path: "test-results/19-items-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Próxima página", exact: true })
      .click();
    await page.getByRole("heading", { name: "Item 2", exact: true }).waitFor();
    assert.equal(
      await page.getByText("Orçamento sigiloso", { exact: true }).count(),
      2,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Próxima página", exact: true })
        .isDisabled(),
      true,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('.sidebar')!.getBoundingClientRect().right <= 0);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "test-results/19-items-mobile.png",
      fullPage: true,
    });
    mode = "error";
    await page
      .getByRole("button", { name: "Página anterior", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Fonte indisponível" })
      .waitFor();
    mode = "empty";
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await page
      .getByText("Nenhum item retornado nesta página.", { exact: false })
      .waitFor();
  } finally {
    await browser?.close();
    for (const a of accounts) {
      await pool.query("DELETE FROM organizations WHERE id=$1", [
        a.organization.id,
      ]);
      await pool.query("DELETE FROM users WHERE id=$1", [a.user.id]);
    }
    await pool.end();
  }
});
