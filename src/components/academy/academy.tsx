"use client";

import { Award, Download, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDay, money } from "@/lib/format";
import { certificatePdfAction, enrollAction, issueCertificateAction, reissueCertificateAction, revokeCertificateAction, saveCohortAction, saveCourseAction, updateEnrollmentAction } from "@/server/modules/growth/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { Dialog, DialogContent } from "@/ui/dialog";
import { downloadBase64 } from "@/ui/download";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Menu } from "@/ui/menu";
import { humanize, StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { useAction } from "@/ui/use-action";

type Cohort = { id: string; name: string; startDate: string; endDate: string; capacity: number | null; status: string; enrolled: number };
type Course = { id: string; code: string; title: string; description: string | null; priceNgn: number | null; isActive: boolean; unitId: string; cohorts: Cohort[] };

export function Courses({ courses, unitId, canEdit }: { courses: Course[]; unitId: string | null; canEdit: boolean }) {
  const [course, setCourse] = useState(false);
  const [cohortFor, setCohortFor] = useState<Course | null>(null);
  const saveCourse = useAction(saveCourseAction, { success: "Course saved", onSuccess: () => setCourse(false) });
  const saveCohort = useAction(saveCohortAction, { success: "Cohort created", onSuccess: () => setCohortFor(null) });
  return (
    <div className="grid gap-4">
      {canEdit && unitId && <div className="flex justify-end"><Button variant="primary" onClick={() => setCourse(true)}><Plus className="size-3.5" /> New course</Button></div>}
      {courses.length === 0 && <Card><p className="text-[13px] text-ink-3">No courses yet.</p></Card>}
      {courses.map((c) => (
        <Card key={c.id} padded={false}>
          <CardHeader title={<span>{c.title} <span className="font-mono text-2xs font-normal text-ink-3">{c.code}</span>{!c.isActive && <Badge className="ml-1.5">Inactive</Badge>}</span>} description={`${c.priceNgn != null ? money(c.priceNgn) : "Free"}${c.description ? ` · ${c.description}` : ""}`} className="px-4 pt-3" actions={canEdit && <Button size="sm" variant="secondary" onClick={() => setCohortFor(c)}><Plus className="size-3.5" /> Cohort</Button>} />
          <ul className="divide-y divide-line">
            {c.cohorts.length === 0 && <li className="px-4 py-3 text-[13px] text-ink-3">No cohorts.</li>}
            {c.cohorts.map((h) => (
              <li key={h.id}>
                <Link href={`/customers/academy/${h.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-surface-2/60">
                  <span><span className="font-medium">{h.name}</span><span className="block text-2xs text-ink-3">{formatDay(h.startDate)} – {formatDay(h.endDate)}</span></span>
                  <span className="flex items-center gap-2 text-ink-3">{h.enrolled}{h.capacity ? `/${h.capacity}` : ""} students <StatusBadge status={h.status === "running" ? "IN_PROGRESS" : h.status === "completed" ? "COMPLETED" : "DRAFT"} label={humanize(h.status.toUpperCase())} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <Dialog open={course} onOpenChange={setCourse}>
        <DialogContent title="New course" footer={<><Button variant="ghost" onClick={() => setCourse(false)}>Cancel</Button><Button variant="primary" type="submit" form="course" loading={saveCourse.pending}>Save</Button></>}>
          <form id="course" className="grid gap-4" action={saveCourse.formAction((f) => ({ unitId, code: f.get("code"), title: f.get("title"), description: f.get("desc") || undefined, priceNgn: f.get("price") || null }))}>
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <Field label="Title" htmlFor="co-t"><Input id="co-t" name="title" required autoFocus /></Field>
              <Field label="Code" htmlFor="co-c" error={saveCourse.errors.code}><Input id="co-c" name="code" required placeholder="AI-101" className="uppercase" /></Field>
            </div>
            <Field label="Fee (₦)" htmlFor="co-p"><Input id="co-p" name="price" type="number" min={0} /></Field>
            <Field label="Description" htmlFor="co-d"><Textarea id="co-d" name="desc" rows={2} /></Field>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!cohortFor} onOpenChange={(o) => !o && setCohortFor(null)}>
        {cohortFor && (
          <DialogContent title={`New cohort · ${cohortFor.title}`} footer={<><Button variant="ghost" onClick={() => setCohortFor(null)}>Cancel</Button><Button variant="primary" type="submit" form="cohort" loading={saveCohort.pending}>Create</Button></>}>
            <form id="cohort" className="grid gap-4" action={saveCohort.formAction((f) => ({ courseId: cohortFor.id, name: f.get("name"), startDate: f.get("start"), endDate: f.get("end"), capacity: f.get("cap") || null, status: f.get("status") }))}>
              <Field label="Name" htmlFor="ch-n"><Input id="ch-n" name="name" required defaultValue={`${cohortFor.title} — Cohort ${cohortFor.cohorts.length + 1}`} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts" htmlFor="ch-s"><Input id="ch-s" name="start" type="date" required /></Field>
                <Field label="Ends" htmlFor="ch-e" error={saveCohort.errors.endDate}><Input id="ch-e" name="end" type="date" required /></Field>
                <Field label="Capacity" htmlFor="ch-c"><Input id="ch-c" name="cap" type="number" min={1} /></Field>
                <Field label="Status" htmlFor="ch-st"><Select id="ch-st" name="status"><option value="planned">Planned</option><option value="running">Running</option><option value="completed">Completed</option></Select></Field>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

type Student = { id: string; contact: { id: string; name: string; email: string | null; phone: string | null }; state: string; scholarshipPct: number; scholarshipNote: string | null; amountDue: number | null; attendancePct: number | null; completedAt: string | null; certificate: { id: string; code: string; status: string } | null };
const STATES = ["APPLIED", "SCREENED", "ENROLLED", "ACTIVE", "COMPLETED", "WITHDRAWN"];

export function Roster({ cohortId, students, contacts, canEdit, canCertify }: { cohortId: string; students: Student[]; contacts: { id: string; name: string }[]; canEdit: boolean; canCertify: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [revoking, setRevoking] = useState<Student | null>(null);
  const [reissuing, setReissuing] = useState<Student | null>(null);
  const add = useAction(enrollAction, { success: "Added to cohort", onSuccess: () => setAdding(false) });
  const update = useAction(updateEnrollmentAction, { success: "Updated", onSuccess: () => setEditing(null) });
  const issue = useAction(issueCertificateAction, { success: (r) => `Certificate ${r.code} issued` });
  const pdf = useAction(certificatePdfAction, { refresh: false, onSuccess: (r) => downloadBase64(r.filename, r.base64) });
  const revoke = useAction(revokeCertificateAction, { success: "Certificate revoked", onSuccess: () => setRevoking(null) });
  const reissue = useAction(reissueCertificateAction, { success: (r) => `Reissued as ${r.code}`, onSuccess: () => setReissuing(null) });
  const enrolledIds = new Set(students.map((s) => s.contact.id));
  return (
    <>
      {canEdit && <div className="flex justify-end"><Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-3.5" /> Add student</Button></div>}
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Student</Th><Th>Stage</Th><Th align="right">Scholarship</Th><Th align="right">Fee due</Th><Th align="right">Attendance</Th><Th>Certificate</Th><Th /></tr></THead>
          <tbody>
            {students.length === 0 && <TableEmpty colSpan={7}>No students yet.</TableEmpty>}
            {students.map((s) => (
              <Tr key={s.id}>
                <Td><Link href={`/customers/contacts/${s.contact.id}`} className="font-medium hover:text-accent">{s.contact.name}</Link><p className="text-2xs text-ink-3">{s.contact.email ?? s.contact.phone ?? "—"}</p></Td>
                <Td>
                  {canEdit ? (
                    <Select aria-label="Stage" value={s.state} onChange={(e) => update.run({ enrollmentId: s.id, state: e.target.value })} className="h-7 w-[130px] text-[12.5px]">{STATES.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select>
                  ) : <StatusBadge status={s.state} />}
                </Td>
                <Td align="right" title={s.scholarshipNote ?? undefined}>{s.scholarshipPct ? `${s.scholarshipPct}%` : "—"}</Td>
                <Td align="right">{s.amountDue != null ? money(s.amountDue) : "—"}</Td>
                <Td align="right" muted>{s.attendancePct != null ? `${s.attendancePct}%` : "—"}</Td>
                <Td>{s.certificate ? <span className="flex items-center gap-1.5"><span className="font-mono text-[12px]">{s.certificate.code}</span><StatusBadge status={s.certificate.status} /></span> : canCertify && s.state === "COMPLETED" ? <Button size="sm" variant="secondary" onClick={() => issue.run(s.id)} loading={issue.pending}><Award className="size-3.5" /> Issue</Button> : <span className="text-2xs text-ink-3">—</span>}</Td>
                <Td align="right" className="whitespace-nowrap">
                  {s.certificate && s.certificate.status === "VALID" && <Button size="sm" variant="ghost" onClick={() => pdf.run(s.certificate!.id)} aria-label="Download certificate"><Download className="size-3.5" /></Button>}
                  {(canEdit || canCertify) && (
                    <Menu
                      items={[
                        ...(canEdit ? [{ label: "Scholarship & attendance", onSelect: () => setEditing(s) }] : []),
                        ...(canCertify && s.certificate?.status === "VALID" ? [{ label: "Reissue certificate", onSelect: () => setReissuing(s) }, { label: "Revoke certificate", danger: true, onSelect: () => setRevoking(s) }] : []),
                      ]}
                    />
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title="Add a student" description="Pick an Academy contact. New applicants arrive automatically from the Academy lead form." footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" type="submit" form="enr" loading={add.pending}>Add</Button></>}>
          <form id="enr" action={add.formAction((f) => ({ cohortId, contactId: f.get("contact") }))}>
            <Field label="Contact" htmlFor="en-c"><Select id="en-c" name="contact" required>{contacts.filter((c) => !enrolledIds.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.contact.name} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" type="submit" form="sch" loading={update.pending}>Save</Button></>}>
            <form id="sch" className="grid gap-4" action={update.formAction((f) => ({ enrollmentId: editing.id, scholarshipPct: f.get("pct"), scholarshipNote: f.get("note") || undefined, attendancePct: f.get("att") || null }))}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Scholarship %" htmlFor="sc-p"><Input id="sc-p" name="pct" type="number" min={0} max={100} defaultValue={editing.scholarshipPct} /></Field>
                <Field label="Attendance %" htmlFor="sc-a"><Input id="sc-a" name="att" type="number" min={0} max={100} step="0.1" defaultValue={editing.attendancePct ?? ""} /></Field>
              </div>
              <Field label="Scholarship reason" htmlFor="sc-n" error={update.errors.scholarshipNote}><Input id="sc-n" name="note" defaultValue={editing.scholarshipNote ?? ""} placeholder="e.g. State youth programme" /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        {revoking && (
          <DialogContent title={`Revoke ${revoking.certificate?.code}?`} description="Verification will show it as revoked. This can't be undone." footer={<><Button variant="ghost" onClick={() => setRevoking(null)}>Cancel</Button><Button variant="danger" type="submit" form="rev" loading={revoke.pending}>Revoke</Button></>}>
            <form id="rev" action={revoke.formAction((f) => ({ certificateId: revoking.certificate!.id, reason: f.get("reason") }))}>
              <Field label="Reason (internal)" htmlFor="rv-r" error={revoke.errors.reason}><Input id="rv-r" name="reason" required minLength={5} /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={!!reissuing} onOpenChange={(o) => !o && setReissuing(null)}>
        {reissuing && (
          <DialogContent title="Reissue certificate" description="For name corrections. The old ID shows as replaced; the new one gets a new code." footer={<><Button variant="ghost" onClick={() => setReissuing(null)}>Cancel</Button><Button variant="primary" type="submit" form="reis" loading={reissue.pending}>Reissue</Button></>}>
            <form id="reis" action={reissue.formAction((f) => ({ certificateId: reissuing.certificate!.id, recipientName: f.get("name") }))}>
              <Field label="Name on certificate" htmlFor="ri-n"><Input id="ri-n" name="name" required defaultValue={reissuing.contact.name} /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
