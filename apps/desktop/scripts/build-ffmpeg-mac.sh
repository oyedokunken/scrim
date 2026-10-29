#!/usr/bin/env bash
# Builds the pinned FFmpeg source into apps/desktop/resources/ffmpeg on a Mac (x64 or arm64).
#
# The build is LGPL only: no --enable-gpl, no --enable-nonfree, no libx264. H.264 comes from
# Apple's VideoToolbox encoder and AAC from FFmpeg's own encoder. The tarball URL and its SHA-256
# are the ones in scripts/ffmpeg-targets.mts (MAC_SOURCE_PIN); keep them identical.
#
# Not run on the machine this was written on (Windows). Treat it as unverified until it has been
# run on a real Mac. docs/releasing.md lists the checks.
set -euo pipefail

VERSION="8.1.3"
FILE="ffmpeg-${VERSION}.tar.xz"
URL="https://ffmpeg.org/releases/${FILE}"
SHA256="7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-${HERE}/../resources/ffmpeg}"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script builds the macOS binaries and must run on a Mac." >&2
  exit 1
fi

curl -fsSL -o "${WORK}/${FILE}" "${URL}"
ACTUAL="$(shasum -a 256 "${WORK}/${FILE}" | cut -d' ' -f1)"
if [[ "${ACTUAL}" != "${SHA256}" ]]; then
  echo "The download does not match the pinned hash." >&2
  echo "  expected ${SHA256}" >&2
  echo "  got      ${ACTUAL}" >&2
  exit 1
fi

tar -xf "${WORK}/${FILE}" -C "${WORK}"
cd "${WORK}/ffmpeg-${VERSION}"

# Hardware and platform encoders only. No GPL or nonfree component can be switched on here.
./configure \
  --prefix="${WORK}/install" \
  --disable-gpl --disable-nonfree --disable-debug --disable-doc \
  --disable-ffplay --disable-autodetect \
  --enable-videotoolbox --enable-audiotoolbox \
  --enable-zlib \
  --extra-ldflags="-mmacosx-version-min=12.0" \
  --extra-cflags="-mmacosx-version-min=12.0"
make -j"$(sysctl -n hw.ncpu)"
make install

# Refuse a build that is not LGPL, whatever the flags said.
if "${WORK}/install/bin/ffmpeg" -version | grep -qE -- '--enable-(gpl|nonfree)'; then
  echo "The build turned out GPL or nonfree. Refusing to ship it." >&2
  exit 1
fi

rm -rf "${OUT}"
mkdir -p "${OUT}"
cp "${WORK}/install/bin/ffmpeg" "${WORK}/install/bin/ffprobe" "${OUT}/"
cp COPYING.LGPLv3 "${OUT}/LICENSE.txt"
cat > "${OUT}/SOURCE.txt" <<EOF
Scrim ships an unmodified FFmpeg ${VERSION} built from the official source, licensed under the LGPL.

Source:  ${URL}
SHA-256: ${SHA256}

The build has no GPL licensed code. You can replace ffmpeg and ffprobe with your own build.
EOF
printf '%s\n%s\n' "${FILE}" "${SHA256}" > "${OUT}/PINNED_BUILD.txt"
echo "FFmpeg ${VERSION} is in ${OUT}"
