/**
 * Copy Patchbay's documents folder into this app.
 * The PDFs stay out of git. See documents/README.md.
 */

import { cp, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../patchbay/documents");
const dest = resolve(here, "../documents");

let names;
try {
  names = await readdir(source);
} catch {
  console.error(`No documents folder at ${source}. Run \`npm run sources\` in the patchbay repo first.`);
  process.exit(1);
}

await mkdir(dest, { recursive: true });
let copied = 0;
for (const name of names) {
  if (name === "README.md") continue;
  await cp(resolve(source, name), resolve(dest, name), { recursive: true });
  copied += 1;
}
console.log(`Imported ${copied} entr${copied === 1 ? "y" : "ies"} from ${source} into ${dest}`);
