// ユーザー投入データは localStorage に保存する（SPEC.md 8.2節）。
// 同梱データセットは動的 import 経由で再取得できるため対象外。
const STORAGE_KEY = 'alembic:userRecipeSetJson';

export function saveUserRecipeSetJson(json: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // プライベートブラウジングや容量超過で失敗しても、アプリの動作自体は継続できる。
  }
}

export function loadUserRecipeSetJson(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearUserRecipeSetJson(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 無視してよい。
  }
}
