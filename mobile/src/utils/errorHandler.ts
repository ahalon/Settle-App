export const getErrorMessage = (err: any, fallback: string): string => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item: any) => item?.msg || JSON.stringify(item)).join('\n');
  }
  if (err?.message === 'Network Error') {
    return 'Błąd połączenia z serwerem. Sprawdź połączenie internetowe lub spróbuj za chwilę (serwer może się wybudzać).';
  }
  if (err?.message) {
    return err.message;
  }
  return fallback;
};
