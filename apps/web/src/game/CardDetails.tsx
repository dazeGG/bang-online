import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { CardFace } from '@bang/contracts';
import { cardLabel, cards } from './copy.js';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
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
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <form method="dialog" className="dialog-close">
        <button ref={safeClose} className="button" autoFocus>
          Закрыть
        </button>
      </form>
    </dialog>
  );
}

export function CardDetails({
  card,
  onClose,
  children,
}: {
  card: CardFace;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal title={cardLabel(card)} onClose={onClose}>
      <p>{cards[card.kind].text}</p>
      {children}
    </Modal>
  );
}
