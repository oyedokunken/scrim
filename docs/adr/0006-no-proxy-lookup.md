# 0006. No proxy lookup at startup, and the update check

Status: proposed

## Context

The desktop app promises no network use while recording, editing or exporting. Its one allowed use
is an optional update check against GitHub Releases (Phase 5). A net log of a plain recording run
showed exactly one name lookup: Chromium resolving a host called `wpad` on port 80 at startup, to
auto discover a proxy configuration. It is a lookup nobody asked for, and the end to end test for
the no network rule fails on it.

Setting `session.setProxy({ mode: 'direct' })` was tried first, on the default session as soon as it
is created and again after the app is ready. It halved the number of proxy discovery events but did
not remove the `wpad` lookup, because the network service decides on a proxy before a script in the
main process can change it.

## Decision

Start the app with the Chromium switch `--no-proxy-server`, set with
`app.commandLine.appendSwitch` before the app is ready. With it the net log of a recording, a pause,
a stop and a recovery contains no request outside `app://scrim/` and no name lookup. The test that
checks this first proves it can see a request, using a throwaway app and a local server.

The main entry, `src/main/index.ts`, sets the switch, before the app is ready.

## Consequences

- The update check, when it is added, cannot use the default session. A person behind a corporate
  proxy would find updates failing. The check should run in its own session
  (`session.fromPartition`) and call `setProxy({ mode: 'system' })` on that session only, so the
  system proxy is used for that one request and for nothing else. The update session is also the
  only one allowed to reach a remote host, which makes the rule easy to test: every other session
  stays on `--no-proxy-server`.
- The switch applies to the whole process, so a future feature that needs the network from the
  default session (a remote image, a web view) has to be designed around it. That fits the rule that
  there is none.
- If a later Electron makes the lookup go away on its own, the switch can be dropped. The test will
  say so by passing without it.
