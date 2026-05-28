import { describe, expect, it, mock } from "bun:test";

mock.module("got-scraping", () => {
  return {
    gotScraping: mock((options: any) => {
      return Promise.resolve({
        statusCode: 200,
        url: "https://example.com/redirected",
        headers: {
          "content-type": "text/html",
        },
        body: "<html><head><title>Example Product</title></head><body>Product body text</body></html>",
      });
    }),
  };
});

import { HttpPageAcquisition, cleanHtmlToText } from "../src/pipeline/acquisition/http-page-acquisition";

describe("HttpPageAcquisition", () => {
  const context = { now: new Date() };
  const brief = {
    input: {} as any,
    resolvedInput: {} as any,
    constraints: {} as any,
  };

  it("cleanHtmlToText removes head, scripts, nav, header, footer and formats text", () => {
    const html = `
      <html>
        <head>
          <title>Test Title</title>
          <style>body { color: red; }</style>
        </head>
        <body>
          <header>Welcome Header</header>
          <nav><a href="/">Home</a></nav>
          <h1>Real Product Content</h1>
          <script>console.log("hello");</script>
          <p>This is a paragraph with &amp; entity.</p>
          <footer>Footer Copyright</footer>
        </body>
      </html>
    `;
    const text = cleanHtmlToText(html);
    expect(text).toBe("Real Product Content This is a paragraph with & entity.");
  });

  it("acquires page successfully using got-scraping mock", async () => {
    const acq = new HttpPageAcquisition();
    const page = await acq.acquirePage("https://example.com", brief, context);
    expect(page.statusCode).toBe(200);
    expect(page.finalUrl).toBe("https://example.com/redirected");
    expect(page.title).toBe("Example Product");
    expect(page.text).toBe("Product body text");
  });
});
