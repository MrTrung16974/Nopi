import { z } from 'zod';
import { GRADING_SCHEME_IDS, gradeSchema } from '@nopi/domain';

export const subjectSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  shortName: z.string(),
  groupCode: z.string().nullable(),
  icon: z.string(),
  color: z.string(),
});
export type SubjectDto = z.infer<typeof subjectSchema>;

export const gradeSubjectSchema = subjectSchema.extend({
  isOptional: z.boolean(),
  gradingScheme: z.enum(GRADING_SCHEME_IDS),
  sortOrder: z.number().int(),
});
export type GradeSubjectDto = z.infer<typeof gradeSubjectSchema>;

export const gradeParamsSchema = z.object({ grade: z.coerce.number().pipe(gradeSchema) });

export const gradeSubjectsResponseSchema = z.object({
  grade: gradeSchema,
  stage: z.enum(['primary', 'lower_secondary']),
  subjects: z.array(gradeSubjectSchema),
});
export type GradeSubjectsResponse = z.infer<typeof gradeSubjectsResponseSchema>;
