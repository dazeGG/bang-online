import { CLASSIC_PLAYER_LIMITS, PROTOCOL_VERSION } from '@bang/contracts';
import { HomePage } from './HomePage.js';
import { parseRoomPath, usePathname } from './navigation.js';
import { RoomPage } from './RoomPage.js';
import { SaloonLayout } from './SaloonLayout.js';
import { useServerConnection } from './use-server-connection.js';

export function App() {
  const { status, socket, serverInfo } = useServerConnection();
  const pathname = usePathname();
  const roomCode = parseRoomPath(pathname);
  const players = `${CLASSIC_PLAYER_LIMITS.min}–${CLASSIC_PLAYER_LIMITS.max}`;

  return (
    <main className="app">
      <div className="connection-region" role="status" aria-live="polite">
        {status === 'disconnected' && (
          <p className="connection-notice">Связь прервалась. Переподключаемся…</p>
        )}
      </div>

      {serverInfo !== null && serverInfo.protocolVersion !== PROTOCOL_VERSION ? (
        <SaloonLayout variant="plain" title="Доступна новая версия">
          <p>Обновите страницу, чтобы продолжить партию.</p>
          <button type="button" className="button" onClick={() => window.location.reload()}>
            Обновить страницу
          </button>
        </SaloonLayout>
      ) : roomCode !== null ? (
        <RoomPage key={roomCode} roomCode={roomCode} socket={socket} status={status} />
      ) : pathname === '/' ? (
        <HomePage players={players} />
      ) : (
        <SaloonLayout variant="plain" title="Страница не найдена">
          <p>
            Проверьте ссылку-приглашение или <a href="/">вернитесь на главную</a>.
          </p>
        </SaloonLayout>
      )}
    </main>
  );
}
