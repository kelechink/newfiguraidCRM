"use server";

import { runAction } from "@/server/action";
import {
  acknowledge,
  createGroup,
  deleteMessage,
  listChannels,
  listMessages,
  markRead,
  messageToTask,
  openDirect,
  publishAnnouncement,
  searchMessages,
  sendMessage,
  togglePin,
} from "./service";

export async function listChannelsAction() {
  return runAction((ctx) => listChannels(ctx));
}
export async function listMessagesAction(input: unknown) {
  return runAction((ctx) => listMessages(ctx, input));
}
export async function sendMessageAction(form: FormData) {
  return runAction((ctx) => sendMessage(ctx, form));
}
export async function markReadAction(channelId: string) {
  return runAction((ctx) => markRead(ctx, String(channelId)));
}
export async function openDirectAction(userId: string) {
  return runAction((ctx) => openDirect(ctx, String(userId)));
}
export async function createGroupAction(input: unknown) {
  return runAction((ctx) => createGroup(ctx, input));
}
export async function togglePinAction(id: string) {
  return runAction((ctx) => togglePin(ctx, String(id)));
}
export async function deleteMessageAction(id: string) {
  return runAction((ctx) => deleteMessage(ctx, String(id)));
}
export async function messageToTaskAction(input: unknown) {
  return runAction((ctx) => messageToTask(ctx, input));
}
export async function searchMessagesAction(q: string) {
  return runAction((ctx) => searchMessages(ctx, String(q)));
}
export async function publishAnnouncementAction(input: unknown) {
  return runAction((ctx) => publishAnnouncement(ctx, input));
}
export async function acknowledgeAction(id: string) {
  return runAction((ctx) => acknowledge(ctx, String(id)));
}
