import { Redirect } from 'expo-router';
import { useSession } from '@/platform/session';

/** Điều hướng theo phiên: đang ở chế độ học sinh → trang của con; người lớn → trang chủ; chưa đăng nhập → đăng nhập. */
export default function Index() {
  const { adult, student } = useSession();
  if (student) return <Redirect href="/hoc-sinh" />;
  if (adult) return <Redirect href={adult.user.needsProfile ? '/dang-nhap/ten' : '/phu-huynh'} />;
  return <Redirect href="/dang-nhap" />;
}
