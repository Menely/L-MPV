#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${L_MPV_RUNTIME_BUILD_DIR:-${RUNNER_TEMP:-/tmp}/l-mpv-runtime-build}"
PREFIX="${L_MPV_RUNTIME_PREFIX:-${ROOT_DIR}/.runtime/linux}"
JOBS="${JOBS:-$(nproc)}"

MPV_REF="2c219aa822df18a1b7fd9abe3e151cd93ad67307" # v0.41.0
NCNN_REF="c4193aadbbb56582aa87b1850dd3d98fb8fd936d" # 20250916
VS_REF="acabf605b2205b32d65859bb2736405719d2fafd" # R79
SHADER_REF="1e4ded59a4c5080c832badedb5a4a80d9064be6e"

mkdir -p "${BUILD_DIR}" "${PREFIX}"

clone_at() {
  local url="$1" ref="$2" destination="$3"
  if [[ ! -d "${destination}/.git" ]]; then
    git clone --filter=blob:none "${url}" "${destination}"
  fi
  git -C "${destination}" fetch --depth 1 origin "${ref}"
  git -C "${destination}" checkout --detach FETCH_HEAD
}

clone_at https://github.com/Tencent/ncnn.git "${NCNN_REF}" "${BUILD_DIR}/ncnn"
git -C "${BUILD_DIR}/ncnn" submodule update --init --depth 1
cmake -S "${BUILD_DIR}/ncnn" -B "${BUILD_DIR}/ncnn-build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="${PREFIX}" \
  -DCMAKE_INSTALL_LIBDIR=lib \
  -DNCNN_VULKAN=ON -DNCNN_SHARED_LIB=ON -DNCNN_BUILD_TOOLS=OFF \
  -DNCNN_BUILD_EXAMPLES=OFF -DNCNN_BUILD_BENCHMARK=OFF -DNCNN_BUILD_TESTS=OFF
cmake --build "${BUILD_DIR}/ncnn-build" --parallel "${JOBS}"
cmake --install "${BUILD_DIR}/ncnn-build"

clone_at https://github.com/vapoursynth/vapoursynth.git "${VS_REF}" "${BUILD_DIR}/vapoursynth"
rm -rf "${BUILD_DIR}/vapoursynth-build"
meson setup "${BUILD_DIR}/vapoursynth-build" "${BUILD_DIR}/vapoursynth" \
  --prefix="${PREFIX}" --libdir=lib --buildtype=release
meson compile -C "${BUILD_DIR}/vapoursynth-build" -j "${JOBS}"
meson install -C "${BUILD_DIR}/vapoursynth-build"

VS_SITE_DIR="$(find "${PREFIX}/lib" -type d -path '*/site-packages/vapoursynth' -print -quit)"
if [[ -z "${VS_SITE_DIR}" ]]; then
  echo 'VapourSynth Python package was not installed' >&2
  exit 1
fi
mkdir -p "${PREFIX}/include/vapoursynth"
cp -a "${VS_SITE_DIR}/include/." "${PREFIX}/include/vapoursynth/"
find "${VS_SITE_DIR}" -maxdepth 1 -type f \( -name 'libvapoursynth*.so*' -o -name 'libvsscript.so*' \) \
  -exec cp -aL {} "${PREFIX}/lib/" \;
cat > "${PREFIX}/lib/pkgconfig/vapoursynth-script.pc" <<EOF
prefix=${PREFIX}
libdir=\${prefix}/lib
includedir=\${prefix}/include/vapoursynth

Name: vapoursynth-script
Description: VapourSynth script evaluation library
Version: 79
Libs: -L\${libdir} -lvsscript
Cflags: -I\${includedir}
EOF

# VSScript R79 discovers Python dynamically. Bundle the matching interpreter,
# shared library and standard library so AppImage playback does not depend on
# the host distribution's Python version.
PYTHON_BIN="$(command -v python3)"
PYTHON_VERSION="$("${PYTHON_BIN}" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
PYTHON_STDLIB="$("${PYTHON_BIN}" -c 'import sysconfig; print(sysconfig.get_path("stdlib"))')"
PYTHON_LIB="$("${PYTHON_BIN}" -c 'import os, sysconfig; print(os.path.join(sysconfig.get_config_var("LIBDIR"), sysconfig.get_config_var("LDLIBRARY")))')"
mkdir -p "${PREFIX}/python/bin" "${PREFIX}/python/lib/python${PYTHON_VERSION}"
cp -aL "${PYTHON_BIN}" "${PREFIX}/python/bin/python3"
cp -aL "${PYTHON_LIB}" "${PREFIX}/lib/"
cp -a "${PYTHON_STDLIB}/." "${PREFIX}/python/lib/python${PYTHON_VERSION}/"
rm -rf "${PREFIX}/python/lib/python${PYTHON_VERSION}/site-packages" \
       "${PREFIX}/python/lib/python${PYTHON_VERSION}/test" \
       "${PREFIX}/python/lib/python${PYTHON_VERSION}/__pycache__" \
       "${PREFIX}/python/lib/python${PYTHON_VERSION}"/config-*
# VapourSynth's package initialization only needs this small extension subset.
# Keeping every stdlib extension makes linuxdeploy chase optional Tk, DBM,
# curses and test dependencies that are unrelated to script evaluation.
PYTHON_DYNLOAD="${PREFIX}/python/lib/python${PYTHON_VERSION}/lib-dynload"
find "${PYTHON_DYNLOAD}" -maxdepth 1 -type f \
  ! -name '_ctypes.*.so' \
  ! -name '_struct.*.so' \
  ! -name '_posixsubprocess.*.so' \
  ! -name 'select.*.so' \
  ! -name 'math.*.so' \
  ! -name '_random.*.so' \
  ! -name '_sha2.*.so' \
  -delete

export PKG_CONFIG_PATH="${VS_SITE_DIR}/pkgconfig:${PREFIX}/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
export CMAKE_PREFIX_PATH="${PREFIX}:${CMAKE_PREFIX_PATH:-}"

rm -rf "${BUILD_DIR}/lmpv-ncnn-build"
cmake -S "${ROOT_DIR}/native/linux-ncnn" -B "${BUILD_DIR}/lmpv-ncnn-build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="${PREFIX}" -DCMAKE_INSTALL_LIBDIR=lib
cmake --build "${BUILD_DIR}/lmpv-ncnn-build" --parallel "${JOBS}"
cmake --install "${BUILD_DIR}/lmpv-ncnn-build"

clone_at https://github.com/mpv-player/mpv.git "${MPV_REF}" "${BUILD_DIR}/mpv"
rm -rf "${BUILD_DIR}/mpv-build"
meson setup "${BUILD_DIR}/mpv-build" "${BUILD_DIR}/mpv" \
  --prefix="${PREFIX}" --libdir=lib --buildtype=release \
  -Dcplayer=false -Dlibmpv=true -Dvapoursynth=enabled -Dplain-gl=enabled \
  -Dwayland=enabled -Dx11=enabled -Dtests=false -Dmanpage-build=disabled
meson compile -C "${BUILD_DIR}/mpv-build" -j "${JOBS}"
meson install -C "${BUILD_DIR}/mpv-build"

find "${PREFIX}/lib" -maxdepth 1 -type f -name 'libmpv.so*' \
  -exec patchelf --set-rpath '$ORIGIN' {} \;

mkdir -p "${PREFIX}/shaders"
curl --fail --location --retry 3 \
  "https://raw.githubusercontent.com/emoeem/mpv/${SHADER_REF}/shaders/igv/FSRCNNX_x2_8-0-4-1.glsl" \
  -o "${PREFIX}/shaders/FSRCNNX_x2_8-0-4-1.glsl"
curl --fail --location --retry 3 \
  "https://raw.githubusercontent.com/emoeem/mpv/${SHADER_REF}/shaders/Anime4K/Anime4K_Upscale_CNN_x2_S.glsl" \
  -o "${PREFIX}/shaders/Anime4K_Upscale_CNN_x2_S.glsl"

echo "Linux mpv + NCNN runtime created in ${PREFIX}"
