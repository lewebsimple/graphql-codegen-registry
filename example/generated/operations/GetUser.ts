import { z } from "zod";

import { GetUserDocument } from "../documents";
import { schema as gqlViewerFragmentSchema } from "../fragments/Viewer";

export const document = GetUserDocument;
export const kind = "query" as const;
export const schema = z.object({
  getUser: gqlViewerFragmentSchema,
});
export const variablesSchema = z.object({
  id: z.string(),
});
