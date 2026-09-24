import type { Campaign, GraphNode, GraphEdge } from '@/types'

function makeRand(seed: number) {
  let s = (seed * 0x9e3779b9) | 1
  return (min: number, max: number): number => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
    s ^= s >>> 16
    const r = (s >>> 0) / 0x100000000
    return Math.floor(r * (max - min + 1)) + min
  }
}

function generateNetwork(
  prefix: string,
  clusterCount: number,
  botsPerCluster: number,
  amplifierCount: number,
  legitimateCount = 0,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const seed = prefix.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0)
  const rand = makeRand(seed)

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Origin node (C2 command-and-control)
  const originId = `${prefix}-origin`
  nodes.push({
    id: originId,
    type: 'origin',
    label: 'C2 Origin',
    accountId: 'COVERT-C2',
    posts: 0,
    followers: 0,
  })

  // Bot clusters — hub-and-spoke within each cluster
  const allBotIds: string[] = []

  for (let c = 0; c < clusterCount; c++) {
    const clusterBotIds: string[] = []

    for (let b = 0; b < botsPerCluster; b++) {
      const botId = `${prefix}-bot-${c}-${b}`
      allBotIds.push(botId)
      clusterBotIds.push(botId)
      nodes.push({
        id: botId,
        type: 'bot',
        label: `BOT-C${c + 1}-${String(b + 1).padStart(2, '0')}`,
        accountId: `@usr_${rand(100000, 999999)}`,
        posts: rand(200, 5000),
        followers: rand(50, 2000),
        clusterId: c,
      })
    }

    // origin → cluster hub (first bot)
    edges.push({ source: originId, target: clusterBotIds[0], weight: 0.9 })

    // hub → remaining bots in cluster
    for (let b = 1; b < clusterBotIds.length; b++) {
      edges.push({ source: clusterBotIds[0], target: clusterBotIds[b], weight: 0.6 })
    }
  }

  // Amplifiers — each connected to a random bot
  const allAmpIds: string[] = []
  for (let a = 0; a < amplifierCount; a++) {
    const ampId = `${prefix}-amp-${a}`
    allAmpIds.push(ampId)
    nodes.push({
      id: ampId,
      type: 'amplifier',
      label: `AMP-${String(a + 1).padStart(3, '0')}`,
      accountId: `@acc_${rand(100000, 999999)}`,
      posts: rand(50, 500),
      followers: rand(200, 20000),
    })
    edges.push({ source: allBotIds[rand(0, allBotIds.length - 1)], target: ampId, weight: 0.4 })
  }

  // Legitimate users — each connected to a random amplifier
  for (let l = 0; l < legitimateCount; l++) {
    const legId = `${prefix}-leg-${l}`
    nodes.push({
      id: legId,
      type: 'legitimate',
      label: `USER-${rand(1000, 9999)}`,
      accountId: `@real_${rand(100000, 999999)}`,
      posts: rand(200, 2000),
      followers: rand(500, 50000),
    })
    edges.push({ source: allAmpIds[rand(0, allAmpIds.length - 1)], target: legId, weight: 0.2 })
  }

  return { nodes, edges }
}

// Operation Pulse:  1 origin + 4×8 bots + 20 amps + 3 legitimate = 56 nodes
// MedFear:          1 origin + 3×6 bots + 15 amps + 2 legitimate = 36 nodes
// ReviewStorm:      1 origin + 2×5 bots + 10 amps + 1 legitimate = 22 nodes
const pulse       = generateNetwork('pulse',   4, 8, 20, 3)
const medfear     = generateNetwork('medfear', 3, 6, 15, 2)
const reviewstorm = generateNetwork('review',  2, 5, 10, 1)

export const campaigns: Campaign[] = [
  {
    id: 'campaign-001',
    name: 'Operation Pulse',
    threat_level: 'HIGH',
    account_count: 847,
    start_time: '2026-05-14T02:17:00Z',
    narrative:
      'Coordinated election misinformation campaign targeting voter turnout in Maharashtra and Gujarat. False claims about EVM tampering and polling date changes amplified through bot networks seeded from three state-level coordination hubs.',
    confidence: 0.94,
    nodes: pulse.nodes,
    edges: pulse.edges,
  },
  {
    id: 'campaign-002',
    name: 'MedFear',
    threat_level: 'HIGH',
    account_count: 312,
    start_time: '2026-06-01T08:45:00Z',
    narrative:
      'Anti-vaccine misinformation operation spreading fabricated WHO adverse-effect reports and deepfake audio attributed to medical professionals. Content targets routine childhood vaccination programmes across tier-2 cities.',
    confidence: 0.91,
    nodes: medfear.nodes,
    edges: medfear.edges,
  },
  {
    id: 'campaign-003',
    name: 'ReviewStorm',
    threat_level: 'MED',
    account_count: 156,
    start_time: '2026-06-10T16:22:00Z',
    narrative:
      'Coordinated fake product review network artificially inflating ratings for substandard consumer electronics while flooding competitor listings with negative sentiment. Operates across Flipkart, Amazon IN, and Meesho.',
    confidence: 0.82,
    nodes: reviewstorm.nodes,
    edges: reviewstorm.edges,
  },
]
