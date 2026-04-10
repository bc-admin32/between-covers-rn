import * as Haptics from 'expo-haptics';

export async function hapticLight() {
  try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
}

export async function hapticMedium() {
  try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
}

export async function hapticHeavy() {
  try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
}

export async function hapticSuccess() {
  try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
}

export async function hapticWarning() {
  try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
}

export async function hapticError() {
  try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
}

export async function hapticSelection() {
  try { await Haptics.selectionAsync(); } catch {}
}

export async function hapticTripleHeavy() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 150);
    }, 150);
  } catch {}
}