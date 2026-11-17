import type { DialogHTMLAttributes, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  refCalls: 0,
  focused: '',
  safeClose: { focus: vi.fn() },
  dialog: {
    open: false,
    showModal: vi.fn(),
    close: vi.fn(),
  },
}));

// No browser DOM is supplied by the test runner. Exercise the native event order
// against a minimal dialog double rather than asserting only rendered markup.
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useId: () => 'modal-title',
    useRef: () => ({
      current: lifecycle.refCalls++ === 0 ? lifecycle.dialog : lifecycle.safeClose,
    }),
    useEffect: (effect: () => void | (() => void)) => {
      lifecycle.effects.push(effect);
    },
  };
});

import { Modal } from '../src/game/CardDetails.js';

describe('native modal lifecycle', () => {
  beforeEach(() => {
    lifecycle.effects = [];
    lifecycle.refCalls = 0;
    lifecycle.focused = '';
    lifecycle.dialog.open = false;
    lifecycle.dialog.showModal.mockImplementation(() => {
      lifecycle.dialog.open = true;
      lifecycle.focused = 'first-action';
    });
    lifecycle.dialog.close.mockImplementation(() => {
      lifecycle.dialog.open = false;
    });
    lifecycle.safeClose.focus.mockImplementation(() => {
      lifecycle.focused = 'safe-close';
    });
  });

  function mount() {
    const onClose = vi.fn();
    const element = Modal({ title: 'Card details', children: 'Details', onClose }) as ReactElement<
      DialogHTMLAttributes<HTMLDialogElement>
    >;
    const effect = lifecycle.effects[0]!;
    const deliverCloseEvent = () => {
      const handler = element.props.onClose;
      if (!handler) throw new Error('Missing native close handler');
      handler({ currentTarget: lifecycle.dialog } as unknown as Parameters<
        NonNullable<typeof handler>
      >[0]);
    };
    return { onClose, effect, deliverCloseEvent };
  }

  it('ignores a queued cleanup close after Strict Mode has reopened the modal', () => {
    const { effect, deliverCloseEvent, onClose } = mount();
    const cleanup = effect();
    expect(lifecycle.dialog.open).toBe(true);
    expect(lifecycle.focused).toBe('safe-close');
    if (typeof cleanup !== 'function') throw new Error('Missing effect cleanup');
    cleanup();
    expect(lifecycle.dialog.open).toBe(false);
    effect();
    expect(lifecycle.dialog.open).toBe(true);
    expect(lifecycle.focused).toBe('safe-close');
    deliverCloseEvent();
    expect(onClose).not.toHaveBeenCalled();
    expect(lifecycle.dialog.open).toBe(true);
  });

  it('places focus on the safe close button rather than the first destructive action on each show', () => {
    const { effect } = mount();
    const calls = lifecycle.safeClose.focus.mock.calls.length;
    effect();
    expect(lifecycle.focused).toBe('safe-close');
    expect(lifecycle.safeClose.focus).toHaveBeenCalledTimes(calls + 1);
  });

  it.each(['Escape', 'close form'])('notifies the parent after a real %s dismissal', () => {
    const { effect, deliverCloseEvent, onClose } = mount();
    effect();
    lifecycle.dialog.close();
    deliverCloseEvent();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(lifecycle.dialog.open).toBe(false);
  });
});
