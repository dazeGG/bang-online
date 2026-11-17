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
      <label htmlFor={id}>Ваше имя</label>
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
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
