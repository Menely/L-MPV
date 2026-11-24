# Player motion

Motion owns presence of active player surfaces in modern, docked and capsule:
settings modal/sidebar, control popovers, playlist/navigation, context menu,
chapters, MediaInfo overlay, subtitle search, update dialog/toast and color picker.
Simple hover/press, feedback indicators, spinners and native window operations
retain their own appropriate mechanisms.

## Responsibilities

- `src/components/motion/PlayerMotionProvider.tsx` supplies `LazyMotion` with
  `domAnimation`. It lives in PlayerRoot; the independent native MediaInfo entry
  does not load this provider. Use `m` from `motion/react-m`, not the full `motion`
  component, inside the strict provider.
- `motionPresets.ts` owns timing/easing for migrated surfaces. Durations are in
  seconds. Do not mirror these values in CSS or close timers.
- `useMotionAllowed.ts` subscribes to the existing app switch, root class, storage
  events and OS reduced-motion preference. A single shared subscription serves
  all mounted surfaces and is released when the last subscriber unmounts.
- `MotionSurface.tsx` owns entry, exit, interruption and exit interactivity. It
  retains native DOM refs and does not introduce a layout wrapper. Popovers fade and rise
  without modifying their positioning transform. Dialogs also move by a few pixels.
- `SettingsPresence.tsx` keeps the presence boundary above conditional/lazy
  mounting, so F2, Escape, backdrop and close button share the same exit.
- `useControlPopover.ts` owns requested visibility and focus restoration.
  `displayedPopover` also retains the speed trigger while it exits. It does not
  measure animation time.
- `useSurfaceDismiss.ts` requests close without waiting for a duration. It gates
  repeated requests and Escape by presence and preserves download dismissal locks.
- `MotionSurface` waits for `ready` when a menu must first calculate its position.
  Pinned drawers retain their positional transforms while fading/rising. Their
  navigation popovers appear immediately after positioning and inherit parent
  presence. The settings sidebar uses a short horizontal displacement instead of
  travelling its full width.

CSS continues to own hover, press, colour, materials and geometry. dnd-kit owns
sorting. Native Tauri/Win32 code owns window/video geometry. Canvas and subtitle
scrolling obey the shared policy through separate focused hooks; Motion does not
automatically govern them. The exported but currently unused DetailedMediaInfoModal
retains its legacy hook; it is not an active player surface.

## Lifecycle rules

Put an `AnimatePresence` boundary outside the condition that hides a surface.
Use a stable key for a logical surface. Audio/subtitle contents intentionally
share one key and DOM node; changing tracks does not replay a list entrance.
Keep nested portal boundaries propagating presence (`AnimatePresence propagate`)
so a color picker exits and becomes inert when its parent settings closes.

`MotionSurface` uses explicit animation controls plus manual presence completion.
This is intentional: merely changing an `exit` transition prop does not finish a
running Motion exit when the preference changes. Stopping and restarting controls
from their current values handles close/reopen and reduced/off transitions.

Keep the latest `safeToRemove` callback in a ref. Its identity can change on an
unrelated parent render; it must not restart the animation. Only the successful,
uncancelled outgoing animation may signal removal. No fallback close timeout is
needed for these managed transitions.

Exiting surfaces are inert, hidden from accessibility APIs and cannot intercept
pointer input. Modal keyboard traps must also stop when presence becomes false.

Focus restoration must not steal focus from a newly opened overlay or an input
the user selected during exit. Immediate close controls transition duration,
not whether ordinary actions deserve a focus return. A newly active popover
cancels pending restoration.

## Current presets

| Surface | Enter | Exit | Movement |
|---|---:|---:|---|
| Popover | 200 ms | 120 ms | Opacity; 6 px entry / 4 px exit |
| Dialog | 240 ms | 150 ms | Opacity; 12 px entry / 6 px exit |
| Backdrop | 180 ms | 150 ms | Opacity only |
| Navigation panel | 260 ms | 180 ms | Opacity; 8 px entry / 4 px exit; independent translate preserves anchor/drag transform |
| Settings sidebar | 240 ms | 160 ms | Opacity; 24 px entry / 16 px exit |
| Settings dialog | 240 ms | 160 ms | Constant opacity 1; independent translate 12 px entry / 8 px exit |
| Settings backdrop | 180 ms | 150 ms | Background color alpha only; element opacity stays 1 |

Reduced/off uses zero-duration transitions, including for an animation already
running. Never apply automatic `layout` or spring scaling to text-heavy surfaces
without checking text rasterization and layout costs in WebView2.

Settings modal/sidebar, MediaInfo overlay/native categories, playlist/explorer
and subtitle modes share `SelectionRail.tsx`. Only the selected surface
moves (220 ms tween); captions and tab contents remain stationary. Measurements
use layout offsets, so UI zoom and two-row navigation retain their geometry.
Resize snaps the marker to the new layout; repeated selections reverse from the
current painted transform. Off/reduced cancels movement immediately. A scoped
background override in the `selection-rail` cascade layer prevents legacy capsule
important rules from painting a second selection. Direct captions keep weight 500
in both states. Unequal chip widths/radii tween on the absolute decoration only;
the content layout does not animate. Child/text changes refresh its measurement.
The standalone window uses the rail without requiring a Motion provider.
Transport glyphs grow to 1.06 without overshoot; press compresses to 0.97. Buttons
and labels stay stationary. SVGs use an explicit border-box transform origin;
hover never adds a vertical translation.

Settings are deliberately excluded from the generic dialog group fade. Their
backdrop fades its background color instead of group opacity. The dialog rises
12 px on entry and moves down 8 px on exit using the same persistent individual
CSS translate as anchored surfaces; opacity stays 1 in every phase. Nested group fades previously changed glass
composition and text rasterization at the end of entry. See the
[Filter Effects backdrop root description](https://drafts.csswg.org/filter-effects-2/#BackdropRoot)
for the opacity/glass interaction; the exact GPU behavior still needs native
visual verification. Do not add group opacity to settings again without
checking the opening frames in WebView2.

Modern/docked reserve the hidden refresh action's slot. Capsule reserves the
maximum action width in the header grid; the action island itself is intrinsic
and right aligned. Hidden refresh takes no space inside that island: it grows
when needed while selection width remains invariant. The remaining space is a
transparent gap between islands (at least 12px). Pinned/unpinned and compact
button sizes each define the corresponding maximum action width.

## Programmatic motion

`subtitles/lib/followScroll.ts` calculates damping from elapsed milliseconds,
not frames. The hook clamps destinations, respects manual-navigation pauses and
UI zoom, reveals distant seek targets directly, and settles at scroll boundaries.
It checks the accepted DOM position after writing scrollTop; quantized subpixel
writes cannot leave an endless loop. A zero-elapsed first frame defers to the next
timestamp. Off/reduced jumps directly to the target. Standalone MediaInfo search
also chooses smooth/auto through the reactive policy.

`useCanvasVisibility.ts` tracks the actual canvas node, document visibility and
viewport intersection. Hidden/offscreen canvases stop rendering. Main audio
visualization additionally receives semantic visibility through
`ControlsVisibilityContext`, fed from App's `isControlsVisible`: opacity-hidden
controls can remain geometrically intersecting. Hidden controls suspend both
rendering and spectrum capture; preview is independent of player visibility.
Off/reduced draws a static frame without a continuous animation loop. Config and
resize changes still redraw that static preview. Audio playback is unaffected.

CSS transitions enumerate their properties; no `transition: all` remains. Retired
presence keyframes and timers were removed from migrated paths. Existing layout
transitions for accordions and settings-tab height stay explicit and policy-aware.

OSD remains a simple CSS feedback animation. Its removal delay matches the
155 ms CSS exit, samples the motion policy when fading starts, and keeps opacity
at zero if animations are disabled during the fade.

Seek and volume use `useFeedbackLifetime.ts`: hold time (650/900 ms) remains
readable in every policy; only the fade is optional. CSS owns
`--t-feedback-exit` (180 ms), which the hook reads when fading starts. Replacement
feedback cancels the old hold/fade; switching off/reduced during exit removes
retained feedback immediately. Keep hold, hover-intent and animation durations
separate.

Navigation portals inherit presence even outside the drawer DOM. During parent
exit they become inert and release outside/key/position observers. Saved-list
Escape and Explorer history listeners also follow presence. Pending context-menu
hover timers are cancelled on external dismissal. Closed preset/model/backend
folds are inert and hidden from accessibility APIs, with linked expanded headings.

## Interaction families

| Family | Purpose and rule |
|---|---|
| Transport/titlebar icons | Small hover/press feedback; state symbols change directly. No mandatory icon morph. Text labels stay unscaled. |
| Close/remove/clear | Stable geometry and colour feedback; no decorative rotation. |
| Pin/repeat/shuffle/copy | Persistent selected/success state communicates the result; movement is optional. |
| Rows in tracks/chapters/playlist/explorer/saved lists | Colour/selection feedback; no staggered entrances or animated virtual-row geometry. |
| Context submenus | Short fade with hover-intent transit protection; delays are not animation timings. |
| Navigation popovers | Instant, positioned before visibility; preserve keyboard/outside handling and parent exit policy. |
| Timeline/volume/resize/drag | Direct input response; do not tween the pointer's destination. Thumb reveal and a finite click pulse are separate decoration. |
| Settings accordions/folds | Explicit grid layout expansion; chevron describes open state. Hidden content is inert. |
| Settings tabs | Preserve explicit, interruptible height transition and scroll position on policy changes. |
| Progress/spinners | Describe actual work, retain textual status when motion is disabled. Data updates continue. |
| Colour/ambient/font/control previews | Mirror the actual option; keep their text stable and preserve direct slider input. |
| Empty player | Static invitation to open a file; no continuous attention-seeking pulse. |
| Native window/video geometry | Native ownership; CSS presence does not animate video/window placement. |

The same icon may appear in several roles. Its parent interaction governs motion;
adding a distinct effect per SVG would undermine consistency. Off/reduced clears
permanent compositing hints on controls, labelled icons, titlebar buttons, thumb
and palette swatches; this alone is not a measured memory/performance improvement.

## Verification when extending migration

Rapid tab reversals must complete the specific current height CSSTransition via
its `finished` promise. A queued `transitioncancel` from an earlier tab must never
clear a newer tween. Cleanup invalidates obsolete promises; the fallback remains
bounded. Rechecked with 15 reversals spaced 30/60/90 ms: seven visible height
snaps before the fix, zero in the same sampled scenario afterwards.

Responsiveness also depends on state delivery: toolbar volume commits on every
input change (including keyboard), with bounded 50 ms IPC coalescing rather than
a trailing debounce; absolute seek updates the relative-seek UI baseline. A
nonempty stream initializes metadata once even without duration, then refreshes
static metadata once if container headers later supply a positive duration.

Run `npm run build` and `git diff --check`. Exercise real browser/native components
under StrictMode: close/reopen during exit, ordinary/immediate actions, switching
popovers, playback-driven parent rerenders, focus handoff, keyboard/backdrop/close,
and both app and OS preference changes during an animation. Check all appearances.
Run `npm run test:motion` for time independence, bounds, reduced/off, convergence
and distant-seek behavior. The tests use the project's existing TypeScript compiler
and Node test runner without an additional testing dependency.

Use native video playback for GPU/frame pacing measurements. A passing browser
lifecycle check or native settings smoke check does not establish playback FPS.
