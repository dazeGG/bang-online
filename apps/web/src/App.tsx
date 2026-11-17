import { CLASSIC_PLAYER_LIMITS, PROTOCOL_VERSION } from '@bang/contracts';
import { HomePage } from './HomePage.js';
import { parseRoomPath, usePathname } from './navigation.js';
import { RoomPage } from './RoomPage.js';
import { useServerConnection } from './use-server-connection.js';

export function App() {
  const { status, socket, serverInfo } = useServerConnection();
  const pathname = usePathname();
  const roomCode = parseRoomPath(pathname);
  const players = `${CLASSIC_PLAYER_LIMITS.min}–${CLASSIC_PLAYER_LIMITS.max}`;

  return (
    <main className={`shell${roomCode !== null ? ' shell--room' : ''}`}>
      <header className="masthead">
        <a className="brand" href="/" aria-label="Bang! — главная">
          BANG!
        </a>
      </header>

      <div role="status" aria-live="polite">
        {status === 'disconnected' && (
          <p className="connection-notice">Связь прервалась. Переподключаемся…</p>
        )}
      </div>

      {serverInfo !== null && serverInfo.protocolVersion !== PROTOCOL_VERSION ? (
        <section className="panel">
          <h1 className="page-title">Доступна новая версия</h1>
          <p>Обновите страницу, чтобы продолжить партию.</p>
          <button type="button" className="button" onClick={() => window.location.reload()}>
            Обновить страницу
          </button>
        </section>
      ) : roomCode !== null ? (
        <RoomPage key={roomCode} roomCode={roomCode} socket={socket} status={status} />
      ) : pathname === '/' ? (
        <HomePage players={players} />
      ) : (
        <section className="panel">
          <h1 className="page-title">Страница не найдена</h1>
          <p>
            Проверьте ссылку-приглашение или <a href="/">вернитесь на главную</a>.
          </p>
        </section>
      )}
    </main>
  );
}
