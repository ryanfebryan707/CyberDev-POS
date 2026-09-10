import { googleConfigured } from "@/lib/google-auth";
export async function GET() { return Response.json({google:googleConfigured()},{headers:{"cache-control":"no-store"}}); }
