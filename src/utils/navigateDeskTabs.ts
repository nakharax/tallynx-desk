import type { KeyboardEvent } from 'react';

export function navigateDeskTabs(event: KeyboardEvent<HTMLElement>) {
  const { key, currentTarget, target } = event;
  if (!(target instanceof HTMLButtonElement) || target.getAttribute('role') !== 'tab') return;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;

  const tabs = Array.from(currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]:enabled'));
  const index = tabs.indexOf(target);
  if (index < 0) return;

  const offset = key === 'ArrowRight' ? 1 : -1;
  const nextIndex = key === 'Home' ? 0 : key === 'End' ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}
