import { createSubjects } from "@openauthjs/openauth";
import { object, string } from "valibot";
import type { InferOutput } from "valibot";

const userSubjectSchema = object({
  id: string(),
  email: string(),
});

export const subjects = createSubjects({
  user: userSubjectSchema,
});

export type UserSubject = {
  type: "user";
  properties: InferOutput<typeof userSubjectSchema>;
};
