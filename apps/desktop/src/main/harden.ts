import { app, session, shell, type WebContents } from 'electron';
import { buildCsp } from './csp';
import { isAllowedExternalUrl } from './external-urls';
import { isOwnUrl, isPermissionAllowed } from './permissions';

/** Locks down the default session: CSP header and the permission allowlist. */
export function hardenSession(appOrigin: string): void {
  const ses = session.defaultSession;
  const csp = buildCsp({ packaged: app.isPackaged });

  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
    });
  });
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    callback(isPermissionAllowed(permission, contents.getURL(), appOrigin));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    isPermissionAllowed(permission, requestingOrigin, appOrigin),
  );
}

/** Applies to every web contents: no navigation, no new windows, no webviews. */
export function hardenWebContents(contents: WebContents, appOrigin: string): void {
  const block = (event: { preventDefault: () => void }, url: string): void => {
    if (!isOwnUrl(url, appOrigin)) event.preventDefault();
  };
  contents.on('will-navigate', block);
  contents.on('will-redirect', block);
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}
