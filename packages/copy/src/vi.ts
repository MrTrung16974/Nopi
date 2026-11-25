import type { Audience, DisplayStatus } from '@nopi/domain';

/**
 * Câu chữ tiếng Việt đời thường. Không dùng: submit, upload, dashboard…
 * Sửa câu chữ = sửa file này; sau này thêm ngôn ngữ khác (tiếng dân tộc, tiếng Anh) = thêm file cùng kiểu.
 */
export const vi = {
  status: {
    student: {
      assigned: 'Con chưa làm',
      submitted: 'Đã gửi cho cô',
      returned: 'Cô nhờ con làm lại',
      graded: 'Cô đã chấm',
      overdue: 'Con chưa làm', // học sinh không bị dọa
    },
    guardian: {
      assigned: 'Chưa làm',
      submitted: 'Đã nộp',
      returned: 'Cô yêu cầu làm lại',
      graded: 'Cô đã nhận xét',
      overdue: 'Quá hạn, chưa nộp',
    },
    teacher: {
      assigned: 'Chưa nộp',
      submitted: 'Chờ chấm',
      returned: 'Đang làm lại',
      graded: 'Đã chấm',
      overdue: 'Quá hạn',
    },
  } satisfies Record<Audience, Record<DisplayStatus, string>>,
  lateLabel: 'Nộp muộn',
  guardianSubmittedLabel: 'Phụ huynh nộp hộ',
  parentAssignedLabel: 'Bố mẹ giao',
  actions: {
    takePhoto: 'Chụp ảnh',
    recordVideo: 'Quay video',
    recordAudio: 'Ghi âm',
    sendToTeacher: 'Gửi cho cô',
    redo: 'Làm lại',
    doNow: 'Làm ngay',
    assignNow: 'Giao ngay',
    scheduleAssign: 'Hẹn giờ giao',
    saveAndNext: 'Lưu & bài tiếp',
    remindMissing: 'Nhắc các em chưa nộp',
    letChildStudy: 'Cho con học',
  },
  sending: 'Đang gửi…',
  sentToTeacher: 'Cô đã nhận được bài!',
  todayCount: (n: number) => (n === 0 ? 'Hôm nay hết bài rồi, đi chơi thôi!' : `Hôm nay con có ${n} bài`),
  greeting: (name: string) => `Chào ${name}!`,
  auth: {
    welcome: 'Chào mừng đến với Nopi',
    tagline: 'Nộp bài, vượt vũ môn cùng Chép Con',
    phoneLabel: 'Số điện thoại của bố mẹ hoặc thầy cô',
    phonePlaceholder: '0912 345 678',
    getCode: 'Nhận mã',
    codeSentTo: (masked: string) => `Mã gồm 6 số đã gửi tới ${masked}`,
    codeLabel: 'Mã xác nhận',
    confirm: 'Xác nhận',
    resend: 'Gửi lại mã',
    resendIn: (s: number) => `Gửi lại mã sau ${s} giây`,
    askName: 'Bố mẹ / thầy cô tên là gì?',
    namePlaceholder: 'Ví dụ: Nguyễn Thị Hoa',
    save: 'Lưu',
    childLogin: 'Con tự đăng nhập',
    logout: 'Đăng xuất',
  },
  parent: {
    myChildren: 'Con của tôi',
    noChildren: 'Chưa có con nào. Quét phiếu mời cô giáo phát hoặc nhập mã trên phiếu để thêm con.',
    addChild: 'Thêm con',
    scanInvite: 'Quét mã trên phiếu mời',
    typeInvite: 'Hoặc nhập mã trên phiếu',
    invitePlaceholder: 'ABC-DEF-GHJK',
    relationship: 'Bạn là gì của con?',
    consentTitle: 'Đồng ý điều khoản',
    consentText:
      'Tôi là cha, mẹ hoặc người giám hộ hợp pháp của con. Tôi đồng ý để nhà trường và Nopi xử lý thông tin học tập của con (họ tên, lớp, bài làm, nhận xét) chỉ để phục vụ việc học, theo Luật Bảo vệ dữ liệu cá nhân. Tôi có thể rút lại đồng ý bất cứ lúc nào.',
    agree: 'Tôi đồng ý',
    needsConsent: 'Cần đồng ý điều khoản mới',
    webLogin: 'Đăng nhập Nopi trên máy tính',
  },
  student: {
    exit: 'Thoát',
    noClass: 'Con chưa vào lớp nào. Nhờ bố mẹ hoặc cô giáo giúp nhé!',
    noSubjects: 'Cô chưa giao môn nào cho lớp con.',
    scanCard: 'Quét thẻ của con',
    typeCard: 'Gõ mã trên thẻ',
    codeAndPin: 'Mã học sinh + PIN',
    studentCode: 'Mã học sinh (8 số)',
    pin: 'Mã PIN (6 số)',
    enter: 'Vào học',
  },
  work: {
    listen: 'Nghe đề',
    stopListening: 'Dừng đọc',
    yourWork: 'Bài con đã làm',
    review: 'Xem lại bài',
    addMore: 'Chụp thêm',
    retake: 'Làm lại',
    removed: 'Đã bỏ',
    sendFailed: 'Chưa gửi được',
    tryAgain: 'Gửi lại',
    attempt: (n: number) => `Lần nộp ${n}`,
    teacherSays: 'Cô nhận xét',
    playTeacher: 'Nghe cô nói',
    redoTitle: 'Cô nhờ con làm lại',
    photosLeft: (n: number) => (n > 0 ? `còn ${n} ảnh` : 'đủ ảnh rồi'),
    maxLength: (s: number) => `Tối đa ${s >= 60 ? `${Math.round((s / 60) * 10) / 10} phút` : `${s} giây`}`,
    recording: 'Đang ghi âm… bấm để dừng',
    tapToRecord: 'Bấm nút đỏ để ghi âm',
    videoOnPhone: 'Quay video bằng app Nopi trên điện thoại nhé',
    submittedByParent: 'Bố mẹ nộp hộ',
    noWork: 'Chưa có bài nào',
    seeWork: 'Xem bài của con',
    submitForChild: 'Nộp hộ con',
  },
  teacher: {
    today: 'Hôm nay',
    toGrade: (n: number) => (n === 0 ? 'Không có bài chờ chấm' : `Cần chấm: ${n} bài`),
    myClasses: 'Lớp của tôi',
    submittedOf: (done: number, total: number) => `${done}/${total} đã nộp`,
    newAssignment: '+ Giao bài',
    classesStep: 'Giao cho lớp',
    contentStep: 'Nội dung đề',
    titleLabel: 'Tên bài',
    instructionsLabel: 'Lời dặn (không bắt buộc)',
    kindsLabel: 'Cách nộp',
    dueLabel: 'Hạn nộp',
    dueOptions: { tonight: 'Tối nay', tomorrow: '20:00 ngày mai', twoDays: '2 ngày nữa', week: '1 tuần' },
    assigned: 'Đã giao bài!',
    grade: 'Chấm bài',
    requireRedo: 'Yêu cầu làm lại',
    redoNote: 'Lời nhắn cho em',
    commentLabel: 'Nhận xét',
    saveNext: 'Lưu & bài tiếp',
    allDone: 'Đã chấm xong các bài đang chờ!',
    noSubmission: 'Em chưa nộp bài',
    scoreLabel: 'Điểm (0–10)',
    recordComment: 'Giữ để nói nhận xét',
  },
  kinds: { photo: 'Ảnh', video: 'Video', audio: 'Ghi âm', document: 'Tài liệu' } as Record<'photo' | 'video' | 'audio' | 'document', string>,
  levels: {
    HOAN_THANH_TOT: 'Hoàn thành tốt',
    HOAN_THANH: 'Hoàn thành',
    CHUA_HOAN_THANH: 'Chưa hoàn thành',
    DAT: 'Đạt',
    CHUA_DAT: 'Chưa đạt',
  } as Record<string, string>,
  /** Nội dung thông báo đẩy / tin Zalo. Ngắn, không chứa thông tin nhạy cảm (đi qua dịch vụ đẩy tin). */
  notify: {
    assignmentPublished: {
      guardian: (p: { child: string; subject: string; title: string; due: string }) => ({ title: `Bài mới · ${p.subject}`, body: `${p.child}: ${p.title} — ${p.due}` }),
      student: (p: { subject: string; title: string }) => ({ title: 'Con có bài mới 🎒', body: `${p.subject}: ${p.title}` }),
    },
    dueReminder: {
      guardian: (p: { child: string; subject: string; title: string; due: string }) => ({ title: `Nhắc bài · ${p.subject}`, body: `${p.child} chưa nộp "${p.title}" — ${p.due}` }),
      student: (p: { subject: string; title: string }) => ({ title: 'Mai đến hạn nộp bài nè 🐟', body: `${p.subject}: ${p.title}` }),
    },
    teacherCommented: {
      guardian: (p: { child: string; subject: string; title: string }) => ({ title: `Cô đã nhận xét · ${p.subject}`, body: `${p.child}: ${p.title}` }),
      student: (p: { subject: string; title: string }) => ({ title: 'Cô đã chấm bài ⭐', body: `${p.subject}: ${p.title}` }),
    },
    redoRequested: {
      guardian: (p: { child: string; subject: string; title: string }) => ({ title: `Cô nhờ làm lại · ${p.subject}`, body: `${p.child}: ${p.title}` }),
      student: (p: { subject: string; title: string }) => ({ title: 'Cô nhờ con làm lại 🔄', body: `${p.subject}: ${p.title}` }),
    },
    remindMissing: {
      guardian: (p: { child: string; subject: string; title: string; due: string }) => ({ title: `Cô nhắc nộp bài · ${p.subject}`, body: `${p.child} chưa nộp "${p.title}" — ${p.due}` }),
      student: (p: { subject: string; title: string }) => ({ title: 'Cô nhắc con nộp bài 🎒', body: `${p.subject}: ${p.title}` }),
    },
    teacherDigest: (lines: { cls: string; subject: string; done: number; total: number }[]) => ({
      title: 'Tổng hợp bài nộp hôm nay',
      body: lines.map((l) => `${l.cls}: ${l.done}/${l.total} em đã nộp ${l.subject}`).join('\n'),
    }),
    planExpiring: (p: { plan: string; date: string; trial: boolean }) => ({
      title: p.trial ? 'Sắp hết thời gian dùng thử' : 'Gói sắp hết hạn',
      body: `${p.plan} hết hạn ngày ${p.date}. Gia hạn để tiếp tục giao bài cho con — bài cũ và nhận xét vẫn được giữ nguyên.`,
    }),
    reportReady: (p: { title: string }) => ({ title: 'Báo cáo đã sẵn sàng', body: `${p.title} — mở để tải về (link dùng được trong 24 giờ)` }),
    mediaExpiring: (p: { child: string; count: number; date: string }) => ({
      title: 'Sắp xoá ảnh/video bài cũ',
      body: `${p.count} ảnh/video bài của ${p.child} sẽ được xoá ngày ${p.date} theo thời hạn lưu của trường. Mở app để tải về nếu muốn giữ.`,
    }),
    inbox: 'Thông báo',
    empty: 'Chưa có thông báo nào',
    markAllRead: 'Đánh dấu đã đọc hết',
    settings: 'Cài đặt thông báo',
    settingsHint: 'Bỏ chọn để không nhận tin đẩy/Zalo cho loại đó — thông báo vẫn có trong hộp thư. "Cần làm lại", báo cáo, sắp xoá ảnh và gói sắp hết hạn luôn được gửi.',
    templateLabels: {
      assignment_published: 'Bài mới được giao cho con',
      due_reminder: 'Nhắc bài sắp đến hạn (18:00)',
      teacher_commented: 'Thầy cô đã nhận xét',
      teacher_digest: 'Bản tổng hợp bài nộp cho giáo viên',
    } as Record<'assignment_published' | 'due_reminder' | 'teacher_commented' | 'teacher_digest', string>,
    remindButton: (n: number) => `Nhắc ${n} em chưa nộp`,
    reminded: (n: number) => `Đã nhắc phụ huynh của ${n} em`,
  },
  family: {
    title: 'Không gian gia đình',
    pitch: 'Bố mẹ tự giao bài và nhận xét cho con — kể cả khi trường chưa dùng Nopi.',
    startTrial: 'Dùng thử 7 ngày miễn phí',
    trialUntil: (d: string) => `Đang dùng thử tới ${d}`,
    activeUntil: (plan: string, d: string) => `${plan} · dùng tới ${d}`,
    canceledUntil: (d: string) => `Đã tắt gia hạn · dùng tới ${d}`,
    expired: 'Gói gia đình đã hết hạn. Bài cũ và nhận xét của con vẫn được giữ nguyên.',
    assignForChild: 'Giao bài cho con',
    addChild: 'Thêm con chưa học trường dùng Nopi',
    childName: 'Họ và tên con',
    childNickname: 'Tên gọi ở nhà (không bắt buộc)',
    childGrade: 'Con học lớp mấy?',
    added: 'Đã thêm con',
  },
  scan: {
    button: '📷 Quét đề từ ảnh',
    practiceButton: '📷 Tự luyện: quét đề',
    capturePage: 'Chụp trang',
    pagesTaken: (n: number) => `Đã chụp ${n}/5 trang`,
    read: 'Đọc đề',
    reading: 'Đang đọc đề… (vài giây)',
    reviewTitle: 'Soát lại đề',
    reviewHint: 'Ô tô vàng là chỗ AI chưa chắc — xem kỹ nhé. AI chỉ chép đề, không giải.',
    unsure: 'AI chưa chắc',
    remove: 'Bỏ',
    continueAssign: 'Tiếp tục giao bài',
    question: (n: number) => `Câu ${n}`,
    originals: 'Ảnh gốc của đề',
    practiceSubject: 'Môn',
    practiceTitle: 'Tên bài tự luyện',
    savePractice: 'Lưu bài tự luyện',
    practiceLabel: 'Tự luyện',
    done: 'Đã xong',
    markDone: 'Con làm xong rồi',
  },
  gate: {
    title: 'Dành cho bố mẹ',
    question: (a: number, b: number) => `${a} × ${b} = ?`,
    wrong: 'Chưa đúng, thử lại nhé',
    cancel: 'Quay lại',
  },
  scanner: {
    needPermission: 'Nopi cần dùng camera để quét mã QR',
    allow: 'Cho phép dùng camera',
    hint: 'Đưa mã QR vào giữa khung hình',
    unknown: 'Mã QR này không phải của Nopi',
  },
  reports: {
    childSection: 'Báo cáo học tập',
    childHint: 'Tổng hợp bài và nhận xét của thầy cô theo từng môn — tiện mang đi họp phụ huynh.',
    thisMonth: 'Tải báo cáo tháng này (PDF)',
    lastMonth: 'Tháng trước',
    preparing: 'Đang chuẩn bị báo cáo…',
    later: 'Báo cáo đang được làm, xong sẽ có thông báo.',
    open: 'Mở báo cáo',
    expired: 'Link tải đã hết hạn (24 giờ). Xuất lại báo cáo mới nhé.',
    failed: 'Không xuất được báo cáo, thử lại sau nhé',
  },
  submittedRatio: (cls: string, subject: string, done: number, total: number) =>
    `${subject} ${cls} · ${done}/${total} đã nộp`,
} as const;

/** Hạn nộp nói theo cách đời thường: "Hạn: tối nay", "Hạn: tối mai", "Hạn: thứ Sáu". */
export function friendlyDue(due: Date, now: Date): string {
  const VN = 7 * 3600_000;
  const day = (d: Date) => Math.floor((d.getTime() + VN) / 86_400_000);
  const diff = day(due) - day(now);
  const hour = new Date(due.getTime() + VN).getUTCHours();
  const part = hour < 11 ? 'sáng' : hour < 14 ? 'trưa' : hour < 18 ? 'chiều' : 'tối';
  if (diff === 0) return `Hạn: ${part} nay`;
  if (diff === 1) return `Hạn: ${part} mai`;
  if (diff > 1 && diff < 7) {
    const wd = new Date(due.getTime() + VN).getUTCDay();
    return `Hạn: ${wd === 0 ? 'Chủ nhật' : `thứ ${['', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy'][wd]}`}`;
  }
  const d = new Date(due.getTime() + VN);
  return `Hạn: ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
