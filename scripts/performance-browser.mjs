import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  assert.ok(input.length < 16384, "Invalid browser fixture input");
}
const fixture = JSON.parse(input);
for (const value of [fixture.frontendOrigin, fixture.apiOrigin]) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.origin, value);
}
assert.ok(/^\/order\/[A-Za-z0-9_-]+$/.test(fixture.qrPath));
const vitalsSource = await readFile(
  require.resolve("next/dist/compiled/web-vitals"),
  "utf8",
);
const browser = await chromium.launch({
  channel: process.env.BENCHMARK_BROWSER_CHANNEL || "msedge",
  headless: true,
});
const results = [];
let phase = "browser-start";
let observations;

// EN: Route only the reserved build placeholder to the isolated API; deny every other external origin and keep release validation intact.
// FI: Ohjaa vain koontiversion varattu testiosoite eristettyyn API:in; estä muut ulkoiset osoitteet ja säilytä julkaisutarkistus.
async function contextFor(profile) {
  const context = await browser.newContext({
    viewport: profile.mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    serviceWorkers: "block",
  });
  const requests = {
    total: 0,
    api: 0,
    images: 0,
    decodedBodyBytes: 0,
    frontendDecodedBodyBytes: 0,
    imageBodyBytes: 0,
    errors: 0,
    externalBlocked: 0,
    unavailableBodyReads: 0,
  };
  const pending = new Set();
  // EN: Report static categories and delivery timings only; URLs, access tokens and response bodies stay out of diagnostics.
  // FI: Raportoi vain kiinteät luokat ja toimitusajat; URL-osoitteet, käyttöoikeustokenit ja vastaussisällöt eivät kuulu diagnostiikkaan.
  const starts = new WeakMap();
  const timings = new Map();
  const apiDelivery = [];
  const timingSummary = () =>
    [...timings].map(([name, samples]) => ({
      name,
      samples: samples.length,
      maxMs: +Math.max(...samples).toFixed(1),
      averageMs: +(
        samples.reduce((sum, value) => sum + value, 0) / samples.length
      ).toFixed(1),
    }));
  const recordTiming = (name, request) => {
    const started = starts.get(request);
    if (started === undefined) return;
    const samples = timings.get(name) ?? [];
    samples.push(performance.now() - started);
    timings.set(name, samples);
  };
  const apiLabel = (pathname) =>
    pathname.endsWith("/menu")
      ? "qr-menu"
      : pathname.endsWith("/context")
        ? "qr-context"
        : "api-other";
  const imageKinds = { card: 0, detail: 0, original: 0 };
  context.on("request", (request) => {
    starts.set(request, performance.now());
    if (request.url() !== "about:blank") requests.total++;
  });
  context.on("response", (response) => {
    const task = (async () => {
      const url = new URL(response.url());
      if (response.status() >= 400) requests.errors++;
      if (url.origin === fixture.frontendOrigin) {
        requests.frontendDecodedBodyBytes += (await response.body()).length;
        recordTiming(
          "frontend-" + response.request().resourceType(),
          response.request(),
        );
      }
      if (url.origin === "https://api.example.invalid") {
        const data = await response.body();
        recordTiming(
          url.pathname.startsWith("/uploads/")
            ? "api-image"
            : apiLabel(url.pathname),
          response.request(),
        );
        requests.decodedBodyBytes += data.length;
        if (url.pathname.startsWith("/uploads/")) {
          requests.images++;
          requests.imageBodyBytes += data.length;
          imageKinds[
            url.pathname.includes("/variants/card/")
              ? "card"
              : url.pathname.includes("/variants/detail/")
                ? "detail"
                : "original"
          ]++;
        } else requests.api++;
      }
    })()
      .catch(() => {
        requests.unavailableBodyReads++;
      })
      .finally(() => pending.delete(task));
    pending.add(task);
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === fixture.frontendOrigin) return route.continue();
    if (url.origin !== "https://api.example.invalid") {
      requests.externalBlocked++;
      return route.abort();
    }
    const backendStarted = performance.now();
    const response = await route.fetch({
      url: fixture.apiOrigin + url.pathname + url.search,
      timeout: 20000,
    });
    const body = await response.body();
    const backendMs = performance.now() - backendStarted;
    const injectedDelayMs = profile.slow
      ? 150 + (body.length / 200000) * 1000
      : 0;
    if (!url.pathname.startsWith("/uploads/"))
      apiDelivery.push({
        name: apiLabel(url.pathname),
        decodedBodyBytes: body.length,
        backendMs: +backendMs.toFixed(1),
        injectedDelayMs: +injectedDelayMs.toFixed(1),
      });
    // EN: Fulfilled API traffic uses explicit latency/bandwidth injection; it is a lab approximation, not a real mobile network.
    // FI: Täytetty API-liikenne käyttää erikseen lisättyä viivettä ja kaistarajaa; kyse on laboratorioarviosta, ei aidosta mobiiliverkosta.
    if (profile.slow)
      await new Promise((resolve) => setTimeout(resolve, injectedDelayMs));
    await route.fulfill({ response, body });
  });
  const vitals = {};
  await context.exposeBinding(
    "recordBenchmarkVital",
    (_source, name, value) => {
      vitals[name] = value;
    },
  );
  await context.addInitScript({
    content: `(() => { if (location.origin !== ${JSON.stringify(fixture.frontendOrigin)}) return;
    const module = { exports: {} }; const exports = module.exports; const __dirname = "";
    ${vitalsSource}
    for (const name of ["LCP", "CLS", "INP", "TTFB", "FCP"]) {
      module.exports["on" + name]?.(metric => window.recordBenchmarkVital(metric.name, metric.value), { reportAllChanges: true });
    }
  })();`,
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send("Performance.enable");
  page.setDefaultTimeout(20000);
  let pageErrors = 0;
  page.on("pageerror", () => pageErrors++);
  if (profile.slow) {
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 200000,
      uploadThroughput: 93750,
    });
  }
  return {
    context,
    page,
    requests,
    imageKinds,
    vitals,
    pending,
    timingSummary,
    apiDelivery,
    pageErrors: () => pageErrors,
    rendererSnapshot: async () => {
      const counters = await session.send("Memory.getDOMCounters");
      const { metrics } = await session.send("Performance.getMetrics");
      const heap = metrics.find(
        (metric) => metric.name === "JSHeapUsedSize",
      )?.value;
      return {
        ...counters,
        jsHeapUsedMiB: heap === undefined ? null : +(heap / 2 ** 20).toFixed(1),
      };
    },
  };
}

async function qrCase(profile) {
  phase = profile.name + "/context";
  const state = await contextFor(profile);
  observations = state.requests;
  const { page, context, requests, imageKinds } = state;
  try {
    const start = performance.now();
    phase = profile.name + "/navigation";
    await page.goto(fixture.frontendOrigin + fixture.qrPath);
    const details = page.getByRole("button", { name: /^Katso tiedot:/ });
    phase = profile.name + "/menu";
    await details.first().waitFor();
    const menuReadyMs = performance.now() - start;
    const cards = await details.count();
    assert.equal(cards, 12);
    // EN: Finish initial image requests before asserting lazy detail delivery; images shared by many foods are reported explicitly.
    // FI: Odota alkuperäiset kuvapyynnöt ennen yksityiskohtien laiskan latauksen tarkistusta; monen ruoan jakamat kuvat ilmoitetaan erikseen.
    await page.waitForFunction(() =>
      [...document.images]
        .filter((img) => {
          const bounds = img.getBoundingClientRect();
          return bounds.top < innerHeight && bounds.bottom > 0;
        })
        .every((img) => img.complete),
    );
    await Promise.all([...state.pending]);
    assert.equal(imageKinds.detail, 0);
    assert.equal(imageKinds.original, 0);
    const initialImages = { ...imageKinds };
    const domElements = await page.locator("*").count();
    const renderer = await state.rendererSnapshot();
    const detailStart = performance.now();
    phase = profile.name + "/detail";
    await details.first().click();
    await page.getByRole("dialog").waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[role="dialog"] img')].every(
        (img) => img.complete,
      ),
    );
    await Promise.all([...state.pending]);
    assert.ok(imageKinds.detail > 0);
    const detailReadyMs = performance.now() - detailStart;
    phase = profile.name + "/pagination";
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Seuraava", exact: true }).click();
    await page.waitForTimeout(500);
    assert.equal(await details.count(), 12);
    await page.waitForTimeout(250);
    await page.goto("about:blank");
    await Promise.all([...state.pending]);
    results.push({
      name: profile.name,
      menuReadyMs: +menuReadyMs.toFixed(1),
      detailReadyMs: +detailReadyMs.toFixed(1),
      cards,
      domElements,
      renderer,
      initialImages,
      imageKinds: { ...imageKinds },
      requests: { ...requests },
      requestTimings: state.timingSummary(),
      apiDelivery: state.apiDelivery,
      webVitals: {
        LCP: null,
        CLS: null,
        INP: null,
        TTFB: null,
        FCP: null,
        ...state.vitals,
      },
      pageErrors: state.pageErrors(),
    });
    assert.equal(requests.errors, 0);
    assert.equal(state.pageErrors(), 0);
  } finally {
    await context.close();
  }
}

async function loginCase() {
  phase = "login/context";
  const state = await contextFor({ mobile: false, slow: false });
  observations = state.requests;
  try {
    const { page } = state;
    phase = "login/navigation";
    await page.goto(fixture.frontendOrigin + "/signin");
    await page.getByLabel("Käyttäjätunnus").fill(fixture.username);
    await page.getByLabel("Salasana").fill(fixture.password);
    const start = performance.now();
    await page.getByRole("button", { name: "Kirjaudu", exact: true }).click();
    phase = "login/redirect";
    await page.waitForURL("**/backoffice/sale");
    phase = "login/catalog";
    await page
      .getByRole("button", { name: /Benchmark menu/ })
      .first()
      .waitFor();
    const loginToMenuMs = performance.now() - start;
    const domElements = await page.locator("*").count();
    const renderer = await state.rendererSnapshot();
    await page.waitForLoadState("networkidle");
    await page.goto("about:blank");
    await Promise.all([...state.pending]);
    results.push({
      name: "desktop-login-sale",
      loginToMenuMs: +loginToMenuMs.toFixed(1),
      domElements,
      renderer,
      requests: state.requests,
      requestTimings: state.timingSummary(),
      apiDelivery: state.apiDelivery,
      webVitals: state.vitals,
      pageErrors: state.pageErrors(),
    });
    assert.equal(state.requests.errors, 0);
    assert.equal(state.pageErrors(), 0);
  } finally {
    await state.context.close();
  }
}

try {
  await loginCase();
  for (let sample = 1; sample <= 3; sample++) {
    for (const profile of [
      { name: "desktop-qr", mobile: false, slow: false },
      { name: "mobile-qr", mobile: true, slow: false },
      { name: "mobile-slow-qr", mobile: true, slow: true },
    ])
      await qrCase({ ...profile, name: profile.name + "/sample-" + sample });
  }
  console.log(
    JSON.stringify({
      profiles: results,
      samplesPerQrProfile: 3,
      loginSamples: 1,
      cache: "fresh isolated contexts; Playwright routing disables HTTP cache",
      slowProfile:
        "390x844, 4x CPU, frontend CDP 150ms/1.6Mbps; API per-response delay 150ms + bytes/200000; no shared API bandwidth cap",
      browserVersion: browser.version(),
      limitations:
        "local desktop browser emulation; no real-device or field percentile/SLO claim",
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      failedPhase: phase,
      errorCategory: error.name,
      observations,
      profiles: results,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
