/**
 * Gói bán. GIÁ ĐANG LÀ GIÁ TẠM — chốt khi định giá (mục 6.7). Giá trong App Store / Google Play
 * cấu hình trên cửa hàng; price_vnd ở đây là giá bán trên web.
 * features: quyền theo gói — code chỉ đọc qua EntitlementService, không so plan_id.
 */
export const PLANS = [
  {
    id: 'family_trial',
    name: 'Dùng thử gia đình 7 ngày',
    buyer: 'family',
    period: 'month',
    priceVnd: 0,
    isActive: false, // không bán, chỉ cấp khi bắt đầu dùng thử
    features: { family_space: true, scan_quota_per_day: 10 },
  },
  {
    id: 'family_monthly',
    name: 'Gói gia đình — theo tháng',
    buyer: 'family',
    period: 'month',
    priceVnd: 49_000,
    isActive: true,
    features: { family_space: true, scan_quota_per_day: 30, retention_days_video: 730 },
  },
  {
    id: 'family_yearly',
    name: 'Gói gia đình — theo năm',
    buyer: 'family',
    period: 'year',
    priceVnd: 490_000,
    isActive: true,
    features: { family_space: true, scan_quota_per_day: 30, retention_days_video: 730 },
  },
  {
    id: 'school_year',
    name: 'Hợp đồng trường — theo năm học',
    buyer: 'school',
    period: 'school_year',
    priceVnd: 0, // theo hợp đồng, tính theo số học sinh
    isActive: true,
    features: { scan_quota_per_day: 50 },
  },
] as const;
