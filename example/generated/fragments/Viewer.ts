import { z } from "zod";

import { ViewerFragmentDoc } from "../documents";
import { schema as userRoleEnumSchema } from "../enums/UserRole";

export const document = ViewerFragmentDoc;
export const schema = z.object({
  id: z.string(),
  email: z.string(),
  role: userRoleEnumSchema,
  name: z.string().nullable(),
});
