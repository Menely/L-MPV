#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}"
ARCH="${ARCH:-x86_64}"
TOOLS_DIR="${RUNNER_TEMP:-/tmp}/l-mpv-appimage-tools"
OUTPUT_DIR="${ROOT_DIR}/dist-linux"

mkdir -p "${TOOLS_DIR}" "${OUTPUT_DIR}"
cd "${ROOT_DIR}"

RUNTIME_DIR="${L_MPV_RUNTIME_PREFIX:-${ROOT_DIR}/.runtime/linux}"
if [[ ! -f "${RUNTIME_DIR}/lib/libmpv.so.2" && ! -f "${RUNTIME_DIR}/lib64/libmpv.so.2" ]]; then
  L_MPV_RUNTIME_PREFIX="${RUNTIME_DIR}" bash scripts/build-linux-runtime.sh
fi

npm ci
export NO_STRIP=1
TAURI_APPDIR="${ROOT_DIR}/src-tauri/target/release/bundle/appimage/L-MPV.AppDir"
if ! npm run tauri -- build --bundles appimage; then
  # Newer appimagetool validates icon filename casing after linuxdeploy has
  # already produced a complete AppDir. Reuse that staging tree and let the
  # final packaging pass below normalize the icon and create the image.
  if [[ ! -x "${TAURI_APPDIR}/usr/bin/l-mpv" ]]; then
    echo 'Tauri failed before producing a usable AppDir' >&2
    exit 1
  fi
  echo 'Tauri AppImage wrapper failed; continuing from its completed AppDir' >&2
fi

BASE_IMAGE="$(find src-tauri/target/release/bundle/appimage -maxdepth 1 -name '*.AppImage' -print -quit)"

rm -rf "${TOOLS_DIR}/squashfs-root"
cd "${TOOLS_DIR}"
if [[ -n "${BASE_IMAGE}" ]]; then
  BASE_IMAGE="$(realpath "${BASE_IMAGE}")"
  "${BASE_IMAGE}" --appimage-extract >/dev/null
else
  cp -a "${TAURI_APPDIR}" squashfs-root
fi

# appimagetool requires the root icon filename to match Desktop Entry Icon=.
DESKTOP_FILE="$(find squashfs-root -maxdepth 1 -name '*.desktop' -print -quit)"
if [[ -n "${DESKTOP_FILE}" ]]; then
  ICON_NAME="$(sed -n 's/^Icon=//p' "${DESKTOP_FILE}" | head -1)"
  if [[ -n "${ICON_NAME}" && ! -e "squashfs-root/${ICON_NAME}.png" ]]; then
    ROOT_ICON="$(find squashfs-root -maxdepth 1 -iname '*.png' -print -quit)"
    [[ -z "${ROOT_ICON}" ]] || cp "${ROOT_ICON}" "squashfs-root/${ICON_NAME}.png"
  fi
fi

install -Dm755 "$(command -v ffmpeg)" squashfs-root/usr/bin/ffmpeg
install -Dm755 "$(command -v mediainfo)" squashfs-root/usr/bin/mediainfo

LIBMPV="$(find "${RUNTIME_DIR}" -name 'libmpv.so.2' -print -quit)"
if [[ -z "${LIBMPV}" ]]; then
  echo 'libmpv was not found by ldconfig' >&2
  exit 1
fi

LINUXDEPLOY="${TOOLS_DIR}/linuxdeploy-${ARCH}.AppImage"
if [[ ! -x "${LINUXDEPLOY}" ]]; then
  curl --fail --location --retry 3 \
    "https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-${ARCH}.AppImage" \
    --output "${LINUXDEPLOY}"
  chmod +x "${LINUXDEPLOY}"
fi

export OUTPUT="${OUTPUT_DIR}/L-MPV-v${VERSION}-linux-${ARCH}.AppImage"

# Private runtime: custom libmpv with VapourSynth, NCNN/Vulkan plugin and
# packaged shader fallback. Keep it isolated from host mpv.
mkdir -p squashfs-root/usr/lib/l-mpv
cp -a "${RUNTIME_DIR}/." squashfs-root/usr/lib/l-mpv/
find squashfs-root/usr/lib/l-mpv -type f -name 'lib*.so*' -exec patchelf --set-rpath '$ORIGIN' {} \; 2>/dev/null || true
if [[ -f squashfs-root/usr/lib/l-mpv/vapoursynth/liblmpv_ncnn.so ]]; then
  patchelf --set-rpath '$ORIGIN/../lib' squashfs-root/usr/lib/l-mpv/vapoursynth/liblmpv_ncnn.so
fi

"${LINUXDEPLOY}" --appimage-extract-and-run \
  --appdir squashfs-root \
  --executable squashfs-root/usr/bin/ffmpeg \
  --executable squashfs-root/usr/bin/mediainfo \
  --library "${LIBMPV}" \
  --output appimage

chmod +x "${OUTPUT}"
echo "Created ${OUTPUT}"
