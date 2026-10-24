import { NextResponse, type NextRequest } from "next/server";
import { referrerForCode } from "@/server/modules/growth/referrals-service";

/** Referral link: remember the code for 30 days, then send the visitor to the site. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const r = await referrerForCode((await params).code.toUpperCase());
  const target = new URL(process.env.REFERRAL_LANDING_URL ?? "/", req.url);
  const res = NextResponse.redirect(target);
  if (r) res.cookies.set("fos_ref", r.code, { maxAge: 30 * 86_400, httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/" });
  return res;
}
