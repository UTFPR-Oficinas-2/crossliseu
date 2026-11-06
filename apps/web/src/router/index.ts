import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Signed-out visitors are sent to `sign-in`. UX only: the API enforces access. */
    requiresAuth?: boolean
    /** OrganizerLayout highlights this sidebar route (by name) on sub-pages such as forms */
    sidebar?: string
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
  // {
  //   path: '/dev/components',
  //   name: 'dev-components',
  //   component: () => import('../views/dev/ComponentsPreviewView.vue'),
  // },
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
        component: () => import('../views/organizer/ParticipantsView.vue'),
        props: true,
      },
      {
        path: ':championshipId/matches',
        name: 'championship-matches',
        component: () => import('../views/organizer/MatchesView.vue'),
        props: true,
      },
      {
        path: ':championshipId/participants/new',
        name: 'participant-create',
        component: () => import('../views/organizer/ParticipantFormView.vue'),
        props: (route) => ({ mode: 'create', championshipId: route.params.championshipId }),
        meta: { sidebar: 'championship-participants' },
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
        meta: { sidebar: 'championship-participants' },
      },
      {
        path: ':championshipId/matches/new',
        name: 'match-create',
        component: () => import('../views/organizer/MatchFormView.vue'),
        props: (route) => ({ mode: 'create', championshipId: route.params.championshipId }),
        meta: { sidebar: 'championship-matches' },
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
        meta: { sidebar: 'championship-matches' },
      },
      {
        path: ':championshipId/settings',
        name: 'championship-settings',
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
        // One view with three states: preparation, running, closing
        path: ':matchId',
        name: 'match-operation',
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

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.name === 'sign-in' && auth.isAuthenticated) return { name: 'home' }
  if (to.matched.some((record) => record.meta.requiresAuth) && !auth.isAuthenticated) {
    return { name: 'sign-in', query: { redirect: to.fullPath } }
  }
})

export default router
