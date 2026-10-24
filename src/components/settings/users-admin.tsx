"use client";

import { KeyRound, Lock, LogOut, Mail, Plus, ShieldCheck, ShieldOff, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { ago, formatDay } from "@/lib/format";
import {
  addGrantAction,
  adminReset2faAction,
  adminSignOutAction,
  inviteUserAction,
  resendInviteAction,
  revokeGrantAction,
  updateUserAccessAction,
} from "@/server/modules/admin/actions";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { Menu } from "@/ui/menu";
import { StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { UNIT_STYLE } from "@/ui/units";
import { useAction } from "@/ui/use-action";
import { cn } from "@/ui/cn";

type Unit = { id: string; code: string; name: string };
type Role = { id: string; name: string; key: string };
type UserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  role: { id: string; name: string; key: string };
  primaryUnit: { id: string; code: string; name: string } | null;
  unitIds: string[];
  manager: { id: string; name: string } | null;
  has2fa: boolean;
  lastLoginAt: string | null;
  accessExpiresAt: string | null;
  grants: { id: string; module: string; action: string; scope: string; expiresAt: string | null; reason: string | null }[];
};

function UnitPicker({ units, primary, setPrimary, extra, setExtra }: { units: Unit[]; primary: string; setPrimary: (v: string) => void; extra: string[]; setExtra: (v: string[]) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Primary unit" htmlFor="u-primary">
        <Select id="u-primary" value={primary} onChange={(e) => setPrimary(e.target.value)}>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Also works in" hint="Widens their 'own unit' access.">
        <div className="flex flex-wrap gap-1.5">
          {units
            .filter((u) => u.id !== primary)
            .map((u) => {
              const on = extra.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setExtra(on ? extra.filter((x) => x !== u.id) : [...extra, u.id])}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium",
                    on ? "border-accent/40 bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", UNIT_STYLE[u.code]?.dot)} />
                  {UNIT_STYLE[u.code]?.label ?? u.name}
                </button>
              );
            })}
        </div>
      </Field>
    </div>
  );
}

function InviteDialog({ roles, units, users, onClose }: { roles: Role[]; units: Unit[]; users: UserRow[]; onClose: () => void }) {
  const [primary, setPrimary] = useState(units[0]?.id ?? "");
  const [extra, setExtra] = useState<string[]>([]);
  const [roleId, setRoleId] = useState(roles.find((r) => r.key === "staff")?.id ?? roles[0]?.id ?? "");
  const invite = useAction(inviteUserAction, { success: "Invite sent", onSuccess: onClose });
  const isAuditor = roles.find((r) => r.id === roleId)?.key === "auditor";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Invite someone"
        description="They get an email to set a password. Their contract pack is generated when HR completes onboarding."
        className="max-w-[560px]"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="invite" loading={invite.pending}>
              <Mail className="size-3.5" /> Send invite
            </Button>
          </>
        }
      >
        <form
          id="invite"
          className="grid gap-4"
          action={invite.formAction((f) => ({
            name: f.get("name"),
            email: f.get("email"),
            roleId,
            primaryUnitId: primary,
            unitIds: extra,
            managerId: f.get("managerId") || null,
            accessExpiresAt: f.get("expires") || null,
          }))}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="i-name" error={invite.errors.name}>
              <Input id="i-name" name="name" required autoFocus />
            </Field>
            <Field label="Work email" htmlFor="i-email" error={invite.errors.email}>
              <Input id="i-email" name="email" type="email" required />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" htmlFor="i-role">
              <Select id="i-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Manager" htmlFor="i-mgr">
              <Select id="i-mgr" name="managerId" defaultValue="">
                <option value="">No manager</option>
                {users
                  .filter((u) => u.status === "ACTIVE")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <UnitPicker units={units} primary={primary} setPrimary={setPrimary} extra={extra} setExtra={setExtra} />
          {isAuditor && (
            <Field label="Access expires" htmlFor="i-exp" hint="External auditors lose access automatically on this date.">
              <Input id="i-exp" name="expires" type="date" required />
            </Field>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccessDialog({ user, roles, units, users, canRoles, onClose }: { user: UserRow; roles: Role[]; units: Unit[]; users: UserRow[]; canRoles: boolean; onClose: () => void }) {
  const [primary, setPrimary] = useState(user.primaryUnit?.id ?? units[0]?.id ?? "");
  const [extra, setExtra] = useState(user.unitIds.filter((u) => u !== user.primaryUnit?.id));
  const save = useAction(updateUserAccessAction, { success: "Access updated", onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Access for ${user.name}`}
        description="Role and units decide what they can see. Changes are audited."
        className="max-w-[560px]"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="access" loading={save.pending}>
              Save
            </Button>
          </>
        }
      >
        <form
          id="access"
          className="grid gap-4"
          action={save.formAction((f) => ({
            userId: user.id,
            roleId: f.get("roleId"),
            primaryUnitId: primary,
            unitIds: extra,
            managerId: f.get("managerId") || null,
            status: f.get("status") || undefined,
            accessExpiresAt: f.get("expires") || null,
          }))}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" htmlFor="a-role" hint={canRoles ? undefined : "Roles with finance, payroll or margin access can only be assigned by the Super Admin."}>
              <Select id="a-role" name="roleId" defaultValue={user.role.id}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="a-status">
              <Select id="a-status" name="status" defaultValue={["ACTIVE", "ONBOARDING", "SUSPENDED"].includes(user.status) ? user.status : ""}>
                {!["ACTIVE", "ONBOARDING", "SUSPENDED"].includes(user.status) && <option value="">{user.status.toLowerCase()}</option>}
                <option value="ACTIVE">Active</option>
                <option value="ONBOARDING">Onboarding (contract unsigned)</option>
                <option value="SUSPENDED">Suspended (signs out now)</option>
              </Select>
            </Field>
          </div>
          <Field label="Manager" htmlFor="a-mgr">
            <Select id="a-mgr" name="managerId" defaultValue={user.manager?.id ?? ""}>
              <option value="">No manager</option>
              {users
                .filter((u) => u.id !== user.id && u.status === "ACTIVE")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Select>
          </Field>
          <UnitPicker units={units} primary={primary} setPrimary={setPrimary} extra={extra} setExtra={setExtra} />
          <Field label="Access expires" htmlFor="a-exp" hint="Optional. Used for external auditors and temporary staff.">
            <Input id="a-exp" name="expires" type="date" defaultValue={user.accessExpiresAt?.slice(0, 10) ?? ""} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GrantsDialog({ user, modules, canSensitive, onClose }: { user: UserRow; modules: { key: string; label: string; sensitive: boolean }[]; canSensitive: boolean; onClose: () => void }) {
  const add = useAction(addGrantAction, { success: "Permission granted" });
  const revoke = useAction(revokeGrantAction, { success: "Permission removed" });
  const label = (k: string) => modules.find((m) => m.key === k)?.label ?? k;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Extra permissions · ${user.name}`} description="On top of their role. Give an expiry for temporary access." className="max-w-[600px]">
        <ul className="mb-5 divide-y divide-line rounded-lg border border-line">
          {user.grants.length === 0 && <li className="p-3 text-[12.5px] text-ink-3">None — they have exactly what their role gives.</li>}
          {user.grants.map((g) => (
            <li key={g.id} className="flex items-center gap-3 p-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {label(g.module)} · {g.action.toLowerCase()} · {g.scope.toLowerCase()}
                </p>
                <p className="text-2xs text-ink-3">
                  {g.expiresAt ? `Expires ${formatDay(g.expiresAt, { weekday: true })}` : "No expiry"}
                  {g.reason && ` · ${g.reason}`}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => revoke.run(g.id)} disabled={revoke.pending}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-3"
          action={add.formAction((f) => ({ userId: user.id, module: f.get("module"), action: f.get("action"), scope: f.get("scope"), expiresAt: f.get("expires") || null, reason: f.get("reason") || undefined }))}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_120px_110px]">
            <Field label="Module" htmlFor="g-mod">
              <Select id="g-mod" name="module">
                {modules.map((m) => (
                  <option key={m.key} value={m.key} disabled={m.sensitive && !canSensitive}>
                    {m.sensitive ? "🔒 " : ""}
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Action" htmlFor="g-act">
              <Select id="g-act" name="action">
                {["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"].map((a) => (
                  <option key={a} value={a}>
                    {a.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Scope" htmlFor="g-scope">
              <Select id="g-scope" name="scope" defaultValue="UNIT">
                <option value="OWN">Own records</option>
                <option value="UNIT">Own unit</option>
                <option value="ALL">All units</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
            <Field label="Expires" htmlFor="g-exp">
              <Input id="g-exp" name="expires" type="date" />
            </Field>
            <Field label="Reason" htmlFor="g-reason">
              <Input id="g-reason" name="reason" placeholder="e.g. covering for Aisha's leave" maxLength={300} />
            </Field>
            <Button type="submit" variant="primary" loading={add.pending}>
              <Plus className="size-3.5" /> Grant
            </Button>
          </div>
        </form>
        {!canSensitive && <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-3"><Lock className="size-3" /> Salaries, bank details, buy rates, margins, payroll and exports can only be granted by the Super Admin.</p>}
      </DialogContent>
    </Dialog>
  );
}

export function UsersAdmin({
  users,
  roles,
  units,
  modules,
  me,
  can,
}: {
  users: UserRow[];
  roles: Role[];
  units: Unit[];
  modules: { key: string; label: string; sensitive: boolean }[];
  me: string;
  can: { invite: boolean; edit: boolean; grants: boolean; roles: boolean };
}) {
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [grantingId, setGranting] = useState<string | null>(null);
  const granting = grantingId ? (users.find((u) => u.id === grantingId) ?? null) : null;
  const [q, setQ] = useState("");
  const resend = useAction(resendInviteAction, { success: "Invite re-sent", refresh: false });
  const signOut = useAction(adminSignOutAction, { success: "Signed out of every device", refresh: false });
  const reset2fa = useAction(adminReset2faAction, { success: "2FA reset — they'll set it up at next sign-in" });
  const shown = useMemo(() => users.filter((u) => `${u.name} ${u.email} ${u.role.name}`.toLowerCase().includes(q.toLowerCase())), [users, q]);
  const unitName = (id: string) => units.find((u) => u.id === id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-xs" aria-label="Search people" />
        {can.invite && (
          <Button variant="primary" onClick={() => setInviting(true)}>
            <Plus className="size-3.5" /> Invite someone
          </Button>
        )}
      </div>
      <Card padded={false}>
        <Table>
          <THead>
            <tr>
              <Th>Person</Th>
              <Th>Role</Th>
              <Th>Units</Th>
              <Th>Status</Th>
              <Th>Sign-in</Th>
              <Th className="w-10" />
            </tr>
          </THead>
          <tbody>
            {shown.length === 0 && <TableEmpty colSpan={6}>No one matches.</TableEmpty>}
            {shown.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar id={u.id} name={u.name} size={28} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.name}</p>
                      <p className="truncate text-2xs text-ink-3">{u.email}</p>
                    </div>
                  </div>
                </Td>
                <Td>{u.role.name}{u.grants.length > 0 && <Badge tone="accent" className="ml-1.5">+{u.grants.length}</Badge>}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {[u.primaryUnit?.id, ...u.unitIds.filter((x) => x !== u.primaryUnit?.id)].filter(Boolean).map((id) => {
                      const unit = unitName(id!);
                      return unit ? (
                        <span key={id} className="inline-flex items-center gap-1 text-2xs text-ink-2">
                          <span className={cn("size-1.5 rounded-full", UNIT_STYLE[unit.code]?.dot)} />
                          {UNIT_STYLE[unit.code]?.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                </Td>
                <Td>
                  <StatusBadge status={u.status} />
                  {u.accessExpiresAt && <p className="mt-0.5 text-2xs text-ink-3">until {formatDay(u.accessExpiresAt)}</p>}
                </Td>
                <Td muted>
                  <span className="inline-flex items-center gap-1.5">
                    {u.has2fa ? <ShieldCheck className="size-3.5 text-success" aria-label="2FA on" /> : <ShieldOff className="size-3.5 text-ink-3" aria-label="2FA off" />}
                    {u.lastLoginAt ? ago(u.lastLoginAt) : "Never"}
                  </span>
                </Td>
                <Td align="right">
                  {u.id !== me && (
                    <Menu
                      items={[
                        ...(can.edit ? [{ label: "Edit access", icon: <UserCog className="size-3.5" />, onSelect: () => setEditing(u) }] : []),
                        ...(can.grants ? [{ label: "Extra permissions", icon: <KeyRound className="size-3.5" />, onSelect: () => setGranting(u.id) }] : []),
                        ...(u.status === "INVITED" && can.invite ? [{ label: "Resend invite", icon: <Mail className="size-3.5" />, onSelect: () => resend.run(u.id) }] : []),
                        ...(can.grants ? [{ label: "Sign out everywhere", icon: <LogOut className="size-3.5" />, onSelect: () => signOut.run(u.id) }] : []),
                        ...(can.roles && u.has2fa ? [{ label: "Reset 2FA (lost phone)", icon: <ShieldOff className="size-3.5" />, onSelect: () => reset2fa.run(u.id), danger: true }] : []),
                      ]}
                    />
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {inviting && <InviteDialog roles={roles} units={units} users={users} onClose={() => setInviting(false)} />}
      {editing && <AccessDialog user={editing} roles={roles} units={units} users={users} canRoles={can.roles} onClose={() => setEditing(null)} />}
      {granting && <GrantsDialog user={granting} modules={modules} canSensitive={can.roles} onClose={() => setGranting(null)} />}
    </div>
  );
}
