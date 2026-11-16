# Updating packaged dependencies

`scripts/animejanai-dependencies.json` pins the compatible AnimeJaNai set:
3.10.0, aji v0.25.0, TensorRT 11.4.0.106, and the AnimeJaNai libmpv build
2026-11-09-484611bce0. Do not update only one of these components.

The two manually dispatched workflows call `scripts/package-dependencies.ps1`:

- **upload-inference-v1.yml** downloads aji, TensorRT runtime and all eight
  architecture packs (sm120, sm100, sm90, sm89, sm86, sm80, sm75, ptx).
  Runtime/builders are repacked with the contents of `animejanai/inference`
  at the archive root, preserving the player's existing installer contract.
  The workflow also builds the unchanged FP16 converter.
- **upload-dependencies.yml** downloads the pinned AnimeJaNai libmpv and
  resolves current FFmpeg git essentials and MediaInfo Windows x64 DLL on
  every run. FFmpeg uses Gyan's official latest-git GitHub mirror and its
  official SHA256. MediaInfo is resolved from the official Windows download
  page, with no fallback to an older hardcoded version.

Missing assets, size/hash mismatches, archive errors, or an unexpected package
layout stop the job before publication. `dependency-sources.json` records the
exact URLs and AnimeJaNai versions in each release. GitHub assets are checked
against their published SHA256 when provided. The native package additionally
checks the AnimeJaNai filter marker and runs FFmpeg; the marker check alone is
not an AI inference compatibility test.

Before publishing `deps-v1`, `verify-native-dependencies.py` also validates AMD64
PE headers, initializes libmpv and compares its reported git revision with the
pin, calls the MediaInfo API and compares its version with the download page,
and matches FFmpeg's actual version with the resolved release tag. Failure
stops publication. `dependency-versions.json` records these actual versions.
These checks do not replace playback and GPU inference testing.

## Rollout

1. Push the changed workflows, packaging script, version pins and player changes.
2. Run both dependency workflows to update `inference-v1` and `deps-v1`.
3. After both succeed, run the normal player release workflow; it consumes
   `deps-v1/mpv_libs.zip`. Running a dependency workflow alone does not replace
   a DLL in an already installed player.
4. Update the player and reinstall its selected inference engine to obtain the
   matching aji/runtime/builders. Old TensorRT 11.3 engine caches must be rebuilt
   for 11.4; the player now generates and detects the 11.4.0 cache suffix.

The existing mutable release tags remain unchanged. Coordinate the two jobs and
the player release; publishing their assets does not atomically migrate existing
installations. A future migration to versioned dependency release tags would be
a separate change.

## Local verification

Run `./scripts/package-dependencies.ps1 -Kind Native -ResolveOnly` or
`-Kind Inference -ResolveOnly` from an isolated working directory to check
current URLs without downloading large archives. Omit `-ResolveOnly` to download,
validate and package files locally; this script does not publish releases.
Full inference validation downloads several gigabytes. 7-Zip and PowerShell 7
are required. Existing outputs are intended for a clean CI working directory.

Run `cargo test --manifest-path src-tauri/Cargo.toml --locked` for the player,
including the check that its TensorRT cache token matches the packaged runtime.
