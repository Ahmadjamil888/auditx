import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders streamed assistant markdown in the AuditX visual language. */
export function AIMessage({ text }: { text: string }) {
  return (
    <div className="auditx-md text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h3 className="mt-5 mb-2 text-base font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-5 mb-2 text-base font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-4 mb-1.5 text-sm font-semibold">{children}</h4>
          ),
          p: ({ children }) => <p className="mb-3">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li style={{ color: "var(--ink-2)" }}>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)" }}>
              {children}
            </a>
          ),
          hr: () => <div className="my-4 h-px" style={{ background: "var(--hairline)" }} />,
          blockquote: ({ children }) => (
            <blockquote
              className="mb-3 rounded-r-xl py-2 pl-3 text-sm"
              style={{ borderLeft: "2px solid var(--color-accent)", color: "var(--ink-2)" }}
            >
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code
              className="tnum rounded px-1.5 py-0.5 text-xs"
              style={{ background: "var(--color-login-bg)" }}
            >
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div
              className="mb-4 overflow-x-auto rounded-xl bg-white"
              style={{ border: "1px solid var(--hairline)" }}
            >
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ background: "var(--color-login-bg)" }}>{children}</thead>
          ),
          th: ({ children }) => (
            <th
              className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap"
              style={{ color: "var(--ink-2)", borderBottom: "1px solid var(--hairline)" }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              className="tnum px-3 py-2.5 align-top"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              {children}
            </td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
