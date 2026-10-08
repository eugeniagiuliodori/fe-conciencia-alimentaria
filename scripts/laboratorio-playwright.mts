import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: false,
});

const context = await browser.newContext();

const page = await context.newPage();

await page.goto("https://example.org");

console.log("Título:", await page.title());
console.log("URL:", page.url());

await page.pause();
await page.waitForTimeout(10000);

/*
await page.locator("button").waitFor();
eso solo espera que el elemento exista/sea visible, no que vos hagas clic.
*/

/*
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
const rl = readline.createInterface({ input, output });
await rl.question("Presioná Enter para continuar...");
rl.close();
*/

await browser.close();