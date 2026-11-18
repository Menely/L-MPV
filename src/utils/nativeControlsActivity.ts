let menuOpen = false;
let pointerHeld = false;

export function setNativeControlsMenu(open: boolean) {
  menuOpen = open;
}

export function setNativeControlsPointer(held: boolean) {
  pointerHeld = held;
}

export function isNativeControlsInteracting() {
  return menuOpen || pointerHeld;
}
