// @ts-nocheck
// ─── AIMessage — lightweight markdown renderer (no external deps) ────────────
// Handles: headings, bold, italic, inline-code, code blocks, lists, tables,
// blockquotes, horizontal rules, and links — everything the AI model produces.

import { Fragment } from "react";

// ── inline parser ─────────────────────────────────────────────────────────────

function parseInline(text: string): React.ReactNode[] {
  // Patterns: **bold**, *italic*, `code`, [link](url)
  const parts: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2])      parts.push(<strong key={key++} className="font-semibold">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={key++} className="italic">{m[3]}</em>);
    else if (m[4]) parts.push(
      <code key={key++} className="tnum rounded px-1.5 py-0.5 text-xs"
        style={{ background: "var(--color-login-bg)" }}>{m[4]}</code>
    );
    else if (m[5]) parts.push(
      <a key={key++} href={m[6]} target="_blank" rel="noreferrer"
        style={{ color: "var(--color-accent)", textDecoration: "underline" }}>{m[5]}</a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ── block parser ──────────────────────────────────────────────────────────────

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "hr" }
  | { type: "blockquote"; lines: string[] }
  | { type: "code"; lang: string; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "p"; text: string };

function parseBlocks(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Headings
    const hm = line.match(/^(#{1,3})\s+(.*)/);
    if (hm) {
      const level = hm[1]!.length;
      blocks.push({ type: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text: hm[2]! });
      i++; continue;
    }

    // HR
    if (/^[-*_]{3,}$/.test(line.trim())) { blocks.push({ type: "hr" }); i++; continue; }

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) { codeLines.push(lines[i]!); i++; }
      i++;
      blocks.push({ type: "code", lang, lines: codeLines });
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const bqLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) {
        bqLines.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", lines: bqLines });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^[-*+]\s/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // GFM table  |col|col|
    if (line.startsWith("|") && lines[i + 1]?.match(/^\|[-| :]+\|$/)) {
      const parseRow = (r: string) =>
        r.split("|").map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      const head = parseRow(line);
      i += 2; // skip separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) {
        rows.push(parseRow(lines[i]!));
        i++;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    // Blank line — skip
    if (!line.trim()) { i++; continue; }

    // Paragraph — accumulate until blank line or block element
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !lines[i]!.match(/^(#{1,3}\s|```|>|[-*+]\s|\d+\.\s)/) &&
      !lines[i]!.startsWith("|")
    ) {
      pLines.push(lines[i]!);
      i++;
    }
    if (pLines.length) blocks.push({ type: "p", text: pLines.join(" ") });
  }

  return blocks;
}

// ── renderer ──────────────────────────────────────────────────────────────────

function renderBlock(block: Block, idx: number): React.ReactNode {
  switch (block.type) {
    case "h1":
    case "h2":
      return (
        <h3 key={idx} className="mt-5 mb-2 text-base font-semibold"
          style={{ fontFamily: "var(--font-heading)" }}>
          {parseInline(block.text)}
        </h3>
      );
    case "h3":
      return (
        <h4 key={idx} className="mt-4 mb-1.5 text-sm font-semibold">
          {parseInline(block.text)}
        </h4>
      );
    case "hr":
      return <div key={idx} className="my-4 h-px" style={{ background: "var(--hairline)" }} />;
    case "blockquote":
      return (
        <blockquote key={idx} className="mb-3 rounded-r-xl py-2 pl-3 text-sm"
          style={{ borderLeft: "2px solid var(--color-accent)", color: "var(--ink-2)" }}>
          {block.lines.map((l, j) => <p key={j}>{parseInline(l)}</p>)}
        </blockquote>
      );
    case "code":
      return (
        <pre key={idx} className="mb-3 overflow-x-auto rounded-xl p-4 text-xs"
          style={{ background: "var(--color-login-bg)", fontFamily: "monospace" }}>
          <code>{block.lines.join("\n")}</code>
        </pre>
      );
    case "ul":
      return (
        <ul key={idx} className="mb-3 list-disc space-y-1 pl-5">
          {block.items.map((item, j) => (
            <li key={j} style={{ color: "var(--ink-2)" }}>{parseInline(item)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={idx} className="mb-3 list-decimal space-y-1 pl-5">
          {block.items.map((item, j) => (
            <li key={j} style={{ color: "var(--ink-2)" }}>{parseInline(item)}</li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div key={idx} className="mb-4 overflow-x-auto rounded-xl bg-white"
          style={{ border: "1px solid var(--hairline)", maxWidth: "100%" }}>
          <table className="w-full min-w-full border-collapse text-xs">
            <thead style={{ background: "var(--color-login-bg)" }}>
              <tr>
                {block.head.map((h, j) => (
                  <th key={j} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap"
                    style={{ color: "var(--ink-2)", borderBottom: "1px solid var(--hairline)", minWidth: "80px" }}>
                    {parseInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, j) => (
                <tr key={j} style={{ borderTop: "1px solid var(--hairline)" }}>
                  {row.map((cell, k) => (
                    <td key={k} className="tnum px-3 py-2.5 align-top whitespace-nowrap">{parseInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "p":
      return (
        <p key={idx} className="mb-3" style={{ color: "var(--ink-2)" }}>
          {parseInline(block.text)}
        </p>
      );
    default:
      return null;
  }
}

// ── Public component ──────────────────────────────────────────────────────────

export function AIMessage({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="auditx-md text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
      {blocks.map((b, i) => <Fragment key={i}>{renderBlock(b, i)}</Fragment>)}
    </div>
  );
}
