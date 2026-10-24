import { Fragment, type ReactNode } from "react";

// Minimal, safe Markdown → React for policies, contracts and knowledge articles.
// Supports #/##/### headings, paragraphs, "-" and "1." lists and **bold**.
// Never uses dangerouslySetInnerHTML: any HTML in the source shows as text (Security #5).

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const cls = level === 1 ? "mt-6 text-[17px] font-semibold" : level === 2 ? "mt-5 text-[15px] font-semibold" : "mt-4 text-[13.5px] font-semibold";
      blocks.push(<p key={i} role="heading" aria-level={level + 1} className={`${cls} tracking-[-0.01em] text-ink first:mt-0`}>{inline(h[2]!)}</p>);
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={i} className={`mt-2 grid gap-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3})\s/.test(lines[i]!) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(<p key={i} className="mt-2.5">{inline(para.join(" "))}</p>);
  }
  return <div className={`text-[13.5px] leading-6 text-ink-2 ${className ?? ""}`}>{blocks}</div>;
}
