import identificationCard3d from '@iconify-icons/fluent-emoji/identification-card'
import { identityIcons } from '../../config/dashboard'
import { ThreeDIcon } from '../common/Icon'

export function IdentityCard({ stats }) {
  return (
    <section className="card identity-card relative isolate overflow-hidden rounded-[28px] border-0 p-5 shadow-[0_18px_48px_rgba(20,65,66,.075)] min-[900px]:col-span-full max-[700px]:p-[18px] max-[480px]:p-[16px] max-[360px]:p-3.5">
      <div className="card-heading relative z-[1] flex items-center justify-between gap-4 max-[480px]:items-start">
        <div className="title-with-icon flex min-w-0 items-center gap-2.5 max-[480px]:gap-[7px]">
          <span className="icon-box icon-box--3d"><ThreeDIcon icon={identificationCard3d} /></span>
          <h2>Financial Identity Profile</h2>
        </div>
      </div>
      <div className="identity-grid relative z-[1] mt-4 grid grid-cols-4 gap-2.5 max-[900px]:grid-cols-2 max-[700px]:mt-3.5 max-[480px]:grid-cols-1 max-[480px]:gap-[9px]">
        {stats.map((stat) => (
          <article className={`stat stat--${stat.tone} relative grid min-h-[94px] min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[20px] border-0 p-3.5 max-[480px]:min-h-[90px] max-[480px]:p-3`} key={stat.label}>
            <span className="stat__icon stat__icon--3d"><ThreeDIcon icon={identityIcons[stat.icon]} /></span>
            <div className="stat__content grid min-w-0 gap-[5px]">
              <span className="stat__name">{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.description}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
