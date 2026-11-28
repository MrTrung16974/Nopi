'use client';
import { checkoutResponseSchema, familySpaceSchema, orderStatusSchema, paymentMethodSchema, planSchema, type PaymentMethod } from '@nopi/contracts';
import { vi } from '@nopi/copy';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Shell } from '@/components/Shell';
import { call, errorText } from '@/lib/client';
import { useApi } from '@/lib/use-api';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');
const PERIOD: Record<string, string> = { month: '/tháng', year: '/năm', school_year: '/năm học' };

/** Phụ huynh quản lý không gian gia đình và mua gói trên web (cổng thanh toán trong nước). */
function FamilyPage() {
  const fam = useApi(() => call('/family-spaces/mine', { schema: z.object({ space: familySpaceSchema.nullable() }) }), []);
  const plans = useApi(() => call('/billing/plans?buyer=family', { schema: z.array(planSchema), auth: false }), []);
  const methods = useApi(() => call('/billing/payment-methods', { schema: z.array(paymentMethodSchema), auth: false }), []);
  const [method, setMethod] = useState<PaymentMethod['id'] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const space = fam.data?.space;
  // Một cổng → chọn sẵn; nhiều cổng → phụ huynh chọn
  const provider = method ?? (methods.data?.length === 1 ? methods.data[0]!.id : null);

  // Quay về từ cổng thanh toán: ?order=… → hỏi trạng thái đơn
  useEffect(() => {
    const order = new URLSearchParams(location.search).get('order');
    if (!order) return;
    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      try {
        const s = await call(`/billing/orders/${order}`, { schema: orderStatusSchema });
        if (s.status !== 'pending' || tries > 15) {
          clearInterval(id);
          setMsg(s.status === 'paid' ? { ok: true, text: 'Thanh toán thành công — gói đã được mở.' } : { ok: false, text: 'Thanh toán chưa thành công, bạn thử lại nhé.' });
          await fam.reload();
          history.replaceState(null, '', '/gia-dinh');
        }
      } catch (e) {
        clearInterval(id);
        setMsg({ ok: false, text: `Chưa kiểm tra được đơn hàng: ${errorText(e)}. Tải lại trang sau ít phút để xem gói đã mở chưa.` });
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const start = async () => {
    setMsg(null);
    try {
      await call('/family-spaces', { method: 'POST' });
      await fam.reload();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  const buy = async (planId: string) => {
    if (!space) return;
    setMsg(null);
    if (!provider) return setMsg({ ok: false, text: 'Bạn chọn cách thanh toán trước nhé.' });
    try {
      // Server gắn ?order=<mã đơn> vào trang quay về
      const co = await call(`/family-spaces/${space.id}/checkout`, { method: 'POST', body: { planId, provider, returnUrl: `${location.origin}/gia-dinh` }, schema: checkoutResponseSchema });
      location.href = co.payUrl;
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  return (
    <>
      <h1>{vi.family.title}</h1>
      <p className="muted">{vi.family.pitch}</p>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
      {fam.loading && <p className="muted">Đang tải…</p>}
      {!fam.loading && !space && <button className="primary" onClick={start}>{vi.family.startTrial}</button>}
      {space && (
        <div className="stack">
          <div className="card">
            <strong>{space.name}</strong>
            <p className={space.entitlement.active ? '' : 'error'} style={{ margin: '6px 0 0' }}>
              {!space.entitlement.active
                ? vi.family.expired
                : space.entitlement.status === 'trial'
                  ? vi.family.trialUntil(fmt(space.entitlement.currentPeriodEnd))
                  : vi.family.activeUntil(space.entitlement.planName ?? '', fmt(space.entitlement.currentPeriodEnd))}
            </p>
          </div>
          <h2>Các con</h2>
          {space.children.length === 0 && <p className="muted">Chưa có con nào trong không gian gia đình. Thêm con trên app Nopi.</p>}
          {space.children.map((c) => (
            <div key={c.studentId} className="card">
              <strong>{c.nickname ? `${c.nickname} · ${c.fullName}` : c.fullName}</strong> <span className="muted">· lớp {c.grade}</span>
              {space.entitlement.active && c.teachingAssignmentIds[0] && (
                <span> · <Link href={`/day/${c.teachingAssignmentIds[0]}`}>Giao bài</Link></span>
              )}
            </div>
          ))}
          <h2>Gói</h2>
          {methods.data && methods.data.length === 0 && (
            <p className="muted">Hiện chưa mở thanh toán trực tuyến trên web. Gói gia đình sẽ sớm được mở bán.</p>
          )}
          {methods.data && methods.data.length > 1 && (
            <div className="row" role="radiogroup" aria-label="Cách thanh toán">
              {methods.data.map((m) => (
                <label key={m.id} className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" name="payment-method" checked={provider === m.id} onChange={() => setMethod(m.id)} />
                  {m.name}
                </label>
              ))}
            </div>
          )}
          <div className="row">
            {plans.data?.map((p) => (
              <div key={p.id} className="card stack" style={{ minWidth: 220 }}>
                <strong>{p.name}</strong>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{p.priceVnd.toLocaleString('vi-VN')}đ<span className="muted" style={{ fontSize: 14 }}>{PERIOD[p.period]}</span></span>
                <button className="primary" onClick={() => buy(p.id)} disabled={!methods.data?.length}>{space.entitlement.active && space.entitlement.status !== 'trial' ? 'Gia hạn' : 'Mua'}</button>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Giá đang là giá tạm. Mua trên web hay trong app đều dùng được ở mọi nơi.</p>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Shell>
      <FamilyPage />
    </Shell>
  );
}
