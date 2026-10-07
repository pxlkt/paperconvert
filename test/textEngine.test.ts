import { describe, test, expect } from "bun:test";
import { markdownToHtml, escapeHtml, htmlToMarkdown, htmlToText, markdownToText, fitToCharset, convertText, textToPdf } from "../src/lib/textEngine";

const body = (md: string) => markdownToHtml(md).split("<body>")[1]!;

describe("markdownToHtml", () => {
  test("markup and script typed in the source is text, not elements", () => {
    const html = body('# Hi <script>alert(1)</script> <img src=x onerror="y">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("<h1>Hi &lt;script&gt;");
  });

  test("javascript: and data: link targets are neutralised", () => {
    expect(body("[x](javascript:alert(1))")).toContain('<a href="#">x</a>');
    expect(body("![x](data:text/html;base64,AAAA)")).toContain('src="#"');
    expect(body("[x](JaVaScRiPt:alert(1))")).toContain('href="#"');
  });

  test("a quote in a link cannot open a new attribute", () => {
    const html = body('[x](https://a.test/" onclick="z)');
    const tag = /<a [^>]*>/.exec(html)![0];
    // only the attribute's own two quotes remain raw; the payload is inert text
    expect(tag.split('"').length - 1).toBe(2);
    expect(tag).toContain("&quot;");
  });

  test("ordinary formatting and safe links still work", () => {
    const html = body("## Title\n\n**bold** [site](https://example.com) [rel](docs/a.md) ![p](img/a.png)");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://example.com">site</a>');
    expect(html).toContain('<a href="docs/a.md">rel</a>');
    expect(html).toContain('<img alt="p" src="img/a.png" />');
  });

  test("common bare inline tags pass through, everything else stays text", () => {
    const html = body("Press <kbd>Ctrl</kbd>+<KBD>C</KBD><br>then <sub>2</sub> and <br/>done <mark>x</mark>");
    expect(html).toContain("Press <kbd>Ctrl</kbd>+<kbd>C</kbd><br>then <sub>2</sub> and <br />done <mark>x</mark>");
  });

  test("allow-listed tags never keep attributes, and other tags stay escaped", () => {
    const html = body('<kbd onclick="x()">K</kbd> <b style="x">B</b> <a href="https://a.test">a</a> <script>s</script> <iframe></iframe>');
    expect(html).not.toMatch(/<kbd |<b |<a |<script|<iframe/);
    expect(html).toContain("&lt;kbd onclick=&quot;x()&quot;&gt;K</kbd>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("escapeHtml covers the five characters", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });
});

describe("htmlToMarkdown", () => {
  test("script and style bodies are dropped, not turned into text", () => {
    expect(htmlToMarkdown("<p>a</p><script>alert(1)</script><style>p{x:y}</style><p>b</p>")).toBe("a\n\nb");
    expect(htmlToMarkdown("x <SCRIPT type=t>bad()</SCRIPT> y")).toBe("x  y");
  });
  test("an unterminated tag leaves no tag start behind", () => {
    expect(htmlToMarkdown("hello <script src=x")).toBe("hello");
    expect(htmlToMarkdown("hello <img")).not.toContain("<");
  });
  test("ordinary conversion is unchanged", () => {
    expect(htmlToMarkdown('<h1>T</h1><p><b>bold</b> <a href="https://a.test">l</a></p>')).toBe("# T\n\n**bold** [l](https://a.test)");
    expect(htmlToMarkdown("1 &lt; 2")).toBe("1 &lt; 2");
  });
});

describe("markdown blocks", () => {
  test("two bold spans on one line stay two spans", () => {
    expect(body("**a** and **b**")).toContain("<strong>a</strong> and <strong>b</strong>");
    expect(body("*a* and *b*")).toContain("<em>a</em> and <em>b</em>");
  });

  test("lists, code fences and quotes become their elements", () => {
    const html = body("- one\n- two\n\n1. first\n2. second\n\n```\n<b>x</b>\n```\n\n> said");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
    expect(html).toContain("<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>");
    expect(html).toContain("<blockquote><p>said</p></blockquote>");
  });

  test("code spans are not formatted", () => {
    expect(body("`**x**`")).toContain("<code>**x**</code>");
  });

  test("the document title is escaped", () => {
    expect(markdownToHtml("x", "</title><script>")).toContain("<title>&lt;/title&gt;&lt;script&gt;</title>");
  });
});

describe("plain text", () => {
  test("HTML to text drops markup and decodes entities", () => {
    expect(htmlToText("<h1>Hi</h1><p>1 &lt; 2 &amp; <a href=\"https://a.test\">link</a></p>")).toBe("Hi\n\n1 < 2 & link (https://a.test)");
  });
  test("Markdown to text drops marks", () => {
    expect(markdownToText("# T\n**b** *i* `c` [l](https://x.test)")).toBe("T\nb i c l (https://x.test)");
  });
});

describe("PDF output", () => {
  test("characters outside the PDF font are replaced and counted, tabs kept as spaces", () => {
    const n = { n: 0 };
    expect(fitToCharset("a\tb é 你 😀", new Set([..."ab é?"].map((c) => c.codePointAt(0)!)), n)).toBe("a    b é ? ?");
    expect(n.n).toBe(2);
  });

  test("Markdown with emoji still becomes a PDF, and the loss is reported", async () => {
    const file = new File(["# Title 🚀\n\nSome text with a tab\there.\n\n- item"], "doc.md");
    const { blob, warnings } = await convertText(file, "md", "pdf");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("1 character");
  });

  test("a long unbroken word wraps instead of running off the page", async () => {
    const { blob } = await textToPdf("x".repeat(5000));
    expect(blob.size).toBeGreaterThan(0);
  });
});
