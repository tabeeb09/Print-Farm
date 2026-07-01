const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const baseUrl = 'http://localhost:3001';
const outDir = path.join(process.cwd(), '.codex-3d-test');
fs.mkdirSync(outDir, { recursive: true });
const fileName = `3d-printer-test-${Date.now()}.txt`;
const filePath = path.join(outDir, fileName);
fs.writeFileSync(filePath, '3d printer project file test');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /sign in/i }).click();
    await Promise.race([
      page.waitForURL(/localhost:8080/, { timeout: 30000 }),
      page.waitForURL(/\/files$/, { timeout: 30000 }),
    ]);
    if (/localhost:8080/.test(page.url())) {
      await page.locator('#username').fill('localtester@example.com');
      await page.locator('#password').fill('LocalTest123!');
      await page.getByRole('button', { name: /sign in/i }).click();
    }
    await page.waitForURL(/\/files$/, { timeout: 30000 });
    await page.getByRole('heading', { name: /user files/i }).waitFor({ timeout: 10000 });
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(filePath);
    await page.getByRole('button', { name: /^Upload$/i }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const list = await page.evaluate(async () => {
      const response = await fetch('/api/files', { cache: 'no-store' });
      const payload = await response.json();
      return { status: response.status, payload };
    });
    const uploaded = list.payload.files.find((file) => file.originalFilename === fileName);
    if (!uploaded) throw new Error(`Uploaded file not found: ${JSON.stringify(list)}`);
    await Promise.all([
      page.waitForResponse((response) => response.url().includes(`/api/files/${uploaded.id}`) && response.request().method() === 'DELETE' && response.status() === 200),
      page.locator('tbody tr').filter({ hasText: fileName }).first().getByRole('button', { name: /^Delete$/i }).click(),
    ]);
    await page.goto(`${baseUrl}/api/auth/signout?callbackUrl=%2F`, { waitUntil: 'networkidle' });
    const signOutButton = page.getByRole('button', { name: /sign out/i });
    if (await signOutButton.count()) {
      await signOutButton.click();
      await page.waitForLoadState('networkidle');
    }
    console.log(JSON.stringify({ ok: true, fileName, deletedId: uploaded.id }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
