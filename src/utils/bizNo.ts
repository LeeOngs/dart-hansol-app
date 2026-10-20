export function normalizeBizNo(bizNo: string): string {
  return bizNo.replace(/\D/g, '');
}
