import { studentHomeSchema } from '@nopi/contracts';
import { uiModeOfGrade, type Grade, type UiMode } from '@nopi/domain';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useSession } from './session';

/** Dữ liệu trang chủ học sinh (dùng chung để biết chế độ Nhí/Teen ở mọi màn của học sinh). */
export function useStudentHome() {
  const { student } = useSession();
  return useQuery({
    queryKey: ['student', 'me', student?.student.id],
    queryFn: () => api('/student/me', { as: 'student', schema: studentHomeSchema }),
    enabled: Boolean(student),
  });
}

export function useStudentMode(): UiMode {
  const home = useStudentHome();
  return home.data?.grade ? uiModeOfGrade(home.data.grade as Grade) : 'nhi';
}
