import { z } from "zod";

import { GetUserDocument } from "../documents";
import { schema as viewerFragmentSchema } from "../fragments/Viewer";

export const document = GetUserDocument;
export const kind = "query" as const;
export const schema = z.object({
  getUser: z.object({}).extend(viewerFragmentSchema.shape),
});
export const variablesSchema = z.object({
  id: z.string(),
});
