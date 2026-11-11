// src/app/api/companies/[id]/contacts/route.js
import { z } from "zod";
import { api, HttpError, json, readJson, routeId } from "@/server/http";
import { addManualContact } from "@/server/companies";
import { isValidEmail } from "@/server/util";

const schema = z.object({
  email: z.string().trim().max(254).refine(isValidEmail, "Enter a valid email"),
  name: z.string().trim().max(120).optional().default(""),
  role: z.string().trim().max(120).optional().default(""),
});

// Manually added contacts are always "unverified": Atlas never marks an address verified on the owner's say-so.
export const POST = api(async (request, ctx) => {
  const contact = await addManualContact(await routeId(ctx), await readJson(request, schema));
  if (!contact) throw new HttpError(409, "That email is already saved for a company.");
  return json({ contact });
});
