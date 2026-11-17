import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GameCommandResult,
  GameErrorCode,
  GameIntent,
  GameSyncResult,
  GameView,
} from '@bang/contracts';
import type { ConnectionState, GameSocket } from '../use-server-connection.js';
import {
  acceptsGame,
  claimOutbox,
  clearOutbox,
  outboxKey,
  readOutbox,
  type SubmittedCommand,
} from './command-state.js';

const errors: Record<GameErrorCode, string> = {
  invalid_intent: 'Действие не распознано. Выберите его снова.',
  invalid_state: 'Не удалось прочитать сохранённую партию. Сообщите хозяину комнаты.',
  wrong_actor: 'Сейчас ожидается действие другого игрока.',
  invalid_decision: 'Этот выбор уже изменился. Посмотрите новые варианты.',
  illegal_card: 'Эту карту сейчас нельзя использовать.',
  illegal_target: 'Эта цель сейчас недоступна.',
  illegal_choice: 'Проверьте количество и порядок выбранных карт.',
  match_ended: 'Партия уже завершена.',
  forbidden: 'Это действие вам недоступно.',
  resource_unavailable:
    'Не удалось продолжить добор или проверку. Партия сохранена; хозяин может завершить её без победителя.',
  invalid_request: 'Сервер не принял запрос. Обновите страницу.',
  not_attached: 'Возвращаемся на ваше место…',
  unavailable: 'Ответ сервера не получен. Сохранили запрос и повторим его без повторного действия.',
  room_not_found: 'Комната не найдена.',
  room_closed: 'Состав этой комнаты уже зафиксирован.',
  not_ready: 'Для начала нужны 4–7 готовых игроков.',
  stale_revision: 'Ситуация за столом изменилась. Выберите действие заново.',
  command_conflict:
    'Запрос с таким номером уже использован. Обновите состояние перед новым действием.',
  match_not_found: 'Партия ещё не началась или недоступна.',
};

export function useGameSession(
  roomCode: string,
  seatId: string | undefined,
  socket: GameSocket | null,
  status: ConnectionState,
) {
  const [game, setGame] = useState<GameView | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedCommand | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [attachmentId, setAttachmentId] = useState<string | undefined>(undefined);
  const submittedRef = useRef<SubmittedCommand | null>(null);
  const sendingRef = useRef(false);
  const attachedRef = useRef(false);
  const key = seatId ? outboxKey(roomCode, seatId) : null;
  const generation = useRef(0);
  const attached =
    status === 'connected' && attachmentId !== undefined && attachmentId === socket?.id;

  useEffect(() => {
    generation.current += 1;
    attachedRef.current = false;
    const version = generation.current;
    if (!key) return;
    void Promise.resolve()
      .then(() => readOutbox(localStorage, key))
      .then((saved) => {
        if (version !== generation.current) return;
        setGame(null);
        setAttachmentId(undefined);
        const hasLocks = typeof navigator.locks?.request === 'function';
        setStorageBlocked(!hasLocks);
        if (!hasLocks)
          setNotice(
            'Этот браузер не поддерживает безопасное согласование вкладок. Обновите браузер: пока доступен только просмотр партии.',
          );
        submittedRef.current = saved;
        setSubmitted(saved);
        setLoadedKey(key);
      })
      .catch(() => {
        if (version !== generation.current) return;
        setStorageBlocked(true);
        setNotice(
          'Не удалось прочитать сохранённый запрос. Действия приостановлены, чтобы не повторить ход.',
        );
      });
  }, [key]);

  useEffect(() => {
    if (status !== 'connected') attachedRef.current = false;
  }, [status]);

  const accept = useCallback(
    (next: GameView, attachment = false) => {
      if (!seatId) return;
      setGame((current) =>
        acceptsGame(current, next, roomCode, seatId, attachment) ? next : current,
      );
    },
    [roomCode, seatId],
  );

  const attachmentSucceeded = useCallback(
    (next?: GameView) => {
      generation.current += 1;
      attachedRef.current = true;
      setAttachmentId(socket?.id);
      if (next) accept(next, true);
    },
    [accept, socket],
  );

  useEffect(() => {
    if (!socket) return;
    const onState = (next: GameView) => {
      if (attachedRef.current) accept(next);
    };
    socket.on('game:state', onState);
    return () => {
      socket.off('game:state', onState);
    };
  }, [socket, accept]);

  const sync = useCallback(async () => {
    if (!socket?.connected || !attachedRef.current) return;
    const version = generation.current;
    try {
      const result: GameSyncResult = await socket.timeout(8_000).emitWithAck('game:sync', {});
      if (version !== generation.current) return;
      if (result.ok) accept(result.game);
      else if (result.error !== 'match_not_found') setNotice(errors[result.error]);
    } catch {
      if (version === generation.current)
        setNotice('Не удалось обновить стол. Повторите после восстановления связи.');
    }
  }, [socket, accept]);

  const retry = useCallback(async () => {
    const envelope = submittedRef.current;
    if (
      !envelope ||
      !socket?.connected ||
      !attachedRef.current ||
      sendingRef.current ||
      !key ||
      storageBlocked
    )
      return;
    const version = generation.current;
    sendingRef.current = true;
    setSending(true);
    try {
      let result: GameCommandResult;
      switch (envelope.event) {
        case 'game:start':
          result = await socket.timeout(8_000).emitWithAck('game:start', envelope.request);
          break;
        case 'game:abort':
          result = await socket.timeout(8_000).emitWithAck('game:abort', envelope.request);
          break;
        case 'game:command':
          result = await socket.timeout(8_000).emitWithAck('game:command', envelope.request);
          break;
      }
      if (version !== generation.current) return;
      // Unavailable can include an uncertain commit. Keep the identical envelope.
      if (!result.ok && (result.error === 'unavailable' || result.error === 'not_attached')) {
        setNotice(errors[result.error]);
        return;
      }
      let remaining: SubmittedCommand | null;
      try {
        remaining = await navigator.locks.request(key, () =>
          clearOutbox(localStorage, key, envelope.request.commandId),
        );
      } catch {
        setStorageBlocked(true);
        setNotice(
          'Не удалось сохранить подтверждение. Обновите страницу перед следующим действием.',
        );
        return;
      }
      if (version !== generation.current) return;
      submittedRef.current = remaining;
      setSubmitted(remaining);
      setNotice(result.ok ? null : errors[result.error]);
      await sync();
    } catch {
      if (version === generation.current) setNotice(errors.unavailable);
    } finally {
      sendingRef.current = false;
      if (version === generation.current) setSending(false);
    }
  }, [socket, key, storageBlocked, sync]);

  useEffect(() => {
    if (!attached || !submitted) return;
    void retry();
    const timer = window.setInterval(() => void retry(), 5_000);
    return () => window.clearInterval(timer);
  }, [attached, submitted, retry]);

  async function submit(envelope: SubmittedCommand) {
    if (
      !key ||
      !socket?.connected ||
      !attachedRef.current ||
      submittedRef.current ||
      storageBlocked
    )
      return;
    const version = generation.current;
    let claimed: SubmittedCommand;
    try {
      claimed = await navigator.locks.request(key, () => claimOutbox(localStorage, key, envelope));
    } catch {
      setStorageBlocked(true);
      setNotice(
        'Браузер не позволяет сохранить запрос. Разрешите хранение данных сайта перед действием.',
      );
      return;
    }
    if (version !== generation.current) return;
    submittedRef.current = claimed;
    setSubmitted(claimed);
    setNotice(
      claimed.request.commandId === envelope.request.commandId
        ? null
        : 'В другой вкладке уже отправлено действие. Сначала дождёмся его подтверждения.',
    );
  }

  useEffect(() => {
    if (!key) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return;
      try {
        const envelope = readOutbox(localStorage, key);
        submittedRef.current = envelope;
        setSubmitted(envelope);
      } catch {
        setStorageBlocked(true);
        setNotice('Не удалось прочитать запрос из другой вкладки. Действия приостановлены.');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const blocked = !attached || status !== 'connected' || submitted !== null || storageBlocked;
  return {
    game: game?.ownSeatId === seatId ? game : null,
    attached,
    ready: key !== null && loadedKey === key,
    blocked,
    submitted,
    sending,
    notice,
    attachmentSucceeded,
    sync,
    retry,
    start: (revision: number) => {
      void submit({
        event: 'game:start',
        request: { commandId: crypto.randomUUID(), expectedRevision: revision },
      });
    },
    act: async (intent: GameIntent) => {
      if (game)
        await submit({
          event: 'game:command',
          request: {
            commandId: crypto.randomUUID(),
            expectedRevision: game.revision,
            matchId: game.matchId,
            intent,
          },
        });
    },
    abort: () => {
      if (game)
        void submit({
          event: 'game:abort',
          request: {
            commandId: crypto.randomUUID(),
            expectedRevision: game.revision,
            matchId: game.matchId,
          },
        });
    },
  };
}
