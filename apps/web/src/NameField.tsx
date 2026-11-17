import { DISPLAY_NAME_MAX_LENGTH } from '@bang/contracts';

interface NameFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  errorId?: string | undefined;
  invalid: boolean;
}

export function NameField({ id, value, onChange, errorId, invalid }: NameFieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>Ваше имя за столом</label>
      <input
        id={id}
        name="name"
        type="text"
        required
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        autoComplete="nickname"
        enterKeyHint="go"
        spellCheck={false}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={[`${id}-hint`, invalid ? errorId : undefined].filter(Boolean).join(' ')}
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={`${id}-hint`} className="hint">
        До {DISPLAY_NAME_MAX_LENGTH} символов. Имя видят все игроки комнаты.
      </span>
    </div>
  );
}
