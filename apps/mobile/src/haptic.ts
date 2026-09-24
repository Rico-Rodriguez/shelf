import * as Haptics from "expo-haptics";

function run(task: Promise<unknown>) {
  void task.catch(() => undefined);
}

/** Subtle selection tick for scrubbers, tabs, chips, and segment changes. */
export function tapSelect() {
  run(Haptics.selectionAsync());
}

/** Alias for select tick */
export function tapTick() {
  run(Haptics.selectionAsync());
}

/** Light tactile feedback on standard card/button presses. */
export function tapPress() {
  run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Medium impact when crossing a swipe action threshold or opening a modal. */
export function tapMedium() {
  run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Heavy impact for destructive actions or important confirmations. */
export function tapHeavy() {
  run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/** Success notification haptic for approvals, reviews, and saves. */
export function tapSuccess() {
  run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Rich dual-pulse celebration haptic sequence for clearing a queue or reaching a goal. */
export function tapCelebration() {
  run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  setTimeout(() => {
    run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  }, 160);
}
