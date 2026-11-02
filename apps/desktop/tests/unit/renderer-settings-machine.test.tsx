import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutCard } from '../../src/renderer/src/settings/about-card';
import { ErrorProvider } from '../../src/renderer/ui';
import { MachineCard } from '../../src/renderer/src/settings/machine-card';

describe('the your machine card', () => {
  it('holds the computer facts and the logs folder button, with the privacy note', () => {
    const html = renderToStaticMarkup(
      <ErrorProvider>
        <MachineCard />
      </ErrorProvider>,
    );
    expect(html).toContain('Your machine');
    for (const label of ['Computer name', 'Operating system', 'Open logs folder']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('It is never sent anywhere or saved in the logs.');
  });

  it('leaves the computer facts out of the about card', () => {
    const html = renderToStaticMarkup(<AboutCard onOpenLink={() => undefined} />);
    expect(html).not.toContain('Computer name');
    expect(html).not.toContain('Operating system');
  });
});
