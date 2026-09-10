import { completeGoogleLogin, googleAppOrigin, googleConfigured, googleCookie } from "@/lib/google-auth";
import { HttpError } from "@/lib/http";

export async function GET(request: Request) {
  if (!googleConfigured()) return Response.json({error:"Login Google belum diaktifkan."},{status:503});
  const target = new URL(googleAppOrigin());
  const headers = new Headers({"cache-control":"no-store"});
  headers.append("set-cookie",googleCookie("",0));
  try {
    const session = await completeGoogleLogin(request);
    headers.append("set-cookie",session.cookie);
  } catch(error) {
    target.searchParams.set("auth_error",error instanceof HttpError ? error.message : "Login Google gagal. Silakan coba kembali.");
  }
  headers.set("location",target.toString());
  return new Response(null,{status:303,headers});
}
