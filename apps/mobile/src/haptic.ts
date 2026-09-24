import * as Haptics from "expo-haptics";

function run(task: Promise<unknown>) {
  void task.catch(() => undefined);
}

export function tapSelect() {
  run(Haptics.selectionAsync());
}

export function tapPress() {
  run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function tapSuccess() {
  run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
