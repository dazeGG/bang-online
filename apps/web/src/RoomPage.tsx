import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { LobbyErrorCode, LobbyResult, LobbyView, RoomPreview } from '@bang/contracts';
import { errorMessages, getRoomPreview, joinRoom } from './api.js';
import { NameField } from './NameField.js';
import { roomPath } from './navigation.js';
import {
  clearSeat,
  isSeatStorageKey,
  loadLastName,
  loadSeat,
  saveLastName,
  saveSeat,
  type StoredSeat,
} from './seat-storage.js';
import type { ConnectionState, GameSocket } from './use-server-connection.js';
import { SaloonLayout } from './SaloonLayout.js';
import { GameTable } from './game/GameTable.js';
import { useGameSession } from './game/use-game-session.js';

interface RoomPageProps {
  roomCode: string;
  socket: GameSocket | null;
  status: ConnectionState;
}

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'ready'; preview: RoomPreview }
  | { kind: 'error'; error: LobbyErrorCode };

export function RoomPage({ roomCode, socket, status }: RoomPageProps) {
  const [seat, setSeat] = useState<StoredSeat | null>(() => loadSeat(roomCode));
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gameSession = useGameSession(roomCode, seat?.seatId, socket, status);
  const { attachmentSucceeded } = gameSession;
  const storageReady = gameSession.ready;
  const [attachAttempt, setAttachAttempt] = useState(0);

  // Another tab of this browser may join or leave this room.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (isSeatStorageKey(event.key, roomCode)) setSeat(loadSeat(roomCode));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [roomCode]);

  // Server pushes: accept only views for this room that are not older than the current one.
  useEffect(() => {
    if (socket === null) return;
    const onState = (next: LobbyView) => {
      if (next.roomCode !== roomCode) return;
      setLobby((current) =>
        current === null || next.revision >= current.revision ? next : current,
      );
    };
    const onClosed = ({ reason }: { reason: 'left' | 'kicked' }) => {
      clearSeat(roomCode);
      setSeat(null);
      setLobby(null);
      setNotice(
        reason === 'kicked' ? 'Хозяин комнаты убрал вас со стола.' : 'Вы покинули комнату.',
      );
    };
    socket.on('lobby:state', onState);
    socket.on('lobby:closed', onClosed);
    return () => {
      socket.off('lobby:state', onState);
      socket.off('lobby:closed', onClosed);
    };
  }, [socket, roomCode]);

  // Full authenticated resynchronization after every (re)connect or credential change.
  const seatToken = seat?.seatToken;
  useEffect(() => {
    if (socket === null || status !== 'connected' || seatToken === undefined || !storageReady)
      return;
    let cancelled = false;
    socket
      .timeout(8_000)
      .emitWithAck('lobby:attach', { roomCode, seatToken })
      .then((result: LobbyResult) => {
        if (cancelled) return;
        if (result.ok) {
          setLobby(result.lobby);
          attachmentSucceeded(result.game);
          setNotice(null);
        } else if (result.error === 'invalid_session' || result.error === 'invalid_request') {
          clearSeat(roomCode);
          setSeat(null);
          setLobby(null);
          setNotice(errorMessages.invalid_session);
        } else {
          setNotice(errorMessages[result.error]);
        }
      })
      .catch(() => {
        // Timed out; the next reconnect retries the attachment.
        if (!cancelled) setNotice(errorMessages.unavailable);
      });
    return () => {
      cancelled = true;
    };
  }, [socket, status, roomCode, seatToken, attachmentSucceeded, attachAttempt, storageReady]);

  if (seat === null) {
    return (
      <JoinPanel
        roomCode={roomCode}
        notice={notice}
        onJoined={(stored) => {
          saveSeat(roomCode, stored);
          setNotice(null);
          setSeat(stored);
        }}
      />
    );
  }

  if (lobby === null) {
    return (
      <SaloonLayout variant="plain" title="Возвращаемся на ваше место…" busy>
        <p className="room-line">Комната {roomCode}</p>
        {(notice || gameSession.notice) && (
          <p className="form-error" role="alert">
            {notice ?? gameSession.notice}
          </p>
        )}
        {notice && (
          <button
            type="button"
            className="button"
            onClick={() => setAttachAttempt((attempt) => attempt + 1)}
          >
            Повторить подключение
          </button>
        )}
      </SaloonLayout>
    );
  }

  if (gameSession.game) {
    return (
      <GameTable
        game={gameSession.game}
        disabled={gameSession.blocked}
        notice={gameSession.notice}
        submitted={gameSession.submitted !== null}
        sending={gameSession.sending}
        onAction={gameSession.act}
        onAbort={gameSession.abort}
        onSync={() => void gameSession.sync()}
        onRetry={() => void gameSession.retry()}
      />
    );
  }
  if (lobby.status !== 'lobby') {
    return (
      <SaloonLayout variant="plain" title="Возвращаемся в партию…" busy>
        <p className="room-line">Комната {roomCode}</p>
        {(notice || gameSession.notice) && (
          <p className="form-error" role="alert">
            {notice ?? gameSession.notice}
          </p>
        )}
        <button
          type="button"
          className="button"
          onClick={() => setAttachAttempt((attempt) => attempt + 1)}
        >
          Обновить партию
        </button>
      </SaloonLayout>
    );
  }

  return (
    <LobbyPanel
      lobby={lobby}
      seatId={seat.seatId}
      socket={socket}
      online={status === 'connected'}
      notice={gameSession.notice ?? notice}
      onNotice={setNotice}
      startDisabled={gameSession.blocked}
      onStart={() => gameSession.start(lobby.revision)}
    />
  );
}

function JoinPanel({
  roomCode,
  notice,
  onJoined,
}: {
  roomCode: string;
  notice: string | null;
  onJoined: (seat: StoredSeat) => void;
}) {
  const [preview, setPreview] = useState<PreviewState>({ kind: 'loading' });
  const [name, setName] = useState(loadLastName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRoomPreview(roomCode).then((result) => {
      if (cancelled) return;
      setPreview(
        result.ok
          ? { kind: 'ready', preview: result.value }
          : { kind: 'error', error: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await joinRoom(roomCode, name);
    setPending(false);
    if (!result.ok) {
      setError(errorMessages[result.error]);
      return;
    }
    saveLastName(name.trim());
    onJoined({ seatId: result.value.seatId, seatToken: result.value.seatToken });
  }

  if (preview.kind === 'loading') {
    return <SaloonLayout variant="join" title="Ищем комнату…" busy />;
  }

  if (preview.kind === 'error') {
    return (
      <SaloonLayout variant="join" title="Не удалось открыть комнату">
        <p className="form-error">{errorMessages[preview.error]}</p>
        <a className="button button--primary" href="/">
          На главную
        </a>
      </SaloonLayout>
    );
  }

  const { joinable } = preview.preview;
  return (
    <SaloonLayout variant="join" title="Займите место за столом">
      <p className="room-line">Комната {roomCode}</p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {joinable ? (
        <form
          className="form"
          aria-labelledby="page-title"
          onSubmit={handleJoin}
          method="post"
          action={`/api/rooms/${roomCode}/seats`}
        >
          <NameField
            id="join-name"
            value={name}
            onChange={(next) => {
              setName(next);
              setError(null);
            }}
            errorId="join-error"
            invalid={error !== null}
          />
          <p id="join-error" className="form-error" role="alert">
            {error}
          </p>
          <button className="button button--primary" type="submit" disabled={pending}>
            {pending ? 'Садимся…' : 'Сесть за стол'}
          </button>
        </form>
      ) : (
        <p className="form-error">
          {errorMessages[preview.preview.status === 'lobby' ? 'room_full' : 'room_closed']}
        </p>
      )}
    </SaloonLayout>
  );
}

function LobbyPanel({
  lobby,
  seatId,
  socket,
  online,
  notice,
  onNotice,
  startDisabled,
  onStart,
}: {
  lobby: LobbyView;
  seatId: string;
  socket: GameSocket | null;
  online: boolean;
  notice: string | null;
  onNotice: (message: string | null) => void;
  startDisabled: boolean;
  onStart: () => void;
}) {
  const [pending, setPending] = useState(false);
  const me = lobby.seats.find((seat) => seat.seatId === seatId);
  const amHost = me?.host === true;
  const inviteLink = `${window.location.origin}${roomPath(lobby.roomCode)}`;

  async function command(
    run: (socket: GameSocket) => Promise<{ ok: true } | { ok: false; error: LobbyErrorCode }>,
  ) {
    if (socket === null || pending) return;
    setPending(true);
    try {
      const result = await run(socket);
      onNotice(result.ok ? null : errorMessages[result.error]);
    } catch {
      onNotice(errorMessages.unavailable);
    } finally {
      setPending(false);
    }
  }

  return (
    <SaloonLayout variant="lobby" title="Салун ждёт игроков" lantern>
      <p className="room-line room-line--center">Комната {lobby.roomCode}</p>
      {notice && (
        <p className="form-error" role="alert">
          {notice}
        </p>
      )}

      <ol className="seats" aria-label={`Игроки: ${lobby.seats.length} из ${lobby.maxPlayers}`}>
        {lobby.seats.map((seat) => (
          <li
            key={seat.seatId}
            className={`seat${seat.seatId === seatId ? ' seat--me' : ''}${amHost && seat.seatId !== seatId ? ' seat--removable' : ''}`}
          >
            <span className="seat-initial" aria-hidden="true">
              {Array.from(seat.name)[0]?.toLocaleUpperCase('ru')}
            </span>
            <span className="seat-name">
              <span className="seat-display-name">{seat.name}</span>
              {(seat.seatId === seatId || seat.host || !seat.connected) && (
                <span className="seat-meta">
                  {[
                    seat.seatId === seatId ? 'вы' : null,
                    seat.host ? 'хозяин' : null,
                    !seat.connected ? 'не в сети' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
              <span className="visually-hidden">{seat.connected ? ', в сети' : ', не в сети'}</span>
            </span>
            <span className={`ready ready--${seat.ready ? 'yes' : 'no'}`}>
              {seat.ready && <img src="/icons/check.svg" alt="" width="20" height="20" />}
              {seat.ready ? 'Готов' : 'Не готов'}
            </span>
            {amHost && seat.seatId !== seatId && (
              <button
                type="button"
                className="button button--kick"
                disabled={!online || pending || startDisabled}
                aria-label={`Убрать игрока ${seat.name}`}
                onClick={() => {
                  if (window.confirm(`Убрать игрока «${seat.name}» из комнаты?`)) {
                    void command((s) =>
                      s.timeout(8_000).emitWithAck('lobby:kick', { seatId: seat.seatId }),
                    );
                  }
                }}
              >
                <img src="/icons/x.svg" alt="" width="20" height="20" />
                <span className="kick-label">Убрать</span>
              </button>
            )}
          </li>
        ))}
      </ol>

      <InviteLink link={inviteLink} />

      <div className={`lobby-actions${amHost ? ' lobby-actions--host' : ''}`}>
        {amHost && (
          <button
            type="button"
            className="button button--primary lobby-start"
            disabled={!lobby.canStart || startDisabled || pending}
            onClick={onStart}
          >
            Начать партию
          </button>
        )}
        <button
          type="button"
          className={`button ${me?.ready ? '' : 'button--primary'}`}
          aria-pressed={me?.ready ?? false}
          disabled={!online || pending || startDisabled || me === undefined}
          onClick={() =>
            void command((s) =>
              s.timeout(8_000).emitWithAck('lobby:set-ready', { ready: !me?.ready }),
            )
          }
        >
          {me?.ready ? 'Я не готов' : 'Я готов'}
        </button>
        <button
          type="button"
          className="button button--quiet"
          disabled={!online || pending || startDisabled}
          onClick={() => {
            if (window.confirm('Покинуть комнату? Ваше место освободится.')) {
              void command((s) => s.timeout(8_000).emitWithAck('lobby:leave'));
            }
          }}
        >
          Покинуть комнату
        </button>
      </div>
    </SaloonLayout>
  );
}

function InviteLink({ link }: { link: string }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    let text: string;
    try {
      await navigator.clipboard.writeText(link);
      text = 'Ссылка скопирована';
    } catch {
      text = 'Не удалось скопировать — выделите ссылку вручную';
    }
    window.clearTimeout(timer.current);
    setMessage('');
    requestAnimationFrame(() => setMessage(text));
    timer.current = window.setTimeout(() => setMessage(''), 2_500);
  }

  return (
    <div className="invite">
      <label htmlFor="invite-link">Приглашение</label>
      <div className="invite-row">
        <input
          id="invite-link"
          name="invitation"
          type="text"
          readOnly
          className="invite-url"
          value={link}
          onFocus={(event) => event.target.select()}
        />
        <button type="button" className="button button--small" onClick={() => void copy()}>
          <img src="/icons/copy.svg" alt="" width="20" height="20" />
          Копировать
        </button>
      </div>
      <span className="copy-status" role="status">
        {message}
      </span>
    </div>
  );
}
