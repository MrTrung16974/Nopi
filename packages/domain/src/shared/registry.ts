/**
 * Registry dùng chung cho mọi điểm mở rộng (thang đánh giá, kiểu câu, loại báo cáo…).
 * Thêm một loại mới = register() thêm một phần tử, không sửa code ở chỗ dùng.
 */
export class Registry<T extends { readonly id: string }> {
  readonly #items = new Map<string, T>();

  constructor(private readonly kind: string) {}

  register(item: T): this {
    if (this.#items.has(item.id)) {
      throw new Error(`${this.kind} "${item.id}" đã được đăng ký`);
    }
    this.#items.set(item.id, item);
    return this;
  }

  get(id: string): T {
    const item = this.#items.get(id);
    if (!item) throw new Error(`Không tìm thấy ${this.kind} "${id}"`);
    return item;
  }

  has(id: string): boolean {
    return this.#items.has(id);
  }

  ids(): string[] {
    return [...this.#items.keys()];
  }

  all(): T[] {
    return [...this.#items.values()];
  }
}
