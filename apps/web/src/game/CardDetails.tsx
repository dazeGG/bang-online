import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { CardFace } from '@bang/contracts';
import { cardFaces, cards } from './copy.js';
import { CardFaceView } from './Hand.js';

export function Modal({
  title,
  onClose,
  children,
  eyebrow,
  aside,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  eyebrow?: string | undefined;
  aside?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const safeClose = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    // Reopening after Strict Mode cleanup can skip the native autofocus step.
    safeClose.current?.focus();
    return () => {
      node.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="game-dialog"
      aria-labelledby={titleId}
      onClose={(event) => {
        // Strict Mode can deliver a cleanup close event after the modal has reopened.
        if (!event.currentTarget.open) onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop targets the dialog element itself.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="dialog-body">
        {aside && <div className="dialog-aside">{aside}</div>}
        <div className="dialog-main">
          {eyebrow && <span className="dialog-eyebrow">{eyebrow}</span>}
          <h2 id={titleId}>{title}</h2>
          {children}
          <form method="dialog" className="dialog-close">
            <button ref={safeClose} className="button" autoFocus>
              Закрыть
            </button>
          </form>
        </div>
      </div>
    </dialog>
  );
}

export function CardDetails({
  card,
  onClose,
  note,
  children,
}: {
  card: CardFace;
  onClose: () => void;
  note?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <Modal
      title={cards[card.kind].name}
      eyebrow={`Карта · ${cardFaces[card.kind].tag}`}
      aside={<CardFaceView card={card} height={210} className="dialog-card" />}
      onClose={onClose}
    >
      <p className="dialog-text">{cards[card.kind].text}</p>
      {note && <p className="dialog-note">{note}</p>}
      {children}
    </Modal>
  );
}
