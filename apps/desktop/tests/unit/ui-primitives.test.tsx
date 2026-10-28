import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { arrowDirection, nextEnabledIndex } from '../../src/renderer/ui/keyboard';
import {
  Button,
  Card,
  Keycaps,
  PanelSection,
  Segmented,
  Switch,
  Tile,
} from '../../src/renderer/ui';

describe('nextEnabledIndex', () => {
  it('moves forward and back, wrapping at the ends', () => {
    const none = [false, false, false];
    expect(nextEnabledIndex(none, 0, 1)).toBe(1);
    expect(nextEnabledIndex(none, 2, 1)).toBe(0);
    expect(nextEnabledIndex(none, 0, -1)).toBe(2);
  });

  it('skips disabled entries', () => {
    expect(nextEnabledIndex([false, true, false], 0, 1)).toBe(2);
    expect(nextEnabledIndex([false, true, false], 2, -1)).toBe(0);
  });

  it('stays put when nothing else is enabled', () => {
    expect(nextEnabledIndex([false, true, true], 0, 1)).toBe(0);
    expect(nextEnabledIndex([true], 0, 1)).toBe(0);
  });
});

describe('arrowDirection', () => {
  it.each([
    ['ArrowRight', 1],
    ['ArrowDown', 1],
    ['ArrowLeft', -1],
    ['ArrowUp', -1],
    ['Enter', null],
    ['a', null],
  ])('%s is %s', (key, expected) => {
    expect(arrowDirection(key)).toBe(expected);
  });
});

describe('Segmented', () => {
  const html = renderToStaticMarkup(
    <Segmented
      label="Hold after a click"
      value="medium"
      onChange={vi.fn()}
      options={[
        { value: 'short', label: 'Short' },
        { value: 'medium', label: 'Medium' },
        { value: 'long', label: 'Long', disabled: true },
      ]}
    />,
  );

  it('is a named radio group with one checked segment', () => {
    expect(html).toContain('role="radiogroup" aria-label="Hold after a click"');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true"[^>]*class="ui-segment selected"[^>]*>Medium</);
  });

  it('only the checked segment is in the tab order', () => {
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
  });

  it('disables a segment that cannot be chosen', () => {
    expect(html).toMatch(/disabled=""[^>]*>Long</);
  });
});

describe('Switch', () => {
  it('reports its state and name', () => {
    const html = renderToStaticMarkup(<Switch label="Auto zoom" checked onChange={vi.fn()} />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('ui-switch on');
    expect(html).toContain('>Auto zoom<');
  });

  it('says why it is off, and reads that with the switch', () => {
    const html = renderToStaticMarkup(
      <Switch
        label="Show camera"
        checked={false}
        disabled
        note="This recording has no camera."
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('This recording has no camera.');
    expect(html).toMatch(/aria-describedby="([^"]+)"/);
  });
});

describe('the other primitives', () => {
  it('Button defaults to a secondary button that does not submit', () => {
    const html = renderToStaticMarkup(<Button>Cancel</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain('ui-button-secondary');
  });

  it('Button hides its icon from assistive technology', () => {
    const html = renderToStaticMarkup(
      <Button variant="primary" icon={<i />}>
        Start recording
      </Button>,
    );
    expect(html).toContain('ui-button-primary');
    expect(html).toMatch(/<span class="ui-button-icon" aria-hidden="true">/);
  });

  it('Keycaps read as one phrase, not three buttons', () => {
    const html = renderToStaticMarkup(<Keycaps keys={['Ctrl', 'Shift', 'R']} />);
    expect(html).toContain('aria-label="Ctrl Shift R"');
    expect(html.match(/<kbd/g)).toHaveLength(3);
  });

  it('Tile is a pressed button named by its label, with a decorative picture', () => {
    const html = renderToStaticMarkup(
      <Tile label="Halo only" selected onSelect={vi.fn()}>
        <svg />
      </Tile>,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('ui-tile selected');
    expect(html).toMatch(/class="ui-tile-art" aria-hidden="true"/);
  });

  it('Card is a plain surface, or one button when it can be opened', () => {
    expect(renderToStaticMarkup(<Card>text</Card>)).toMatch(/^<div class="ui-card">/);
    const open = renderToStaticMarkup(
      <Card onOpen={vi.fn()} label="Open take 1">
        text
      </Card>,
    );
    expect(open).toMatch(/^<button[^>]*aria-label="Open take 1"/);
  });

  it('PanelSection has a heading, optional help, and its content', () => {
    const html = renderToStaticMarkup(
      <PanelSection title="Camera" help="Shown in a corner.">
        <p>inside</p>
      </PanelSection>,
    );
    expect(html).toContain('<h2 class="ui-section-title">Camera</h2>');
    expect(html).toContain('Shown in a corner.');
    expect(html).toContain('<p>inside</p>');
  });
});
