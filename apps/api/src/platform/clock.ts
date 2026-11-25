/** Đồng hồ tiêm vào được — test điều khiển "bây giờ" để kiểm hạn nộp, giờ yên lặng… */
export interface Clock {
  now(): Date;
}
export const CLOCK = Symbol('CLOCK');
export const systemClock: Clock = { now: () => new Date() };
