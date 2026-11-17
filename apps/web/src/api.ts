import type { ErrorResponse, LobbyErrorCode, RoomPreview, SeatCredentials } from '@bang/contracts';

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: LobbyErrorCode };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
      },
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, value: body as T };
    const error = (body as Partial<ErrorResponse> | null)?.error;
    return { ok: false, error: typeof error === 'string' ? error : 'unavailable' };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

export const createRoom = (name: string) =>
  request<SeatCredentials>('/api/rooms', { method: 'POST', body: JSON.stringify({ name }) });

export const joinRoom = (roomCode: string, name: string) =>
  request<SeatCredentials>(`/api/rooms/${encodeURIComponent(roomCode)}/seats`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const getRoomPreview = (roomCode: string) =>
  request<RoomPreview>(`/api/rooms/${encodeURIComponent(roomCode)}`);

export const errorMessages: Record<LobbyErrorCode, string> = {
  invalid_request: 'Сервер не принял запрос. Обновите страницу.',
  invalid_name: 'Имя должно содержать от 1 до 24 символов без служебных знаков.',
  name_taken: 'Это имя уже занято в комнате — выберите другое.',
  room_not_found: 'Комната не найдена. Проверьте ссылку-приглашение.',
  room_full: 'В комнате уже 7 игроков — свободных мест нет.',
  room_closed: 'Комната больше не принимает игроков.',
  invalid_session: 'Это место больше не закреплено за браузером. Войдите заново.',
  not_attached: 'Место ещё не подключено. Подождите переподключения.',
  forbidden: 'Это действие доступно только хозяину комнаты.',
  unavailable: 'Сервер временно недоступен. Попробуйте ещё раз.',
};
