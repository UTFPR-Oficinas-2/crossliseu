import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * Sign-out for the signed-in layouts: leave to home first, and sign out only once we actually
 * left (a form may block navigation with a confirmation). PublicLayout signs out first instead,
 * since it can already be on home, where the push would fail as a duplicate.
 */
export function useSignOut() {
  const router = useRouter()
  const auth = useAuthStore()
  return async function signOut() {
    const failure = await router.push({ name: 'home' })
    if (!failure) auth.signOut()
  }
}
