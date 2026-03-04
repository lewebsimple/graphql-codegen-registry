import { z } from "zod";

export const schema = z.enum(["ADMIN", "USER"]);
