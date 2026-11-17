import { type FormEvent, useState } from 'react';
import { ROOM_CODE_PATTERN } from '@bang/contracts';
import { createRoom, errorMessages } from './api.js';
import { NameField } from './NameField.js';
import { navigate, roomPath } from './navigation.js';
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
    // Accept either a bare code or a pasted invitation link.
    const candidate = code.trim().split('/').filter(Boolean).at(-1)?.toUpperCase() ?? '';
    if (!ROOM_CODE_PATTERN.test(candidate)) {
      setCodeError('Код комнаты — 10 букв и цифр из ссылки-приглашения.');
      return;
    }
    setCodeError(null);
    navigate(roomPath(candidate));
  }

  return (
    <>
      <section className="intro" aria-labelledby="intro-title">
        <p className="eyebrow">Один стол. Вся компания.</p>
        <h1 id="intro-title">Дикий Запад, где&nbsp;бы вы&nbsp;ни&nbsp;были.</h1>
        <p className="lead">
          Классический BANG! для {players} друзей — с компьютера, телефона или планшета.
        </p>
      </section>

      <div className="home-grid">
        <section className="panel" aria-labelledby="create-title">
          <h2 id="create-title">Новая комната</h2>
          <p className="muted">
            Создайте приватную комнату и отправьте друзьям ссылку. Вы станете хозяином комнаты.
          </p>
          <form className="form" aria-labelledby="create-title" onSubmit={handleCreate}>
            <NameField
              id="create-name"
              value={name}
              onChange={setName}
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

        <section className="panel" aria-labelledby="code-title">
          <h2 id="code-title">Есть приглашение?</h2>
          <p className="muted">Откройте ссылку от друга или вставьте её сюда.</p>
          <form className="form" aria-labelledby="code-title" onSubmit={handleOpenCode}>
            <div className="field">
              <label htmlFor="room-code">Ссылка или код комнаты</label>
              <input
                id="room-code"
                name="room"
                type="text"
                required
                autoComplete="off"
                autoCapitalize="characters"
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
            </div>
            <p id="code-error" className="form-error" role="alert">
              {codeError}
            </p>
            <button className="button" type="submit">
              Открыть комнату
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
