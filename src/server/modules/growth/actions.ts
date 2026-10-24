"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { requestIp } from "@/server/ratelimit";
import { certificatePdf, enroll, issueCertificate, reissueCertificate, revokeCertificate, saveCohort, saveCourse, updateEnrollment } from "@/server/modules/academy/service";
import { addComment, createTicket, updateTicket } from "@/server/modules/support/service";
import { archiveDocument, documentLink, requestCounterpartySignature, uploadDocument } from "@/server/modules/vault/service";
import { dsrMatches, eraseContact, exportContactData, publishPolicy, savePolicy, updateDsr } from "@/server/modules/privacy/service";
import { createReferrer, decidePayout, requestPayout } from "./referrals-service";
import { moveTender, saveTender, updateChecklistItem } from "./tenders-service";

const done =
  (...paths: string[]) =>
  <T>(p: Promise<T>) =>
    p.then((x) => {
      for (const path of paths) revalidatePath(path, "layout");
      return x;
    });

// academy
export const saveCourseAction = async (i: unknown) => runAction((ctx) => done("/customers/academy")(saveCourse(ctx, i)));
export const saveCohortAction = async (i: unknown) => runAction((ctx) => done("/customers/academy")(saveCohort(ctx, i)));
export const enrollAction = async (i: unknown) => runAction((ctx) => done("/customers/academy")(enroll(ctx, i)));
export const updateEnrollmentAction = async (i: unknown) => runAction((ctx) => done("/customers/academy")(updateEnrollment(ctx, i)));
export const issueCertificateAction = async (id: string) => runAction((ctx) => done("/customers/academy")(issueCertificate(ctx, String(id))));
export const revokeCertificateAction = async (i: unknown) => runAction((ctx) => done("/customers/academy")(revokeCertificate(ctx, i)));
export const reissueCertificateAction = async (i: unknown) => runAction((ctx) => done("/customers/academy")(reissueCertificate(ctx, i)));
export const certificatePdfAction = async (id: string) => runAction((ctx) => certificatePdf(ctx, String(id)));
// tenders
export const saveTenderAction = async (i: unknown) => runAction((ctx) => done("/customers/tenders")(saveTender(ctx, i)));
export const moveTenderAction = async (i: unknown) => runAction((ctx) => done("/customers/tenders")(moveTender(ctx, i)));
export const checklistItemAction = async (f: FormData) => runAction((ctx) => done("/customers/tenders")(updateChecklistItem(ctx, f)));
// referrals
export const createReferrerAction = async (i: unknown) => runAction((ctx) => done("/customers/referrals")(createReferrer(ctx, i)));
export const requestPayoutAction = async (id: string) => runAction((ctx) => done("/customers/referrals")(requestPayout(ctx, String(id))));
export const decidePayoutAction = async (i: unknown) => runAction((ctx) => done("/customers/referrals", "/money")(decidePayout(ctx, i)));
// support
export const createTicketAction = async (i: unknown) => runAction((ctx) => done("/customers/tickets")(createTicket(ctx, i)));
export const commentTicketAction = async (i: unknown) => runAction((ctx) => done("/customers/tickets")(addComment(ctx, i)));
export const updateTicketAction = async (i: unknown) => runAction((ctx) => done("/customers/tickets")(updateTicket(ctx, i)));
// vault
export const uploadDocumentAction = async (f: FormData) => runAction((ctx) => done("/team/documents")(uploadDocument(ctx, f)));
export const documentLinkAction = async (id: string) => runAction(async (ctx) => documentLink(ctx, String(id), { ip: await requestIp() }));
export const archiveDocumentAction = async (id: string) => runAction((ctx) => done("/team/documents")(archiveDocument(ctx, String(id))));
export const requestSignatureAction = async (i: unknown) => runAction((ctx) => done("/team/documents")(requestCounterpartySignature(ctx, i)));
// privacy
export const savePolicyDocAction = async (i: unknown) => runAction((ctx) => done("/settings/privacy")(savePolicy(ctx, i)));
export const publishPolicyDocAction = async (id: string) => runAction((ctx) => done("/settings/privacy")(publishPolicy(ctx, String(id))));
export const updateDsrAction = async (i: unknown) => runAction((ctx) => done("/settings/privacy")(updateDsr(ctx, i)));
export const dsrMatchesAction = async (id: string) => runAction((ctx) => dsrMatches(ctx, String(id)));
export const exportDsrAction = async (id: string) => runAction((ctx) => exportContactData(ctx, String(id)));
export const eraseDsrAction = async (id: string) => runAction((ctx) => done("/settings/privacy")(eraseContact(ctx, String(id))));
