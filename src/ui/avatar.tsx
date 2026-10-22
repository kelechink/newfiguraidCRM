import { cn } from "./cn";

// Stable per-person tint so the same colleague always looks the same.
const HUES = [243, 262, 199, 168, 30, 340, 215, 12];

function hueFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

export function Avatar({ id, name, size = 22, className }: { id: string; name: string; size?: number; className?: string }) {
  const hue = hueFor(id);
  return (
    <span
      title={name}
      aria-label={name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-surface", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.4),
        background: `hsl(${hue} 70% 92%)`,
        color: `hsl(${hue} 55% 32%)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4 }: { people: { id: string; name: string }[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex -space-x-1">
      {shown.map((p) => (
        <Avatar key={p.id} id={p.id} name={p.name} />
      ))}
      {rest > 0 && (
        <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-surface-3 text-2xs font-semibold text-ink-2 ring-2 ring-surface">
          +{rest}
        </span>
      )}
    </span>
  );
}
