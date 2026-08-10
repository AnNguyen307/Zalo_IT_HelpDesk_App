import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const miniFile = (name) => new URL(`../../miniapp/${name}`, import.meta.url);

test("Client home hero keeps status and greeting in responsive flow", async () => {
  const [home, styles] = await Promise.all([
    readFile(miniFile("src/pages/HomePage.tsx"), "utf8"),
    readFile(miniFile("src/styles.css"), "utf8"),
  ]);

  assert.match(home, /className="hero-meta"/);
  assert.match(home, /className="service-status"/);
  assert.doesNotMatch(home, /Có kỹ thuật viên/);
  assert.match(styles, /\.hero:before \{\s*display: none;/);
  assert.match(styles, /\.hero h1 \{[\s\S]*?color: #fff;/);
  assert.match(styles, /\.hero-kicker \{[\s\S]*?color: #bfd2f4;/);
  assert.match(styles, /\.hero \.secondary \{[\s\S]*?color: #f4f6f8;/);
  assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*?grid-template-areas:[\s\S]*?"copy"[\s\S]*?"trust";/);
});
