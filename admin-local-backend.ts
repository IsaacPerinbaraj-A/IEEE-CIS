import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Lets the /admin page read and write content files while running `npm run dev` on your own computer.
 * Only active in the dev server (never in the built site) and only for the data files and images.
 */
const ALLOWED = [/^src\/data\/[a-z-]+\.json$/, /^public\/images\/(team|events|achievements)\/[a-z0-9-]+\.(webp|jpg|jpeg|png)$/];
const allowed = (p: string) => ALLOWED.some(r => r.test(p)) && !p.includes("..");

export default function adminLocalBackend(): Plugin {
  return {
    name: "admin-local-backend",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      server.middlewares.use("/__admin", async (req, res) => {
        const send = (code: number, body: unknown) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
        // Only the computer running `npm run dev` may read or write files here. When the dev server is opened to the
        // Wi-Fi (vite --host) so a phone can preview the site, other devices must not be able to edit the content.
        const ip = req.socket.remoteAddress || "";
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return send(403, { error: "The local admin only works on the computer running npm run dev" });
        try {
          const url = new URL(req.url || "/", "http://localhost");
          if (req.method === "GET" && url.pathname === "/ping") return send(200, { ok: true, root: path.basename(root) });
          if (req.method === "GET" && url.pathname === "/file") {
            const p = url.searchParams.get("path") || "";
            if (!allowed(p)) return send(403, { error: "Path not allowed" });
            const text = await fs.readFile(path.join(root, p), "utf8").catch(() => null);
            return text === null ? send(404, { error: "Not found" }) : send(200, { path: p, text });
          }
          if (req.method === "POST" && url.pathname === "/commit") {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            const { files } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { files: { path: string; content: string; encoding: "utf-8" | "base64" }[] };
            for (const f of files) if (!allowed(f.path)) return send(403, { error: `Path not allowed: ${f.path}` });
            for (const f of files) {
              const full = path.join(root, f.path);
              await fs.mkdir(path.dirname(full), { recursive: true });
              await fs.writeFile(full, f.encoding === "base64" ? Buffer.from(f.content, "base64") : f.content);
            }
            return send(200, { ok: true, written: files.map(f => f.path) });
          }
          send(404, { error: "Unknown admin endpoint" });
        } catch (e) { send(500, { error: String(e) }); }
      });
    },
  };
}
