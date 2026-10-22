// Per-unit accent, used as a thin rail, a dot or a chart series — never a large fill.
export const UNIT_STYLE: Record<string, { dot: string; rail: string; label: string }> = {
  ACADEMY: { dot: "bg-unit-academy", rail: "before:bg-unit-academy", label: "Academy" },
  FIGUREWEB: { dot: "bg-unit-figureweb", rail: "before:bg-unit-figureweb", label: "FigureWeb" },
  TELECOM: { dot: "bg-unit-telecom", rail: "before:bg-unit-telecom", label: "Telecom" },
  HQ: { dot: "bg-unit-hq", rail: "before:bg-unit-hq", label: "HQ" },
};
