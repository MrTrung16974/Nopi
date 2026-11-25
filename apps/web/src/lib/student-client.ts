'use client';
import type { DisplayStatus, UiMode } from '@nopi/domain';

export interface StudentSubject {
  id: number;
  code: string;
  shortName: string;
  icon: string;
  color: string;
  gradingScheme?: string;
}

export interface StudentTaskFeedback {
  requiresRedo: boolean;
  sticker?: string | null;
  label?: string | null;
  comment?: string | null;
}

export interface StudentTask {
  id: string;
  title: string;
  instructions: string;
  subject: StudentSubject;
  status: DisplayStatus;
  dueAt: string;
  fromFamily?: boolean;
  isLate?: boolean;
  submissionKinds: ('photo' | 'video' | 'audio')[];
  feedback?: StudentTaskFeedback | null;
  submittedAt?: string | null;
  submittedPreview?: { kind: 'photo' | 'audio' | 'video'; label: string; url?: string }[];
}

export interface StudentPortalData {
  mode: Extract<UiMode, 'nhi' | 'teen'>;
  isDemo: boolean;
  studentName: string;
  nickname: string;
  grade: number;
  className: string;
  waterDrops: number;
  subjects: StudentSubject[];
  tasks: StudentTask[];
}

export interface StudentWebSession {
  accessToken: string;
  refreshToken: string;
  student: { id: string; fullName: string; nickname: string | null };
}

const STUDENT_KEY = 'nopi.web.student.session';

export const studentWebSession = {
  get(): StudentWebSession | null {
    try {
      const raw = localStorage.getItem(STUDENT_KEY);
      return raw ? (JSON.parse(raw) as StudentWebSession) : null;
    } catch {
      return null;
    }
  },
  set(s: StudentWebSession | null) {
    if (s) localStorage.setItem(STUDENT_KEY, JSON.stringify(s));
    else localStorage.removeItem(STUDENT_KEY);
  },
};

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

/** Dữ liệu trải nghiệm Chế độ Nhí (Lớp 2A — Bé Bống) sát 100% tài liệu thiết kế. */
export function buildDemoNhi(): StudentPortalData {
  const subjects: StudentSubject[] = [
    { id: 1, code: 'TIENG_VIET', shortName: 'Tiếng Việt', icon: 'book-open', color: '#F97316' },
    { id: 2, code: 'TOAN', shortName: 'Toán', icon: 'calculator', color: '#2563EB' },
    { id: 3, code: 'DAO_DUC', shortName: 'Đạo đức', icon: 'heart', color: '#DB2777' },
    { id: 4, code: 'TN_XH', shortName: 'TN & XH', icon: 'sprout', color: '#16A34A' },
    { id: 5, code: 'AM_NHAC', shortName: 'Âm nhạc', icon: 'music', color: '#CA8A04' },
    { id: 6, code: 'MI_THUAT', shortName: 'Mĩ thuật', icon: 'palette', color: '#D97706' },
  ];

  return {
    mode: 'nhi',
    isDemo: true,
    studentName: 'Nguyễn Minh Anh',
    nickname: 'Bống',
    grade: 2,
    className: '2A',
    waterDrops: 4,
    subjects,
    tasks: [
      {
        id: 'demo-nhi-1',
        title: 'Đọc to bài «Quả tim khỉ» (trang 52)',
        instructions: 'Con mở sách Tiếng Việt trang 52, đọc thật to, rõ ràng đoạn 1 và bấm nút ghi âm gửi cho cô nghe nhé!',
        subject: subjects[0]!,
        status: 'assigned',
        dueAt: hoursFromNow(6),
        submissionKinds: ['audio'],
      },
      {
        id: 'demo-nhi-2',
        title: 'Làm 3 bài phép cộng có nhớ trong vở',
        instructions: 'Con làm bài 1, 2, 3 trang 38 vào vở ô li rồi chụp ảnh trang vở rõ nét gửi cho cô nhé!',
        subject: subjects[1]!,
        status: 'assigned',
        dueAt: hoursFromNow(24),
        submissionKinds: ['photo'],
      },
      {
        id: 'demo-nhi-3',
        title: 'Viết chính tả 4 dòng thơ về mẹ',
        instructions: 'Con viết nắn nót 4 dòng thơ vào vở tập viết rồi chụp ảnh gửi lại cho cô xem nhé.',
        subject: subjects[0]!,
        status: 'returned',
        dueAt: hoursFromNow(18),
        submissionKinds: ['photo'],
        feedback: {
          requiresRedo: true,
          sticker: 'co-len',
          comment: 'Ảnh hơi mờ một chút, Bống chụp lại gần hơn để cô khen chữ đẹp nhé!',
        },
      },
      {
        id: 'demo-nhi-4',
        title: 'Vẽ bức tranh gia đình em',
        instructions: 'Con vẽ bức tranh gia đình mình đi chơi cuối tuần và tô màu thật tươi nhé!',
        subject: subjects[5]!,
        status: 'graded',
        dueAt: hoursFromNow(-24),
        submissionKinds: ['photo'],
        submittedAt: hoursFromNow(-30),
        feedback: {
          requiresRedo: false,
          sticker: 'tuyet-voi',
          label: 'Hoàn thành tốt',
          comment: 'Tranh con vẽ màu sắc tươi sáng, bố cục rất cân đối. Cô khen Bống!',
        },
      },
      {
        id: 'demo-nhi-5',
        title: 'Đếm số cây xanh quanh nhà',
        instructions: 'Con chụp ảnh 1 cái cây con thích nhất gần nhà và kể tên cây đó.',
        subject: subjects[3]!,
        status: 'graded',
        dueAt: hoursFromNow(-48),
        fromFamily: true,
        submissionKinds: ['photo'],
        submittedAt: hoursFromNow(-50),
        feedback: {
          requiresRedo: false,
          sticker: 'gioi-lam',
          label: 'Hoàn thành tốt',
          comment: 'Bống tìm được cây hoa giấy rất đẹp, bố mẹ khen con!',
        },
      },
      {
        id: 'demo-nhi-6',
        title: 'Hát bài «Em yêu trường em»',
        instructions: 'Con hát một đoạn bài Em yêu trường em và ghi âm hoặc quay video gửi cô.',
        subject: subjects[4]!,
        status: 'submitted',
        dueAt: hoursFromNow(40),
        submissionKinds: ['audio', 'video'],
        submittedAt: hoursFromNow(-2),
      },
    ],
  };
}

/** Dữ liệu trải nghiệm Chế độ Teen (Lớp 7A — Minh Khang) theo đúng mục 7.2. */
export function buildDemoTeen(): StudentPortalData {
  const subjects: StudentSubject[] = [
    { id: 10, code: 'TOAN', shortName: 'Toán', icon: 'calculator', color: '#2563EB', gradingScheme: 'Điểm 0–10' },
    { id: 11, code: 'NGU_VAN', shortName: 'Ngữ văn', icon: 'book-open', color: '#F97316', gradingScheme: 'Điểm 0–10' },
    { id: 12, code: 'NGOAI_NGU_1', shortName: 'Tiếng Anh', icon: 'languages', color: '#7C3AED', gradingScheme: 'Điểm 0–10' },
    { id: 13, code: 'KHTN', shortName: 'KHTN', icon: 'flask-conical', color: '#0D9488', gradingScheme: 'Điểm 0–10' },
    { id: 14, code: 'LS_DL', shortName: 'Sử & Địa', icon: 'globe', color: '#92400E', gradingScheme: 'Điểm 0–10' },
    { id: 15, code: 'TIN_HOC', shortName: 'Tin học', icon: 'monitor', color: '#475569', gradingScheme: 'Điểm 0–10' },
    { id: 16, code: 'GDTC', shortName: 'Thể dục', icon: 'volleyball', color: '#DC2626', gradingScheme: 'Đạt / Chưa đạt' },
  ];

  return {
    mode: 'teen',
    isDemo: true,
    studentName: 'Trần Minh Khang',
    nickname: 'Khang',
    grade: 7,
    className: '7A',
    waterDrops: 9,
    subjects,
    tasks: [
      {
        id: 'demo-teen-1',
        title: 'Bài tập Hình học: Tam giác bằng nhau (Bài 4, 5 SGK)',
        instructions: 'Trình bày đầy đủ giả thiết, kết luận và lời giải vào vở rồi chụp ảnh rõ nét gửi thầy.',
        subject: subjects[0]!,
        status: 'assigned',
        dueAt: hoursFromNow(5),
        submissionKinds: ['photo'],
      },
      {
        id: 'demo-teen-2',
        title: 'Speaking Unit 4: Giới thiệu sở thích bằng Tiếng Anh (1 phút)',
        instructions: 'Ghi âm đoạn nói khoảng 45–60 giây về sở thích cuối tuần của bạn, chú ý phát âm rõ âm cuối.',
        subject: subjects[2]!,
        status: 'assigned',
        dueAt: hoursFromNow(30),
        submissionKinds: ['audio'],
      },
      {
        id: 'demo-teen-3',
        title: 'Thí nghiệm tại nhà: Tốc độ chuyển động',
        instructions: 'Quay video ngắn dưới 1 phút hoặc chụp bảng số liệu đo thời gian vật lăn trên mặt phẳng nghiêng.',
        subject: subjects[3]!,
        status: 'returned',
        dueAt: hoursFromNow(50),
        submissionKinds: ['photo', 'video'],
        feedback: {
          requiresRedo: true,
          comment: 'Thiếu đơn vị đo ở cột thời gian, em bổ sung vào bảng rồi chụp lại nhé.',
        },
      },
      {
        id: 'demo-teen-4',
        title: 'Viết đoạn văn cảm nhận về mùa thu Hà Nội',
        instructions: 'Viết đoạn văn 10–12 câu có sử dụng biện pháp nhân hoá và chụp bài làm nộp cô.',
        subject: subjects[1]!,
        status: 'graded',
        dueAt: hoursFromNow(-30),
        submissionKinds: ['photo'],
        submittedAt: hoursFromNow(-36),
        feedback: {
          requiresRedo: false,
          sticker: 'chu-dep',
          label: '9,25 điểm',
          comment: 'Diễn đạt giàu hình ảnh, dùng phép nhân hoá tự nhiên. Trình bày rất sạch sẽ!',
        },
      },
      {
        id: 'demo-teen-5',
        title: 'Quay video bài thể dục nhịp điệu 8 nhịp',
        instructions: 'Quay video thực hiện đủ 4 động tác đầu tiên trong khoảng 45 giây.',
        subject: subjects[6]!,
        status: 'graded',
        dueAt: hoursFromNow(-72),
        submissionKinds: ['video'],
        submittedAt: hoursFromNow(-75),
        feedback: {
          requiresRedo: false,
          sticker: 'gioi-lam',
          label: 'Đạt',
          comment: 'Động tác dứt khoát, đúng nhịp!',
        },
      },
    ],
  };
}
