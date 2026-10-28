// Writes the lion as static files: the browser tab icon and a plain SVG for link previews and docs.
// Run after changing src/components/lion/lionSvg.ts:  npm run build-icons
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lionSvg } from "../src/components/lion/lionSvg.ts"; // Node strips the types

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(web, "public", "brand"), { recursive: true });
writeFileSync(join(web, "src", "app", "icon.svg"), lionSvg({ id: "icon", size: 512 }));
writeFileSync(join(web, "public", "brand", "lion.svg"), lionSvg({ id: "lion", size: 512, title: "Lion" }));
writeFileSync(join(web, "public", "brand", "lion-animated.svg"), lionSvg({ id: "lion", size: 512, animated: true, title: "Lion" }));
console.log("Wrote src/app/icon.svg and public/brand/lion*.svg");
