import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { NextResponse } from "next/server";

import { isSafeSourcePath } from "@/lib/source-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function documentsRoot(): string {
  return resolve(process.cwd(), "documents");
}

function fileFor(relative: string): string | null {
  if (!isSafeSourcePath(relative)) return null;
  const root = documentsRoot();
  const full = resolve(root, relative);
  if (full !== root && !full.startsWith(`${root}${sep}`)) return null;
  return full;
}

function filename(relative: string): string {
  return relative.split("/").pop() ?? "contract.pdf";
}

async function load(relative: string): Promise<{ bytes: Buffer; name: string } | null> {
  const file = fileFor(relative);
  if (!file) return null;
  try {
    return { bytes: await readFile(file), name: filename(relative) };
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const found = await load(path.join("/"));
  if (!found) {
    return NextResponse.json({ error: "That source PDF is not in the demo store." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(found.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${found.name}"`,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function HEAD(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const found = await load(path.join("/"));
  if (!found) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(found.bytes.length),
      "content-disposition": `inline; filename="${found.name}"`,
    },
  });
}
