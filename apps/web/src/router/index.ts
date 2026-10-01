import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/dev/componentes',
      name: 'dev-componentes',
      component: () => import('../views/dev/ComponentsPreviewView.vue'),
    },
  ],
})

export default router
