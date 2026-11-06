import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChampionshipCard from '../ChampionshipCard.vue'

type Props = InstanceType<typeof ChampionshipCard>['$props']

const base = {
  name: 'Copa Crossliseu 2026',
  startDate: '2026-12-19',
  fightsDone: 6,
  fightsTotal: 15,
}

function mountCard(props: Partial<Props> & Pick<Props, 'status'>) {
  return mount(ChampionshipCard, {
    props: { ...base, ...props } as Props,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('ChampionshipCard', () => {
  it('ongoing: orange pill, fight progress and an orange bar', () => {
    const wrapper = mountCard({ status: 'ongoing' })

    expect(wrapper.get('.status-pill').classes()).toContain('status-pill--accent')
    expect(wrapper.get('.status-pill').text()).toBe('Em andamento')
    expect(wrapper.get('.championship-card__footer').text()).toContain('6 de 15 lutas')
    expect(wrapper.get('.championship-card__bar').classes()).not.toContain(
      'championship-card__bar--done',
    )
  })

  it('scheduled: blue pill, the date range, no fight count and an empty bar', () => {
    const wrapper = mountCard({ status: 'scheduled', endDate: '2026-12-20', fightsDone: 0 })

    expect(wrapper.get('.status-pill').classes()).toContain('status-pill--info')
    expect(wrapper.get('.championship-card__date').text()).toBe('19 – 20 DEZ 2026')
    expect(wrapper.text()).not.toContain('lutas')
    expect(wrapper.get('.championship-card__bar').attributes('style')).toContain('width: 0%')
  })

  it('closed: neutral pill and a green bar', () => {
    const wrapper = mountCard({ status: 'closed', fightsDone: 15 })

    expect(wrapper.get('.status-pill').classes()).toContain('status-pill--neutral')
    expect(wrapper.get('.championship-card__bar').classes()).toContain(
      'championship-card__bar--done',
    )
  })

  it.each(['ongoing', 'scheduled', 'closed'] as const)(
    '%s: shows neither the robot count nor an edition',
    (status) => {
      const text = mountCard({ status }).text()

      expect(text).not.toContain('robôs')
      expect(text).not.toContain('EDIÇÃO')
    },
  )
})
