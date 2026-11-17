import { CLASSIC_PLAYER_LIMITS } from '@bang/contracts';
import { HomePage } from './HomePage.js';
import { parseRoomPath, usePathname } from './navigation.js';
import { RoomPage } from './RoomPage.js';
import { useServerConnection } from './use-server-connection.js';

const statusLabels = {
  connecting: 'Подключаемся к серверу…',
  connected: 'На связи',
  disconnected: 'Нет связи с сервером. Повторяем подключение…',
};

export function App() {
  const { status, socket } = useServerConnection();
  const pathname = usePathname();
  const roomCode = parseRoomPath(pathname);
  const players = `${CLASSIC_PLAYER_LIMITS.min}–${CLASSIC_PLAYER_LIMITS.max}`;

  return (
    <main className="shell">
      <header className="masthead">
        <a className="brand" href="/" aria-label="Bang! — главная">
          Bang!
        </a>
        <span className="connection-pill" role="status" aria-live="polite">
          <span className={`status-mark status-mark--${status}`} aria-hidden="true" />
          {statusLabels[status]}
        </span>
      </header>

      {roomCode !== null ? (
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

      <footer className="footer">
        <span>Классика · {players} игроков</span>
        <span>Для своих</span>
      </footer>
    </main>
  );
}
