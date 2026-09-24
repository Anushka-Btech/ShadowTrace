"""Seeds the account-intel quick-load demo handles with synthetic timelines.

The quick-load buttons on /dashboard/account-intel reference handles like
@TruthVoter2024 that must exist in Neo4j — all three account-intel agents
resolve posts via MATCH (a:Account {handle:$handle})-[:SHARED]->(p:Post).

Timestamps are generated relative to seed time so the temporal heatmap always
shows the trailing week. Post keys are stable, so re-seeding refreshes the
timeline in place instead of accumulating duplicates.

The three sets are shaped to tell different stories in the demo:
  - Election set   → tightly coordinated, LLM-styled posts  → HIGH verdict
  - Health set     → organic, unsynchronised personal posts → LOW verdict
  - Review-bomb set→ semi-coordinated review spam           → MED verdict
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from db.neo4j_client import run_query

# ─── Election set — coordinated bot campaign (target: HIGH) ───────────────────
# Five accounts posting the same narrative within seconds of each other, in two
# stylistic subgroups (formal run-on vs. staccato + emoji) so the linguistic
# fingerprinter resolves two authorship clusters. Templated phrasing keeps
# per-account post length uniform and perplexity low, which is what the AI
# operation detector treats as LLM-generation evidence.

_ELECTION_FORMAL = ["@TruthVoter2024", "@ElectionWatchIN", "@VoteFactsNow"]
_ELECTION_LOUD = ["@PatriotPulse_", "@DemAlertDaily"]

_ELECTION_TAGS = {
    "@TruthVoter2024": "#Vote2026",
    "@ElectionWatchIN": "#IndiaVotes",
    "@VoteFactsNow": "#CountEveryVote",
    "@PatriotPulse_": "#WakeUpIndia",
    "@DemAlertDaily": "#SaveOurVote",
}

_ELECTION_CLAIMS = [
    "leaked memo shows vote counts were changed after polls closed",
    "thousands of names were quietly deleted from the voter rolls",
    "counting machines in three districts sent vote totals to unknown servers",
    "poll workers were told to stop the vote count without explanation",
    "stacks of duplicate ballots were found inside a counting centre",
    "observers were locked out while officials moved sealed ballot boxes",
    "the official vote tally never matched the numbers posted that night",
    "a whistleblower says the counting software update erased the audit logs",
]

# Seconds after burst start at which each of the five accounts posts; rotated
# per burst so no single account always leads.
_ELECTION_OFFSETS = [0, 6, 13, 21, 28]


def _election_posts(now: datetime) -> list[tuple[str, str, datetime]]:
    handles = _ELECTION_FORMAL + _ELECTION_LOUD
    posts: list[tuple[str, str, datetime]] = []
    for burst, claim in enumerate(_ELECTION_CLAIMS):
        burst_start = now - timedelta(days=6.4 - burst * 0.82)
        rotation = burst % len(_ELECTION_OFFSETS)
        offsets = _ELECTION_OFFSETS[rotation:] + _ELECTION_OFFSETS[:rotation]
        for handle, offset in zip(handles, offsets):
            tag = _ELECTION_TAGS[handle]
            if handle in _ELECTION_FORMAL:
                text = (
                    f"BREAKING, {claim}, officials are hiding the truth about our votes, "
                    f"share this before they delete it {tag} #ElectionTruth."
                )
            else:
                text = (
                    f"🚨 BREAKING! {claim.capitalize()}! They are hiding the truth! "
                    f"Share before they delete it! {tag} #ElectionTruth 🚨"
                )
            posts.append((handle, text, burst_start + timedelta(seconds=offset)))
    return posts


# ─── Health set — organic accounts (target: LOW) ──────────────────────────────
# Personal anecdotes with varied length, vocabulary and timing: no coordination
# window hits, high burstiness, high topic drift.

_HEALTH_POSTS = {
    "@NaturalCureMom": [
        "Tried the turmeric and ginger mix my grandmother swears by and honestly my knees feel better than they have in years",
        "Made fresh amla juice today. The kids hated it 😂",
        "Long walk, sunshine, home cooked food. That is my medicine.",
        "Reading about gut health and it is wild how much of immunity starts in the stomach. Any book recommendations?",
        "Skipped the pharmacy this month and nobody in this house has been sick. Just saying.",
    ],
    "@WellnessTruther": [
        "Your doctor gets seven minutes with you. Your habits get all day. Choose accordingly.",
        "Fasted until noon again and my focus is unreal, day nine",
        "Why does nobody talk about how much sugar is in kids cereal here? Read the label once, you will never unsee it.",
        "Cold shower streak: 21 days 🥶",
        "Grounding, morning sun, no screens after ten. Old advice, still undefeated.",
    ],
    "@VaxFactsExposed": [
        "Asking questions is not misinformation. Refusing to answer them is.",
        "My cousin felt awful for a week after her shot and her doctor just shrugged. People deserve better answers than shrugs.",
        "FOI request number three went out today. Will post whatever comes back, good or bad.",
        "Read the insert. Read the schedule. Read everything. Then decide.",
        "Big thread coming this weekend on trial data, working through 40 pages of appendices tonight ☕",
    ],
    "@HolisticHealer7": [
        "Client came in with tension headaches, left after we fixed her sleep and her jaw. The body keeps score.",
        "Ashwagandha, magnesium glycinate, and an actual bedtime. Boring stack, real results.",
        "Full moon breathwork circle on Saturday, two spots left 🌕",
        "Reminder that stress is not a badge of honour",
        "Spent the morning barefoot in the garden and I refuse to apologise for how good it felt",
    ],
}


def _health_posts(now: datetime) -> list[tuple[str, str, datetime]]:
    posts: list[tuple[str, str, datetime]] = []
    for account_index, (handle, texts) in enumerate(_HEALTH_POSTS.items()):
        for post_index, text in enumerate(texts):
            ts = now - timedelta(
                days=6.1 - post_index * 1.3,
                hours=account_index * 3.4,
                minutes=account_index * 37 + post_index * 11,
            )
            posts.append((handle, text, ts))
    return posts


# ─── Review-bomb set — semi-coordinated spam (target: MED) ────────────────────
# Six accounts hitting the same product in waves. Two waves land inside the
# 60-second coordination window, the rest are minutes apart — enough temporal
# signal to flag, not enough to look like the election operation.

_REVIEW_HANDLES = [
    "@DealHunter_Raj",
    "@BestBuysToday",
    "@HonestReviews99",
    "@ShopSmartNow_",
    "@TopPicksDaily",
    "@GadgetGuru_IN",
]

_REVIEW_OPENERS = {
    "@DealHunter_Raj": "Honest review:",
    "@BestBuysToday": "PSA for my followers:",
    "@HonestReviews99": "Tested it so you don't have to:",
    "@ShopSmartNow_": "Save your money:",
    "@TopPicksDaily": "Removing this from my list:",
    "@GadgetGuru_IN": "Verdict after one week:",
}

_REVIEW_COMPLAINTS = [
    "the VoltEdge X2 power bank died after two days of normal use, complete waste of money",
    "the VoltEdge X2 stopped charging my phone mid call, cheap build and terrible quality control",
    "the VoltEdge X2 gets alarmingly hot on the fast charge setting, would not leave it plugged in overnight",
    "the VoltEdge X2 capacity is nowhere near the advertised 20000mAh, barely charged my phone twice",
    "the VoltEdge X2 casing cracked at the seam within a week, feels like a toy",
    "the VoltEdge X2 support team has ignored three emails about my refund, avoid this brand",
]

# Wave timing: days ago, then per-account delay. Waves 1 and 4 land within the
# coordination window; the others are spread over minutes.
_REVIEW_WAVES = [
    (5.8, [0, 180, 420, 720, 1080, 1500]),
    (4.9, [0, 9, 17, 26, 34, 43]),
    (3.7, [0, 240, 540, 900, 1260, 1680]),
    (2.9, [0, 150, 380, 660, 1000, 1400]),
    (1.8, [0, 11, 19, 28, 37, 45]),
    (0.9, [0, 200, 470, 780, 1150, 1550]),
]


def _review_posts(now: datetime) -> list[tuple[str, str, datetime]]:
    posts: list[tuple[str, str, datetime]] = []
    for wave, (days_ago, delays) in enumerate(_REVIEW_WAVES):
        wave_start = now - timedelta(days=days_ago)
        complaint = _REVIEW_COMPLAINTS[wave]
        rotation = wave % len(_REVIEW_HANDLES)
        handles = _REVIEW_HANDLES[rotation:] + _REVIEW_HANDLES[:rotation]
        for handle, delay in zip(handles, delays):
            text = f"{_REVIEW_OPENERS[handle]} {complaint}"
            posts.append((handle, text, wave_start + timedelta(seconds=delay)))
    return posts


# ─── Seeding ──────────────────────────────────────────────────────────────────


def _iso(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def seed_demo_accounts(now: datetime | None = None) -> None:
    now = now or datetime.now(timezone.utc)
    all_posts = _election_posts(now) + _health_posts(now) + _review_posts(now)

    handles = sorted({handle for handle, _, _ in all_posts})
    run_query(
        """
        UNWIND $accounts AS row
        MERGE (a:Account {key: row.key})
        SET a.id = row.key,
            a.handle = row.handle,
            a.demo = true
        """,
        {"accounts": [{"key": f"demo:{h}", "handle": h} for h in handles]},
    )

    per_account_index: dict[str, int] = {}
    rows = []
    for handle, text, ts in all_posts:
        index = per_account_index.get(handle, 0)
        per_account_index[handle] = index + 1
        rows.append(
            {
                "key": f"demo:{handle}:{index}",
                "account_key": f"demo:{handle}",
                "text": text,
                "timestamp": _iso(ts),
            }
        )
    run_query(
        """
        UNWIND $posts AS row
        MATCH (a:Account {key: row.account_key})
        MERGE (p:Post {key: row.key})
        SET p.id = row.key,
            p.text = row.text,
            p.timestamp = row.timestamp
        MERGE (a)-[:SHARED]->(p)
        """,
        {"posts": rows},
    )
