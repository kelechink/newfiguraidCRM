"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { createContact, getContact, logActivity, mergeContacts, updateContact } from "./contacts-service";
import { saveForm } from "./forms-service";
import { createDeal, getBoard, getDeal, moveDeal, saveStages, updateDeal } from "./pipeline-service";

const refresh =
  (...paths: string[]) =>
  <T>(p: Promise<T>) =>
    p.then((r) => {
      for (const path of paths) revalidatePath(path);
      return r;
    });

export async function createContactAction(input: unknown) {
  return runAction((ctx) => refresh("/customers/contacts")(createContact(ctx, input)));
}
export async function updateContactAction(input: unknown) {
  return runAction((ctx) => refresh("/customers/contacts", "/customers/contacts/[id]")(updateContact(ctx, input)));
}
export async function logActivityAction(input: unknown) {
  return runAction((ctx) => logActivity(ctx, input));
}
export async function mergeContactsAction(input: unknown) {
  return runAction((ctx) => refresh("/customers/contacts")(mergeContacts(ctx, input)));
}
export async function getContactAction(id: string) {
  return runAction((ctx) => getContact(ctx, String(id)));
}
export async function getBoardAction(pipelineId: string) {
  return runAction((ctx) => getBoard(ctx, String(pipelineId)));
}
export async function createDealAction(input: unknown) {
  return runAction((ctx) => createDeal(ctx, input));
}
export async function moveDealAction(input: unknown) {
  return runAction((ctx) => moveDeal(ctx, input));
}
export async function updateDealAction(input: unknown) {
  return runAction((ctx) => updateDeal(ctx, input));
}
export async function getDealAction(id: string) {
  return runAction((ctx) => getDeal(ctx, String(id)));
}
export async function saveStagesAction(input: unknown) {
  return runAction((ctx) => saveStages(ctx, input));
}
export async function saveFormAction(input: unknown) {
  return runAction((ctx) => refresh("/customers/marketing")(saveForm(ctx, input)));
}
