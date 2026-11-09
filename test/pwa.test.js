import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PUBLIC_DIR = path.resolve("public");

test("public/manifest.json: містить усі обов'язкові поля для PWA та валідні іконки", () => {
  const manifestPath = path.join(PUBLIC_DIR, "manifest.json");
  assert.equal(fs.existsSync(manifestPath), true, "manifest.json має існувати");

  const raw = fs.readFileSync(manifestPath, "utf8");
  let manifest;
  assert.doesNotThrow(() => { manifest = JSON.parse(raw); }, "manifest.json має бути валідним JSON");

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.lang, "uk");
  assert.ok(manifest.name && manifest.name.length > 0);
  assert.ok(manifest.short_name && manifest.short_name.length > 0);
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.theme_color);
  assert.ok(manifest.background_color);

  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "Маніфест має містити щонайменше 2 іконки");
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes("192x192"), "Має бути іконка 192x192");
  assert.ok(sizes.includes("512x512"), "Має бути іконка 512x512");

  for (const icon of manifest.icons) {
    const iconRel = icon.src.replace(/^\//, "");
    const iconPath = path.join(PUBLIC_DIR, iconRel);
    assert.equal(fs.existsSync(iconPath), true, `Іконка ${icon.src} має існувати на диску`);
    const stat = fs.statSync(iconPath);
    assert.ok(stat.size > 0, `Іконка ${icon.src} не повинна бути порожньою`);
  }
});

test("public/sw.js: містить актуальний APP_SHELL і всі зазначені файли існують на диску", () => {
  const swPath = path.join(PUBLIC_DIR, "sw.js");
  assert.equal(fs.existsSync(swPath), true, "sw.js має існувати");

  const swContent = fs.readFileSync(swPath, "utf8");
  assert.match(swContent, /const CACHE_NAME = ["']sho-po-svitlu-shell-v\d+["']/);
  assert.match(swContent, /self\.addEventListener\(["']install["']/);
  assert.match(swContent, /self\.addEventListener\(["']activate["']/);
  assert.match(swContent, /self\.addEventListener\(["']fetch["']/);

  const match = swContent.match(/const APP_SHELL = \[(.*?)\];/s);
  assert.ok(match, "sw.js має оголошувати масив APP_SHELL");

  const shellFiles = match[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

  assert.ok(shellFiles.length > 5, "APP_SHELL має містити основні файли додатку");

  for (const file of shellFiles) {
    const filePath = file === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, file.replace(/^\//, ""));
    assert.equal(fs.existsSync(filePath), true, `Файл з APP_SHELL '${file}' (${filePath}) має реально існувати`);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 0, `Файл з APP_SHELL '${file}' не повинен бути порожнім`);
  }
});

test("статичні іконки: favicon, apple-touch-icon та векторна іконка присутні та непорожні", () => {
  const requiredIcons = [
    "icons/apple-touch-icon.png",
    "icons/favicon-32.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon.svg",
  ];

  for (const rel of requiredIcons) {
    const full = path.join(PUBLIC_DIR, rel);
    assert.equal(fs.existsSync(full), true, `Файл ${rel} має існувати`);
    assert.ok(fs.statSync(full).size > 0, `Файл ${rel} не повинен бути порожнім`);
  }
});
