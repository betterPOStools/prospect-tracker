import btnStyles from '../../components/Button.module.css'
import styles from './SourcesTab.module.css'

const SOURCES = [
  {
    title: 'Google Maps',
    desc: 'Name, address, phone, website. Best free source — copy the full address in one click.',
    url: 'https://maps.google.com',
  },
  {
    title: 'Outscraper (free tier)',
    desc: '150 free searches/month. Exports Google Maps data to a spreadsheet automatically.',
    url: 'https://outscraper.com',
  },
  {
    title: 'Apollo.io (free tier)',
    desc: '50 free email credits/month. Find owner emails by business name or domain.',
    url: 'https://app.apollo.io',
  },
  {
    title: 'Hunter.io (free tier)',
    desc: '25 free lookups/month. Enter a restaurant domain to find contact emails.',
    url: 'https://hunter.io',
  },
  {
    title: 'Yelp Business Search',
    desc: 'Filter by neighborhood and cuisine. Good backup when Google Maps is thin.',
    url: 'https://www.yelp.com/search?find_desc=Restaurants',
  },
  {
    title: 'RouteXL',
    desc: 'Free route optimizer, up to 20 stops. No account — just paste addresses.',
    url: 'https://www.routexl.com',
  },
]

export default function SourcesTab() {
  return (
    <div>
      <p className={styles.intro}>Free tools for finding restaurant leads. No credit card needed.</p>
      <div className={styles.grid}>
        {SOURCES.map(s => (
          <div key={s.title} className={styles.card}>
            <div className={styles.title}>{s.title}</div>
            <div className={styles.desc}>{s.desc}</div>
            <a href={s.url} target="_blank" rel="noreferrer" className={`${btnStyles.btn} ${btnStyles.sm}`}>Open ↗</a>
          </div>
        ))}
      </div>
      <div className="tip">
        <strong>Email tip:</strong> Check the restaurant website footer or /contact page.
        Facebook business pages often list owner email — about 30 seconds per lead.
      </div>
    </div>
  )
}
