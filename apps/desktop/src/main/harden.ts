import { session, type WebContents } from 'electron';
import { openExternalChecked } from './external-opener';
import { isOwnUrl, isPermissionAllowed } from './permissions';

/**
 * Locks down the default session. The CSP for the app protocol is attached by the protocol
 * handler itself. Only the dev server needs it added here.
 */
export function hardenSession(options: { appOrigin: string; devCsp: string | undefined }): void {
  const ses = session.defaultSession;
  const { appOrigin, devCsp } = options;

  if (devCsp !== undefined) {
    ses.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [devCsp] },
      });
    });
  }
  // The URL of the frame that asked, not the URL of the top page, so a subframe cannot borrow
  // the permissions of the page that embeds it.
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(isPermissionAllowed(permission, details.requestingUrl, appOrigin));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    isPermissionAllowed(permission, requestingOrigin, appOrigin),
  );
}

/**
 * Applies to every web contents: no navigation, no new windows, no webviews. It is wired to
 * `web-contents-created` in index.ts, so no window can be created without it.
 */
export function hardenWebContents(
  contents: WebContents,
  appOrigin: string,
  open: typeof openExternalChecked = openExternalChecked,
): void {
  const block = (event: { preventDefault: () => void }, url: string): void => {
    if (!isOwnUrl(url, appOrigin)) event.preventDefault();
  };
  contents.on('will-navigate', block);
  contents.on('will-redirect', block);
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    void open(url);
    return { action: 'deny' };
  });
}
