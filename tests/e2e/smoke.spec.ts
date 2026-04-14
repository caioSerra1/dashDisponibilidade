import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("login redireciona visitante", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
    await expect(page.getByRole("heading", { name: /Dash Disponibilidade/i })).toBeVisible();
  });

  test("credenciais inválidas mostram erro", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nope@nope.test");
    await page.getByLabel("Senha").fill("wrongwrong");
    await page.getByRole("button", { name: /Entrar/i }).click();
    await expect(page.getByText(/Credenciais inválidas/i)).toBeVisible();
  });
});
