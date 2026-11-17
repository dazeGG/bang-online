import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { LobbyErrorCode, LobbyResult, LobbyView, RoomPreview } from '@bang/contracts';
import { errorMessages, getRoomPreview, joinRoom } from './api.js';
import { NameField } from './NameField.js';
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
    if (socket === null || status !== 'connected' || seatToken === undefined) return;
    let cancelled = false;
    socket
      .timeout(8_000)
      .emitWithAck('lobby:attach', { roomCode, seatToken })
      .then((result: LobbyResult) => {
        if (cancelled) return;
        if (result.ok) {
          setLobby(result.lobby);
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
  }, [socket, status, roomCode, seatToken]);

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
      <section className="panel" aria-busy="true">
        <h1 className="page-title">Возвращаемся на ваше место…</h1>
        {notice && <p className="form-error">{notice}</p>}
      </section>
    );
  }

  return (
    <LobbyPanel
      lobby={lobby}
      seatId={seat.seatId}
      socket={socket}
      online={status === 'connected'}
      notice={notice}
      onNotice={setNotice}
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
    return (
      <section className="panel" aria-busy="true">
        <h1 className="page-title">Ищем комнату…</h1>
      </section>
    );
  }

  if (preview.kind === 'error') {
    return (
      <section className="panel">
        <h1 className="page-title">Не удалось открыть комнату</h1>
        <p className="form-error">{errorMessages[preview.error]}</p>
        <a className="button" href="/">
          На главную
        </a>
      </section>
    );
  }

  const { seatCount, maxPlayers, joinable } = preview.preview;
  return (
    <section className="panel join-panel" aria-labelledby="join-title">
      <p className="eyebrow">Приглашение · комната {roomCode}</p>
      <h1 id="join-title" className="page-title">
        Займите место за столом
      </h1>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <p className="muted">
        За столом {seatCount} из {maxPlayers}.
      </p>
      {joinable ? (
        <form className="form" aria-labelledby="join-title" onSubmit={handleJoin}>
          <NameField
            id="join-name"
            value={name}
            onChange={setName}
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
        <p className="form-error">{errorMessages.room_full}</p>
      )}
    </section>
  );
}

function LobbyPanel({
  lobby,
  seatId,
  socket,
  online,
  notice,
  onNotice,
}: {
  lobby: LobbyView;
  seatId: string;
  socket: GameSocket | null;
  online: boolean;
  notice: string | null;
  onNotice: (message: string | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const me = lobby.seats.find((seat) => seat.seatId === seatId);
  const amHost = me?.host === true;
  const inviteLink = `${window.location.origin}/room/${lobby.roomCode}`;
  const readyCount = lobby.seats.filter((seat) => seat.ready).length;
  const missing = Math.max(0, lobby.minPlayers - lobby.seats.length);

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

  const summary = lobby.canStart
    ? 'Все готовы. Запуск партии появится на следующем этапе разработки.'
    : missing > 0
      ? `Ждём игроков: нужно ещё ${missing} (классика — ${lobby.minPlayers}–${lobby.maxPlayers}).`
      : `Готовы ${readyCount} из ${lobby.seats.length}. Партия начнётся, когда готовы все.`;

  return (
    <section className="lobby" aria-labelledby="lobby-title">
      <div className="lobby-head">
        <div>
          <p className="eyebrow">Комната {lobby.roomCode}</p>
          <h1 id="lobby-title" className="page-title">
            Салун ждёт игроков
          </h1>
        </div>
        <InviteLink link={inviteLink} />
      </div>

      <p className="lobby-summary" role="status">
        {summary}
      </p>
      {notice && (
        <p className="form-error" role="alert">
          {notice}
        </p>
      )}

      <ol className="seats" aria-label={`Игроки: ${lobby.seats.length} из ${lobby.maxPlayers}`}>
        {lobby.seats.map((seat) => (
          <li key={seat.seatId} className={`seat${seat.seatId === seatId ? ' seat--me' : ''}`}>
            <span
              className={`presence presence--${seat.connected ? 'on' : 'off'}`}
              aria-hidden="true"
            />
            <span className="seat-name">
              {seat.name}
              {seat.seatId === seatId && <span className="tag">вы</span>}
              {seat.host && <span className="tag">хозяин</span>}
              <span className="visually-hidden">{seat.connected ? ', в сети' : ', не в сети'}</span>
            </span>
            <span className={`ready ready--${seat.ready ? 'yes' : 'no'}`}>
              {seat.ready ? '✔ Готов' : 'Не готов'}
            </span>
            {amHost && seat.seatId !== seatId && (
              <button
                type="button"
                className="button button--small"
                disabled={!online || pending}
                aria-label={`Убрать игрока ${seat.name}`}
                onClick={() => {
                  if (window.confirm(`Убрать игрока «${seat.name}» из комнаты?`)) {
                    void command((s) =>
                      s.timeout(8_000).emitWithAck('lobby:kick', { seatId: seat.seatId }),
                    );
                  }
                }}
              >
                Убрать
              </button>
            )}
          </li>
        ))}
        {Array.from({ length: lobby.maxPlayers - lobby.seats.length }, (_, index) => (
          <li key={`empty-${index}`} className="seat seat--empty" aria-hidden="true">
            Свободное место
          </li>
        ))}
      </ol>

      <div className="lobby-actions">
        <button
          type="button"
          className={`button ${me?.ready ? '' : 'button--primary'}`}
          aria-pressed={me?.ready ?? false}
          disabled={!online || pending || me === undefined}
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
          disabled={!online || pending}
          onClick={() => {
            if (window.confirm('Покинуть комнату? Ваше место освободится.')) {
              void command((s) => s.timeout(8_000).emitWithAck('lobby:leave'));
            }
          }}
        >
          Покинуть комнату
        </button>
      </div>
      {!online && <p className="muted">Нет связи — вернём вас на место автоматически.</p>}
    </section>
  );
}

function InviteLink({ link }: { link: string }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const canShare = typeof navigator.share === 'function';

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
      <label htmlFor="invite-link" className="hint">
        Ссылка-приглашение
      </label>
      <div className="invite-row">
        <input
          id="invite-link"
          type="text"
          readOnly
          value={link}
          onFocus={(event) => event.target.select()}
        />
        <button type="button" className="button button--small" onClick={() => void copy()}>
          Копировать
        </button>
        {canShare && (
          <button
            type="button"
            className="button button--small"
            onClick={() =>
              void navigator.share({ title: 'Bang!', url: link }).catch(() => undefined)
            }
          >
            Поделиться
          </button>
        )}
      </div>
      <span className="copy-status" role="status">
        {message}
      </span>
    </div>
  );
}
