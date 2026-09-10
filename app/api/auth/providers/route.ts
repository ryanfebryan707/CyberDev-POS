import { googleIdentityConfigured } from "@/lib/google-auth";
export async function GET() { return Response.json({google:googleIdentityConfigured()},{headers:{"cache-control":"no-store"}}); }
