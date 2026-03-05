import { z } from "zod";

import { ViewerFragmentDoc } from "../documents";
import { schema as gqlUserRoleEnumSchema } from "../enums/UserRole";

export const document = ViewerFragmentDoc;
export const schema = z.object({
  id: z.string(),
  email: z.string(),
  role: gqlUserRoleEnumSchema,
  name: z.string().nullable(),
});
