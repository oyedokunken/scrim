abi <abi/4.0>,
include <tunables/global>

# Ubuntu 24.04 and newer stop unprivileged programs from creating user namespaces unless an
# AppArmor profile allows it. The Chromium sandbox inside Scrim needs one, so this profile allows
# user namespaces for the installed program and nothing else (flags=(unconfined) means no other
# rule is enforced). The sandbox stays on: Scrim never turns it off.
profile "${executable}" "/opt/${sanitizedProductName}/${executable}" flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/${executable}>
}
