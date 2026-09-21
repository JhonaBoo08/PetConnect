import { router, type Href } from 'expo-router';

export function goBack(fallback: Href) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
