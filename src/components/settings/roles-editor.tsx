"use client";

import { Copy, Lock, ShieldCheck, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { cloneRoleAction, deleteRoleAction, saveRoleAction } from "@/server/modules/admin/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { ConfirmButton } from "@/ui/confirm";
import { Field, Input } from "@/ui/field";
import { useAction } from "@/ui/use-action";

type Scope = "OWN" | "UNIT" | "ALL";
type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  requires2fa: boolean;
  users: number;
  permissions: { module: string; action: string; scope: Scope }[];
};
type Mod = { key: string; label: string; group: string; sensitive: boolean };

const NEXT: Record<string, Scope | ""> = { "": "OWN", OWN: "UNIT", UNIT: "ALL", ALL: "" };
const CELL: Record<string, string> = {
  "": "text-ink-3/50",
  OWN: "bg-surface-3 text-ink-2",
  UNIT: "bg-accent-soft text-accent-ink",
  ALL: "bg-accent text-white",
};
const SHORT: Record<string, string> = { "": "—", OWN: "Own", UNIT: "Unit", ALL: "All" };

export function RolesEditor({ roles, modules, actions, canEdit }: { roles: Role[]; modules: Mod[]; actions: string[]; canEdit: boolean }) {
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? "");
  const role = roles.find((r) => r.id === selectedId) ?? roles[0];
  const [draft, setDraft] = useState<Record<string, Record<string, Scope | "">>>({});
  const [meta, setMeta] = useState<{ name: string; description: string; requires2fa: boolean } | null>(null);
  const save = useAction(saveRoleAction, { success: "Role saved", onSuccess: () => setDraft((d) => ({ ...d, [role!.id]: {} })) });
  const clone = useAction(cloneRoleAction, { success: "Role copied", onSuccess: (r) => setSelectedId(r.id) });
  const remove = useAction(deleteRoleAction, { success: "Role deleted", onSuccess: () => setSelectedId(roles[0]?.id ?? "") });

  const base = useMemo(() => Object.fromEntries((role?.permissions ?? []).map((p) => [`${p.module}:${p.action}`, p.scope])), [role]);
  const edits = role ? (draft[role.id] ?? {}) : {};
  const value = (m: string, a: string): Scope | "" => (`${m}:${a}` in edits ? edits[`${m}:${a}`]! : ((base[`${m}:${a}`] as Scope | undefined) ?? "")) as Scope | "";
  const dirty = Object.keys(edits).length > 0 || meta !== null;
  const groups = useMemo(() => [...new Set(modules.map((m) => m.group))], [modules]);

  if (!role) return null;
  const set = (m: string, a: string) => {
    if (!canEdit) return;
    setDraft((d) => ({ ...d, [role.id]: { ...(d[role.id] ?? {}), [`${m}:${a}`]: NEXT[value(m, a)]! } }));
  };
  const submit = () => {
    const perms: { module: string; action: string; scope: Scope }[] = [];
    for (const m of modules) for (const a of actions) {
      const v = value(m.key, a);
      if (v) perms.push({ module: m.key, action: a, scope: v });
    }
    void save.run({ roleId: role.id, name: meta?.name ?? role.name, description: meta?.description ?? role.description ?? "", requires2fa: meta?.requires2fa ?? role.requires2fa, permissions: perms });
    setMeta(null);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Card padded={false} className="h-fit">
        <ul className="p-1.5">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => {
                  setSelectedId(r.id);
                  setMeta(null);
                }}
                className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px]", r.id === role.id ? "bg-surface-2 font-medium" : "hover:bg-surface-2/60")}
              >
                <span className="flex-1 truncate">{r.name}</span>
                <span className="inline-flex items-center gap-1 text-2xs text-ink-3 tabular">
                  <Users className="size-3" />
                  {r.users}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="grid gap-3">
              <Field label="Role name" htmlFor="r-name">
                <Input id="r-name" disabled={!canEdit} value={meta?.name ?? role.name} onChange={(e) => setMeta({ name: e.target.value, description: meta?.description ?? role.description ?? "", requires2fa: meta?.requires2fa ?? role.requires2fa })} />
              </Field>
              <Field label="Description" htmlFor="r-desc">
                <Input id="r-desc" disabled={!canEdit} value={meta?.description ?? role.description ?? ""} onChange={(e) => setMeta({ name: meta?.name ?? role.name, description: e.target.value, requires2fa: meta?.requires2fa ?? role.requires2fa })} />
              </Field>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={meta?.requires2fa ?? role.requires2fa}
                  onChange={(e) => setMeta({ name: meta?.name ?? role.name, description: meta?.description ?? role.description ?? "", requires2fa: e.target.checked })}
                  className="size-3.5 accent-[hsl(var(--accent))]"
                />
                <ShieldCheck className="size-3.5 text-ink-3" /> Require two-factor sign-in
              </label>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2 sm:flex-col">
                <Button variant="primary" disabled={!dirty} loading={save.pending} onClick={submit}>
                  Save changes
                </Button>
                <Button variant="secondary" loading={clone.pending} onClick={() => clone.run({ roleId: role.id, name: `${role.name} (copy)` })}>
                  <Copy className="size-3.5" /> Clone
                </Button>
                {!role.isSystem && (
                  <ConfirmButton title={`Delete ${role.name}?`} body="Only possible when nobody holds this role." danger confirmLabel="Delete role" onConfirm={() => remove.run(role.id)}>
                    <Button variant="ghost" className="text-danger">
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  </ConfirmButton>
                )}
              </div>
            )}
          </div>
          <p className="mt-4 text-2xs text-ink-3">
            Click a cell to cycle: — → Own records → Own unit → All units. <Lock className="inline size-3" /> marks sensitive permissions (salaries, bank details, buy rates, margins, payroll, exports, roles). Enforced on the server for every page and query.
          </p>
        </Card>

        <Card padded={false}>
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line">
                  <th className="h-9 pl-4 text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-ink-3">Module</th>
                  {actions.map((a) => (
                    <th key={a} className="w-[76px] text-center text-[11.5px] font-medium uppercase tracking-[0.04em] text-ink-3">
                      {a.toLowerCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g}>
                  <tr>
                    <td colSpan={actions.length + 1} className="bg-surface-2/60 px-4 py-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                      {g}
                    </td>
                  </tr>
                  {modules
                    .filter((m) => m.group === g)
                    .map((m) => (
                      <tr key={m.key} className="border-b border-line last:border-0">
                        <td className="py-1.5 pl-4 pr-2">
                          <span className="inline-flex items-center gap-1.5">
                            {m.sensitive && <Lock className="size-3 text-warning" aria-label="Sensitive" />}
                            {m.label}
                          </span>
                        </td>
                        {actions.map((a) => {
                          const v = value(m.key, a);
                          const changed = `${m.key}:${a}` in edits;
                          return (
                            <td key={a} className="px-1 py-1 text-center">
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() => set(m.key, a)}
                                aria-label={`${m.label} ${a.toLowerCase()}: ${SHORT[v]}`}
                                className={cn("h-6 w-[60px] rounded-[5px] text-2xs font-medium transition-colors disabled:cursor-default", CELL[v], changed && "ring-2 ring-warning/60")}
                              >
                                {SHORT[v]}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              ))}
            </table>
          </div>
        </Card>
        {role.isSystem && <Badge className="w-fit">Default role — can be edited, not deleted</Badge>}
      </div>
    </div>
  );
}
