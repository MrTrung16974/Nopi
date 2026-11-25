import { Injectable } from '@nestjs/common';
import type { GradeSubjectDto, GradeSubjectsResponse } from '@nopi/contracts';
import { stageOfGrade, type Grade, type GradingSchemeId } from '@nopi/domain';
import { CurriculumRepository } from '../infra/curriculum.repository.js';

const CACHE_TTL_MS = 5 * 60_000;

/**
 * Danh mục môn theo khối. Dữ liệu gần như không đổi nên cache trong bộ nhớ.
 * Mô-đun khác (org: kiểm tra phân công; assignments: thang mặc định) gọi service này qua public-api.
 */
@Injectable()
export class CurriculumService {
  private cache = new Map<number, { at: number; subjects: GradeSubjectDto[] }>();

  constructor(private readonly repo: CurriculumRepository) {}

  async subjectsOfGrade(grade: Grade): Promise<GradeSubjectsResponse> {
    const hit = this.cache.get(grade);
    let list = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.subjects : undefined;
    if (!list) {
      list = await this.repo.findSubjectsOfGrade(grade);
      this.cache.set(grade, { at: Date.now(), subjects: list });
    }
    return { grade, stage: stageOfGrade(grade), subjects: list };
  }

  /** Môn có thuộc chương trình của khối không — dùng khi tạo phân công giảng dạy. */
  async isSubjectInGrade(grade: Grade, subjectId: number): Promise<boolean> {
    const { subjects } = await this.subjectsOfGrade(grade);
    return subjects.some((s) => s.id === subjectId);
  }

  /** Thang đánh giá mặc định của môn ở khối (TT27/TT22); giáo viên đổi được cho từng bài. */
  async defaultGradingScheme(grade: Grade, subjectId: number): Promise<GradingSchemeId | null> {
    const { subjects } = await this.subjectsOfGrade(grade);
    return subjects.find((s) => s.id === subjectId)?.gradingScheme ?? null;
  }

  /** Thông tin hiển thị của môn (tên ngắn, màu, biểu tượng) theo id. */
  async subjectsById(ids: number[]) {
    if (!this.allSubjects) this.allSubjects = await this.repo.allSubjects();
    const want = new Set(ids);
    return new Map(this.allSubjects.filter((s) => want.has(s.id)).map((s) => [s.id, s]));
  }
  private allSubjects?: Awaited<ReturnType<CurriculumRepository['allSubjects']>>;

  clearCache() {
    this.allSubjects = undefined;
    this.cache.clear();
  }
}
