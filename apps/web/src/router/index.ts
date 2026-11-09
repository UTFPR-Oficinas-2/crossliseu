import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { matchChampionshipId, ownsChampionship } from '@/data'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Signed-out visitors are sent to `sign-in`. UX only: the API enforces access. */
    requiresAuth?: boolean
    /** OrganizerLayout highlights this sidebar route (by name) on sub-pages such as forms */
    sidebar?: string
    /** The route's id param names a championship (`championshipId`) or a match (`matchId`) the
     * signed-in account must own; otherwise the visit goes to `not-found`. UX only. */
    ownership?: 'championship' | 'match'
  }
}

/** Only same-app paths are valid redirect targets (no `//host`, `/\host` or absolute URLs) */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return '/'
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/'
}

// Every route is registered in every build (dev, `dev` branch and production), so what you see
// locally is what ships. Screens whose backend does not exist yet show an error state.
const appRoutes: RouteRecordRaw[] = [
  // Component preview page
  {
    path: '/dev/components',
    name: 'dev-components',
    component: () => import('../views/dev/ComponentsPreviewView.vue'),
  },
  {
    path: '/manage',
    component: () => import('../layouts/OrganizerLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'my-championships',
        component: () => import('../views/organizer/MyChampionshipsView.vue'),
      },
      {
        path: 'new',
        name: 'championship-create',
        component: () => import('../views/organizer/ChampionshipFormView.vue'),
        props: { mode: 'create' },
      },
      {
        // Declared before `:championshipId`, which would otherwise read "arenas" as an id
        path: 'arenas',
        name: 'arenas',
        component: () => import('../views/organizer/ArenasView.vue'),
      },
      {
        // There is no overview page: managing a championship opens its participants
        path: ':championshipId',
        redirect: (to) => ({
          name: 'championship-participants',
          params: { championshipId: to.params.championshipId },
        }),
      },
      {
        path: ':championshipId/participants',
        name: 'championship-participants',
        meta: { ownership: 'championship' },
        component: () => import('../views/organizer/ParticipantsView.vue'),
        props: true,
      },
      {
        path: ':championshipId/matches',
        name: 'championship-matches',
        meta: { ownership: 'championship' },
        component: () => import('../views/organizer/MatchesView.vue'),
        props: true,
      },
      {
        path: ':championshipId/participants/new',
        name: 'participant-create',
        component: () => import('../views/organizer/ParticipantFormView.vue'),
        props: (route) => ({ mode: 'create', championshipId: route.params.championshipId }),
        meta: { sidebar: 'championship-participants', ownership: 'championship' },
      },
      {
        path: ':championshipId/participants/:robotId/edit',
        name: 'participant-edit',
        component: () => import('../views/organizer/ParticipantFormView.vue'),
        props: (route) => ({
          mode: 'edit',
          championshipId: route.params.championshipId,
          robotId: route.params.robotId,
        }),
        meta: { sidebar: 'championship-participants', ownership: 'championship' },
      },
      {
        path: ':championshipId/matches/new',
        name: 'match-create',
        component: () => import('../views/organizer/MatchFormView.vue'),
        props: (route) => ({ mode: 'create', championshipId: route.params.championshipId }),
        meta: { sidebar: 'championship-matches', ownership: 'championship' },
      },
      {
        path: ':championshipId/matches/:matchId/edit',
        name: 'match-edit',
        component: () => import('../views/organizer/MatchFormView.vue'),
        props: (route) => ({
          mode: 'edit',
          championshipId: route.params.championshipId,
          matchId: route.params.matchId,
        }),
        meta: { sidebar: 'championship-matches', ownership: 'championship' },
      },
      {
        path: ':championshipId/settings',
        name: 'championship-settings',
        meta: { ownership: 'championship' },
        component: () => import('../views/organizer/ChampionshipFormView.vue'),
        props: (route) => ({ mode: 'edit', championshipId: route.params.championshipId }),
      },
    ],
  },
  {
    path: '/operator',
    component: () => import('../layouts/OperatorLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        // Pick an arena and a scheduled fight (#37). Lists only the account's own data, so it
        // needs no ownership check.
        path: '',
        name: 'operator',
        component: () => import('../views/operator/OperatorHomeView.vue'),
      },
      {
        // One view with three states: preparation, running, closing
        path: ':matchId',
        name: 'match-operation',
        meta: { ownership: 'match' },
        component: () => import('../views/operator/MatchOperationView.vue'),
        props: true,
      },
    ],
  },
  {
    path: '/referee',
    component: () => import('../layouts/RefereeLayout.vue'),
    children: [
      {
        // Static path wins over `:accessToken`
        path: 'invalid-access',
        name: 'referee-invalid-access',
        component: () => import('../views/referee/InvalidAccessView.vue'),
      },
      {
        // One view with three states: join, scoring, finished
        path: ':accessToken',
        name: 'referee-session',
        component: () => import('../views/referee/RefereeSessionView.vue'),
        props: true,
      },
    ],
  },
]

const publicRoutes: RouteRecordRaw[] = [
  {
    path: 'championships/:championshipId',
    name: 'championship',
    component: () => import('../views/public/ChampionshipView.vue'),
    props: true,
  },
  {
    path: 'matches/:matchId',
    name: 'match-details',
    component: () => import('../views/public/MatchDetailsView.vue'),
    props: true,
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    ...appRoutes,
    {
      path: '/',
      component: () => import('../layouts/PublicLayout.vue'),
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('../views/public/HomeView.vue'),
        },
        ...publicRoutes,
        {
          path: 'sign-in',
          name: 'sign-in',
          component: () => import('../views/public/SignInView.vue'),
        },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('../views/public/NotFoundView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.name === 'sign-in' && auth.isAuthenticated) return { name: 'home' }
  if (to.matched.some((record) => record.meta.requiresAuth) && !auth.isAuthenticated) {
    return { name: 'sign-in', query: { redirect: to.fullPath } }
  }

  const ownership = to.meta.ownership
  if (ownership && auth.token) {
    try {
      const championshipId =
        ownership === 'match'
          ? await matchChampionshipId(String(to.params.matchId))
          : String(to.params.championshipId)
      const owned = championshipId !== null && (await ownsChampionship(championshipId, auth.token))
      if (!owned) return { name: 'not-found', params: { pathMatch: to.path.slice(1).split('/') } }
    } catch (error) {
      // The API refuses writes to other accounts' championships anyway: don't lock out on a hiccup
      console.error('Ownership check failed', error)
    }
  }
})

export default router
