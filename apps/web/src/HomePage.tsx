import { type FormEvent, useState } from 'react';
import { createRoom, errorMessages } from './api.js';
import { NameField } from './NameField.js';
import { navigate, parseInvitation, roomPath } from './navigation.js';
import { loadLastName, saveLastName, saveSeat } from './seat-storage.js';

export function HomePage({ players }: { players: string }) {
  const [name, setName] = useState(loadLastName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await createRoom(name);
    setPending(false);
    if (!result.ok) {
      setError(errorMessages[result.error]);
      return;
    }
    saveLastName(name.trim());
    saveSeat(result.value.roomCode, {
      seatId: result.value.seatId,
      seatToken: result.value.seatToken,
    });
    navigate(roomPath(result.value.roomCode));
  }

  function handleOpenCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = parseInvitation(code);
    if (candidate === null) {
      setCodeError('Вставьте ссылку-приглашение или код из 6 символов.');
      return;
    }
    setCodeError(null);
    navigate(roomPath(candidate));
  }

  return (
    <>
      <section className="intro" aria-labelledby="intro-title">
        <h1 id="intro-title">
          Соберите
          <br />
          свою
          <br />
          компанию
        </h1>
        <p className="lead">Классический BANG! для {players} друзей</p>
      </section>

      <div className="home-grid">
        <section className="create-panel" aria-labelledby="create-title">
          <h2 id="create-title">Новая комната</h2>
          <form
            className="form"
            aria-labelledby="create-title"
            onSubmit={handleCreate}
            method="post"
            action="/api/rooms"
          >
            <NameField
              id="create-name"
              value={name}
              onChange={(next) => {
                setName(next);
                setError(null);
              }}
              errorId="create-error"
              invalid={error !== null}
            />
            <p id="create-error" className="form-error" role="alert">
              {error}
            </p>
            <button className="button button--primary" type="submit" disabled={pending}>
              {pending ? 'Создаём…' : 'Создать комнату'}
            </button>
          </form>
        </section>

        <section className="code-panel" aria-labelledby="code-title">
          <h2 id="code-title">Есть приглашение?</h2>
          <form className="form" aria-labelledby="code-title" onSubmit={handleOpenCode}>
            <div className="field">
              <label htmlFor="room-code">Ссылка или код комнаты</label>
              <div className="code-entry">
                <input
                  id="room-code"
                  name="room"
                  type="text"
                  required
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  value={code}
                  aria-invalid={codeError !== null || undefined}
                  aria-describedby="code-error"
                  onChange={(event) => {
                    setCode(event.target.value);
                    setCodeError(null);
                  }}
                />
                <button className="button" type="submit">
                  Войти
                </button>
              </div>
            </div>
            <p id="code-error" className="form-error" role="alert">
              {codeError}
            </p>
          </form>
        </section>
      </div>
    </>
  );
}
