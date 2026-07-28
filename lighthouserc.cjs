module.exports = {
  ci: {
    collect: {
      staticDistDir: "./apps/desktop/dist",
      isSinglePageApplication: true,
      url: ["http://localhost/", "http://localhost/esqueci-senha"],
      numberOfRuns: 2,
      settings: {
        preset: "desktop",
        chromeFlags: "--headless=new --no-sandbox --disable-dev-shm-usage",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.8 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        // Aplicação autenticada e deliberadamente não indexável; SEO é informativo.
        "categories:seo": ["warn", { minScore: 0.6 }],
        "first-contentful-paint": ["error", { maxNumericValue: 1800 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 300 }],
        "speed-index": ["error", { maxNumericValue: 3000 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
