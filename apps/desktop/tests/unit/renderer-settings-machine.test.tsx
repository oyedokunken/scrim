import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutCard } from '../../src/renderer/src/settings/about-card';
import { ErrorProvider } from '../../src/renderer/ui';
import { MachineCard } from '../../src/renderer/src/settings/machine-card';

describe('the your machine card', () => {
  it('holds the computer facts and the logs folder button, and no privacy note', () => {
    const html = renderToStaticMarkup(
      <ErrorProvider>
        <MachineCard />
      </ErrorProvider>,
    );
    expect(html).toContain('Your machine');
    for (const label of ['Computer name', 'Operating system', 'Open logs folder']) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain('It is never sent anywhere');
    expect(html).not.toContain('Logs stay on this computer');
  });

  it('leaves the computer facts out of the about card', () => {
    const html = renderToStaticMarkup(<AboutCard />);
    expect(html).not.toContain('Computer name');
    expect(html).not.toContain('Operating system');
  });
});
