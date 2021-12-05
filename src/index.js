import './fetch-polyfill.js'
// import './temporal-polyfill.js'
import { fromFetch } from 'rxjs/fetch'
import {
  switchMap,
  interval,
  startWith,
  concatMap,
  map,
  scan,
  filter,
} from 'rxjs'
import { diff } from 'deep-object-diff'
import { config } from 'dotenv'
config()

// const leaderboardRateLimit = Temporal.Duration.from({ minutes: 16 })
const leaderboardRateLimit = 16 * 60 * 1000
const leaderboardUrl = process.env.LEADERBOARD_URL
const leaderboardSessionToken = process.env.LEADERBOARD_SESSION_TOKEN

const webhookUrl = process.env.WEBHOOK_URL

const sendToDiscord = (content) =>
  fromFetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: `_ _\n${content}` }),
  })

const extractMessage = ([prev, curr]) => {
  const byMember = Object.entries(curr.members).map(([id, m]) => [
    prev.members[id],
    m,
  ])

  const formatMember = (m) => {
    return `__${m.name}__(${m.local_score})`
  }

  const byMemberMessages = byMember
    .map(([prevM, currM]) => {
      const changes = diff(prevM ?? {}, currM)
      let memberMessage = [
        changes.id && 'joined',
        ...Object.entries(changes.completion_day_level ?? {}).flatMap(
          ([day, problem]) =>
            Object.entries(problem ?? {}).map(
              ([star, { get_star_ts }]) => `solved day ${day}, star ${star}`
              //  ${ Temporal.Now.instant()
              // .since(Temporal.Instant.fromEpochSeconds(get_star_ts))
              // .round({ smallestUnit: 'minute' })
              // .toLocaleString()
              // } ago`
            )
        ),
      ]
        .filter((v) => v)
        .map((m) => `    ${m}`)
        .join('\n')

      return memberMessage && `${formatMember(currM)}\n${memberMessage}`
    })
    .filter((v) => v)
    .join('\n')

  const getLeader = (stats) => {
    const members = Object.values(stats.members)
    return members.length
      ? members.reduce((curLeader, next) =>
          next.local_score > curLeader.local_score ? next : curLeader
        )
      : undefined
  }
  const prevLeader = getLeader(prev)
  const currLeader = getLeader(curr)
  const newLeaderMessage =
    prevLeader?.id !== currLeader.id
      ? `${formatMember(currLeader)} has replaced ${
          prevLeader != null ? formatMember(prevLeader) : 'unknown'
        } as the current leader!`
      : ''

  return [byMemberMessages, newLeaderMessage].filter((v) => v).join('\n\n')
}

interval(leaderboardRateLimit)
  .pipe(
    startWith(0),
    switchMap(() =>
      fromFetch(leaderboardUrl, {
        credentials: 'include',
        headers: {
          cookie: `session=${leaderboardSessionToken}`,
        },
      })
    ),
    concatMap((response) => {
      if (!response.ok) throw new Error('failure response')
      return response.json()
    }),
    scan(([, prev], next) => [prev, next], [undefined, { members: {} }]),
    map(extractMessage),
    filter((v) => v),
    concatMap(sendToDiscord)
  )
  .subscribe(() => console.log('fetched update'))
