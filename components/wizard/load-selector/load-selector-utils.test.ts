// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { SingleLoad } from '@/lib/types';
import { loadMatchesPhase, newLoad, setDragPreview } from './load-selector-utils';

function makeLoad(partial: Partial<SingleLoad> = {}): SingleLoad {
  return {
    id: 'l1',
    name: 'Carga',
    powerW: 100,
    qty: 1,
    ipInRatio: 1,
    ...partial,
  };
}

describe('loadMatchesPhase', () => {
  it('always matches a trifásica load, regardless of the phase asked about', () => {
    const load = makeLoad({ phaseType: 'trifasica', phase: 'L1' });
    expect(loadMatchesPhase(load, 'L1')).toBe(true);
    expect(loadMatchesPhase(load, 'L2')).toBe(true);
    expect(loadMatchesPhase(load, 'L3')).toBe(true);
  });

  it('defaults an unset phaseType to mono', () => {
    const load = makeLoad({ phase: 'L2' });
    expect(loadMatchesPhase(load, 'L2')).toBe(true);
    expect(loadMatchesPhase(load, 'L1')).toBe(false);
  });

  it('defaults an unset phase to L1 for a mono load', () => {
    const load = makeLoad({ phaseType: 'mono' });
    expect(loadMatchesPhase(load, 'L1')).toBe(true);
    expect(loadMatchesPhase(load, 'L2')).toBe(false);
  });

  it('matches via phase2 for a two-phase mono load', () => {
    const load = makeLoad({ phaseType: 'mono', phase: 'L1', phase2: 'L2' });
    expect(loadMatchesPhase(load, 'L1')).toBe(true);
    expect(loadMatchesPhase(load, 'L2')).toBe(true);
    expect(loadMatchesPhase(load, 'L3')).toBe(false);
  });
});

describe('newLoad', () => {
  it('fills in the standard defaults and generates an id', () => {
    const load = newLoad({ name: 'Ventilador', powerW: 80, qty: 1 });
    expect(load).toMatchObject({
      name: 'Ventilador',
      powerW: 80,
      qty: 1,
      ipInRatio: 1,
      usageFactor: 1,
      voltageV: 220,
      phaseType: 'mono',
      phase: 'L1',
    });
    expect(load.id).toBeTruthy();
  });

  it('lets the caller override any default, including ipInRatio', () => {
    const load = newLoad({ name: 'Bomba', powerW: 750, qty: 2, ipInRatio: 3, phase: 'L2' });
    expect(load.ipInRatio).toBe(3);
    expect(load.phase).toBe('L2');
  });

  it('generates a distinct id on every call', () => {
    const a = newLoad({ name: 'A', powerW: 1, qty: 1 });
    const b = newLoad({ name: 'B', powerW: 1, qty: 1 });
    expect(a.id).not.toBe(b.id);
  });
});

describe('setDragPreview', () => {
  it('creates a preview pill, sets it as the drag image, and removes it after the animation frame', () => {
    const setDragImage = vi.fn();
    const event = {
      dataTransfer: { setDragImage },
    } as unknown as import('react').DragEvent;

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    const bodyChildrenBefore = document.body.children.length;
    setDragPreview(event, 'Chuveiro elétrico');

    expect(setDragImage).toHaveBeenCalledWith(expect.any(HTMLDivElement), 12, 12);
    // The preview node is appended then removed synchronously (rAF mocked to run immediately).
    expect(document.body.children.length).toBe(bodyChildrenBefore);

    rafSpy.mockRestore();
  });
});
