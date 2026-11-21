import test from "node:test";
import assert from "node:assert/strict";
import { parseMarkdownLite, visibleJournalPages } from "../journal.js";

test("journal markdown-lite produces safe data AST for hostile input", () => {
  const ast = parseMarkdownLite('# <img src=x onerror=alert(1)>\n**bold** *italics* [safe](https://example.com) [bad](javascript:alert(1))\n- one\n- <script>alert(1)</script>');
  assert.equal(ast[0].type, "heading");
  assert.equal(ast[0].children[0].value, "<img src=x onerror=alert(1)>");
  assert.equal(ast[1].children[0].type, "strong");
  assert.equal(ast[1].children[4].type, "link");
  assert.equal(ast[1].children.at(-1).type, "text");
  assert.equal(ast[2].type, "list");
  assert.equal(ast[2].items[1][0].value, "<script>alert(1)</script>");
});

test("journal markdown-lite supports headings, emphasis, links and line breaks", () => {
  const ast = parseMarkdownLite("## Heading\nline one\nline two");
  assert.deepEqual(ast.map((x) => x.type), ["heading", "line", "line"]);
  assert.equal(ast[0].level, 2);
  assert.equal(ast[1].children[0].value, "line one");
});

test("players only receive shared pages, while GM sees private pages in order", () => {
  const pages = { b: { title: "B", shared: true, order: 2 }, a: { title: "A", shared: false, order: 1 }, c: { title: "C", shared: true, order: 1 } };
  assert.deepEqual(visibleJournalPages(pages).map((p) => p.id), ["c", "b"]);
  assert.deepEqual(visibleJournalPages(pages, true).map((p) => p.id), ["a", "c", "b"]);
});
