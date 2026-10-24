import { apiError, withAuth } from "@/lib/api";
import { eventosDeConversacion } from "@/server/inbox/eventos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 054 — Los eventos del hilo (etapas y traspaso), por hora. Ajena: 404. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const eventos = await eventosDeConversacion(session.organizationId, id);
  if (!eventos) return apiError(404, "not_found", "Conversación no encontrada");
  return Response.json({ eventos });
});
