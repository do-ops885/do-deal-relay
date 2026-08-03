import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

function readProjectFile(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("dashboard PWA assets", () => {
  it("defines an installable web app manifest", () => {
    const manifest = JSON.parse(
      readProjectFile("public/manifest.webmanifest"),
    ) as {
      name: string;
      short_name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };

    expect(manifest.name).toBe("do-deal-relay Dashboard");
    expect(manifest.short_name).toBe("Deal Relay");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual([
      {
        src: "/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ]);
  });

  it("registers the service worker from the dashboard shell", () => {
    const html = readProjectFile("public/index.html");

    expect(html).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
    expect(html).toContain(
      'navigator.serviceWorker.register("/sw.js", { scope: "/" })',
    );
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });

  it("keeps service-worker caching limited to same-origin static assets", () => {
    const serviceWorker = readProjectFile("public/sw.js");

    expect(serviceWorker).toContain('request.method !== "GET"');
    expect(serviceWorker).toContain(
      "new URL(request.url).origin !== self.location.origin",
    );
    expect(serviceWorker).toContain('path.startsWith("/css/")');
    expect(serviceWorker).toContain('path.startsWith("/js/")');
    expect(serviceWorker).not.toContain('path.startsWith("/api/")');
  });

  it("configures the Worker to serve public assets", () => {
    const config = readProjectFile("wrangler.jsonc");

    expect(config).toContain('"directory": "./public"');
    expect(config).toContain('"binding": "ASSETS"');
    expect(config).toContain('"not_found_handling": "single-page-application"');
  });
});
