export const getErrorMessage = (err: any, fallback: string): string => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item: any) => item?.msg || JSON.stringify(item)).join('\n');
  }
  if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
    return 'Serwer nie odpowiedział na czas. Spróbuj ponownie.';
  }
  if (err?.message === 'Network Error') {
    return 'Nie udało się połączyć z serwerem. Sprawdź połączenie internetowe i spróbuj ponownie.';
  }
  if (err?.message) {
    return err.message;
  }
  return fallback;
};
