import { CLASSIC_PLAYER_LIMITS } from '@bang/contracts';
import { useServerConnection } from './use-server-connection.js';

const statusLabels = {
  connecting: 'Подключаемся к серверу…',
  connected: 'Соединение с сервером установлено',
  disconnected: 'Сервер недоступен. Повторяем подключение…',
};

export function App() {
  const { status, serverInfo } = useServerConnection();
  const players = serverInfo
    ? `${serverInfo.minPlayers}–${serverInfo.maxPlayers}`
    : `${CLASSIC_PLAYER_LIMITS.min}–${CLASSIC_PLAYER_LIMITS.max}`;

  return (
    <main className="shell">
      <header className="masthead">
        <a className="brand" href="/" aria-label="Bang! — главная">
          Bang!
        </a>
        <span className="version">Стартовый проект</span>
      </header>

      <section className="intro" aria-labelledby="intro-title">
        <p className="eyebrow">Один стол. Вся компания.</p>
        <h1 id="intro-title">Дикий Запад, где&nbsp;бы вы&nbsp;ни&nbsp;были.</h1>
        <p className="lead">
          Классический BANG! для {players} друзей — с компьютера, телефона или планшета.
        </p>
        <p className="development-note">
          Основа проекта готова. Приватные комнаты и игровой стол — следующий этап разработки.
        </p>
      </section>

      <section className="connection" aria-labelledby="connection-title">
        <div className="connection-heading">
          <h2 id="connection-title">Связь с сервером</h2>
          <span className={`status-mark status-mark--${status}`} aria-hidden="true" />
        </div>
        <p role="status" aria-live="polite">
          {statusLabels[status]}
        </p>
        <p className="connection-hint">
          Здесь проверяется подключение. Возможность играть появится после реализации комнат и
          правил.
        </p>
      </section>

      <footer className="footer">
        <span>Классика · {players} игроков</span>
        <span>Для своих</span>
      </footer>
    </main>
  );
}
