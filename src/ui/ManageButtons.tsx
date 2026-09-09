/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

import type { DragEndEvent } from '@dnd-kit/dom';
import { OptimisticSortingPlugin } from '@dnd-kit/dom/sortable';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { setIcon } from 'obsidian';
import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { reportError } from '../logging';
import type { Button } from '../model';
import { buttonSummary, renderButtonPreview } from './labels';
import type { ManageActions } from './manageModal';

// Preact's compat alias supplies the React runtime; this is the JSX type boundary.
const Provider = DragDropProvider as unknown as (props: {
  readonly children: unknown;
  readonly onDragEnd: (event: DragEndEvent) => void;
}) => VNode;

function Icon({ name }: { readonly name: string }): VNode {
  return (
    <span
      class="sl-manage-icon"
      aria-hidden="true"
      ref={(el) => {
        if (el !== null) setIcon(el, name);
      }}
    />
  );
}

export function ManageButtons({ actions }: { readonly actions: ManageActions }): VNode {
  const [buttons, setButtons] = useState(() => actions.list());
  const preview = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (preview.current === null) return;
    preview.current.replaceChildren();
    renderButtonPreview(preview.current, actions.side, buttons);
  }, [actions.side, buttons]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const refresh = (): void => {
    if (alive.current) setButtons([...actions.list()]);
  };
  const perform = (work: () => Promise<void>): void => {
    // Lock immediately: a second event can arrive before Preact commits disabled controls.
    if (busy.current || !alive.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    void Promise.resolve()
      .then(work)
      .catch((cause: unknown) => {
        reportError(cause, t('Could not update buttons.'));
        if (alive.current) setError(t('Could not update buttons. Try again.'));
      })
      .finally(() => {
        busy.current = false;
        if (alive.current) {
          refresh();
          setPending(false);
        }
      });
  };
  const move = (id: string, targetId: string): void =>
    perform(() => {
      // The editor can stay open while another page modifies the list.
      const current = actions.list();
      const from = current.findIndex((button) => button.id === id);
      const to = current.findIndex((button) => button.id === targetId);
      return from < 0 || to < 0 || from === to ? Promise.resolve() : actions.move(from, to);
    });
  const step = (id: string, delta: number): void => {
    const current = actions.list();
    const index = current.findIndex((button) => button.id === id);
    const target = index < 0 ? undefined : current[index + delta];
    if (target !== undefined) move(id, target.id);
  };
  const dropped = (event: DragEndEvent): void => {
    if (event.canceled) return;
    const from = event.operation.source?.id;
    const to = event.operation.target?.id;
    if (typeof from === 'string' && typeof to === 'string' && from !== to) move(from, to);
  };

  return (
    <div class="sl-manage-editor" aria-busy={pending}>
      <p class="sl-manage-description">
        {t(
          actions.side === 'left'
            ? 'Arrange buttons for the left sidebar. Changes are saved as you edit.'
            : 'Arrange buttons for the right sidebar. Changes are saved as you edit.',
        )}
      </p>
      <div ref={preview} />
      {buttons.length === 0 ? (
        <div class="sl-manage-empty">
          {t(
            actions.side === 'left'
              ? 'No buttons yet. Save the current left sidebar layout, or add a command shortcut.'
              : 'No buttons yet. Save the current right sidebar layout, or add a command shortcut.',
          )}
        </div>
      ) : (
        <Provider onDragEnd={dropped}>
          <ul
            class="sl-manage-list"
            aria-label={t(
              actions.side === 'left' ? 'Left sidebar buttons' : 'Right sidebar buttons',
            )}
          >
            {buttons.map((button, index) => (
              <ButtonRow
                key={button.id}
                button={button}
                index={index}
                last={index === buttons.length - 1}
                pending={pending}
                rename={(name) => perform(() => actions.rename(button.id, name))}
                move={(delta) => step(button.id, delta)}
                remove={() => perform(() => actions.remove(button.id))}
              />
            ))}
          </ul>
        </Provider>
      )}
      {error.length > 0 ? (
        <p class="sl-manage-error" role="alert">
          {error}
        </p>
      ) : null}
      <div class="sl-manage-footer">
        <button
          type="button"
          class="mod-cta"
          disabled={pending}
          onClick={() => actions.addLayout(refresh)}
        >
          {t('Save current layout')}
        </button>
        <button type="button" disabled={pending} onClick={() => actions.addCommand(refresh)}>
          {t('Add command')}
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  readonly button: Button;
  readonly index: number;
  readonly last: boolean;
  readonly pending: boolean;
  readonly rename: (name: string) => void;
  readonly move: (delta: number) => void;
  readonly remove: () => void;
}

function ButtonRow({ button, index, last, pending, rename, move, remove }: RowProps): VNode {
  const [element, setElement] = useState<Element | null>(null);
  const handle = useRef<HTMLButtonElement | null>(null);
  const [name, setName] = useState(button.name);
  const savedName = useRef(button.name);
  useEffect(() => {
    if (savedName.current !== button.name) {
      savedName.current = button.name;
      setName(button.name);
    }
  }, [button.name]);
  const { isDragging, isDropTarget } = useSortable({
    id: button.id,
    index,
    element,
    handle,
    disabled: pending,
    // Preact owns row order. DOM-only optimistic sorting disagrees with asynchronous saves.
    plugins: (defaults) => defaults.filter((plugin) => plugin !== OptimisticSortingPlugin),
  });
  const saveName = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed.length === 0) setName(button.name);
    else if (trimmed !== button.name) rename(trimmed);
    else setName(trimmed);
  };
  return (
    <li
      class={`sl-manage-row${isDragging ? ' sl-manage-dragging' : ''}${isDropTarget ? ' sl-manage-target' : ''}`}
      ref={setElement}
      data-button-id={button.id}
    >
      <button
        type="button"
        class="clickable-icon sl-manage-handle"
        ref={handle}
        aria-label={t('Move {name}', { name: button.name })}
        disabled={pending}
      >
        <Icon name="grip-vertical" />
      </button>
      <Icon name={button.icon} />
      <div class="sl-manage-details">
        <input
          class="sl-manage-name"
          type="text"
          value={name}
          readOnly={pending}
          aria-label={t('Name of {name}', { name: button.name })}
          onInput={(event) => setName(event.currentTarget.value)}
          onBlur={(event) => saveName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              saveName(event.currentTarget.value);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setName(button.name);
            }
          }}
        />
        <span class="sl-manage-meta">{buttonSummary(button)}</span>
      </div>
      <button
        type="button"
        class="clickable-icon sl-manage-action"
        aria-label={t('Move {name} up', { name: button.name })}
        disabled={pending || index === 0}
        onClick={() => move(-1)}
      >
        <Icon name="arrow-up" />
      </button>
      <button
        type="button"
        class="clickable-icon sl-manage-action"
        aria-label={t('Move {name} down', { name: button.name })}
        disabled={pending || last}
        onClick={() => move(1)}
      >
        <Icon name="arrow-down" />
      </button>
      <button
        type="button"
        class="clickable-icon sl-manage-action"
        aria-label={t('Delete {name}', { name: button.name })}
        disabled={pending}
        onClick={remove}
      >
        <Icon name="trash" />
      </button>
    </li>
  );
}
