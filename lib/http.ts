import { z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export function safeRoute(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      const result = await handler(request);
      result.headers.set("Cache-Control", "no-store, private");
      result.headers.set("X-Content-Type-Options", "nosniff");
      return result;
    } catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
      if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof TypeError) return Response.json({ error: "Data permintaan tidak valid." }, { status: 400 });
      const code = (error as {code?: string})?.code;
      if (code === "23505") return Response.json({error: "Data sudah terdaftar. Muat ulang dan periksa kembali."}, {status: 409});
      console.error("API_REQUEST_FAILED", code || (error instanceof Error ? error.name : "UnknownError"));
      return Response.json({ error: "Layanan sementara tidak tersedia. Silakan coba kembali." }, { status: 503 });
    }
  };
}

export async function jsonBody<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<z.output<S>> { return schema.parse(await request.json()); }
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(12).max(128).regex(/[a-zA-Z]/).regex(/[0-9]/);
