import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// Pages that are still placeholders backed by demo data (or dev tools) are registered only in
// development. Production builds ship the home page and the 404 page: `import.meta.env.DEV` is
// replaced at build time, so the lazy chunks below are not emitted. Keep the inline ternaries
// (a helper function would keep the imports). Move a route out once it uses the API.
const devRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [
      // Component preview page
      {
        path: '/dev/components',
        name: 'dev-components',
        component: () => import('../views/dev/ComponentsPreviewView.vue'),
      },
      {
        path: '/manage',
        component: () => import('../layouts/OrganizerLayout.vue'),
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
            path: ':championshipId',
            name: 'championship-overview',
            component: () => import('../views/organizer/OverviewView.vue'),
            props: true,
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
  : []

const devPublicRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [
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
      {
        path: 'sign-in',
        name: 'sign-in',
        component: () => import('../views/public/SignInView.vue'),
      },
    ]
  : []

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    ...devRoutes,
    {
      path: '/',
      component: () => import('../layouts/PublicLayout.vue'),
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('../views/public/HomeView.vue'),
        },
        ...devPublicRoutes,
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('../views/public/NotFoundView.vue'),
        },
      ],
    },
  ],
})

export default router
