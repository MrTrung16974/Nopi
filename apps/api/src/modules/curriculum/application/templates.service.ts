import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@nopi/db';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { DB, type UserActor } from '../../../platform/index.js';

const { commentTemplates, assignmentTemplates, subjects } = schema;

/** Câu nhận xét mẫu và mẫu bài: của hệ thống + của riêng giáo viên. */
@Injectable()
export class TemplatesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async comments(actor: UserActor, opts: { subjectId?: number; stage?: 'primary' | 'lower_secondary' }) {
    const rows = await this.db
      .select({ id: commentTemplates.id, text: commentTemplates.text, owner: commentTemplates.ownerUserId })
      .from(commentTemplates)
      .where(
        and(
          or(isNull(commentTemplates.ownerUserId), eq(commentTemplates.ownerUserId, actor.userId)),
          opts.subjectId ? or(isNull(commentTemplates.subjectId), eq(commentTemplates.subjectId, opts.subjectId)) : undefined,
          opts.stage ? or(isNull(commentTemplates.stage), eq(commentTemplates.stage, opts.stage)) : undefined,
        ),
      )
      // Câu của riêng cô lên trước, rồi câu theo môn, rồi câu chung
      .orderBy(sql`${commentTemplates.ownerUserId} IS NULL`, sql`${commentTemplates.subjectId} IS NULL`, asc(commentTemplates.sortOrder));
    return rows.map((r) => ({ id: r.id, text: r.text, mine: r.owner !== null }));
  }

  async addComment(actor: UserActor, text: string, subjectId?: number) {
    const [r] = await this.db.insert(commentTemplates).values({ ownerUserId: actor.userId, text, subjectId: subjectId ?? null }).returning();
    return { id: r!.id, text: r!.text, mine: true };
  }

  async deleteComment(actor: UserActor, id: string) {
    await this.db.delete(commentTemplates).where(and(eq(commentTemplates.id, id), eq(commentTemplates.ownerUserId, actor.userId)));
  }

  async assignmentTemplates(actor: UserActor, subjectId?: number) {
    let code: string | undefined;
    if (subjectId) [{ code } = { code: undefined }] = await this.db.select({ code: subjects.code }).from(subjects).where(eq(subjects.id, subjectId));
    const rows = await this.db
      .select()
      .from(assignmentTemplates)
      .where(or(and(isNull(assignmentTemplates.ownerUserId), isNull(assignmentTemplates.schoolId)), eq(assignmentTemplates.ownerUserId, actor.userId)));
    const list = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      suggestedSubjectCodes: r.suggestedSubjectCodes,
      defaults: r.defaults as { submissionKinds: ('photo' | 'video' | 'audio' | 'document')[]; maxPhotos: number; maxMediaSeconds: number },
    }));
    // Mẫu hợp với môn đang chọn lên trước
    return code ? [...list.filter((t) => t.suggestedSubjectCodes.includes(code!)), ...list.filter((t) => !t.suggestedSubjectCodes.includes(code!))] : list;
  }
}
