import './mission.css'
import MissionProvider from './_components/mission/MissionProvider'
import StatusStrip from './_components/mission/StatusStrip'
import StartInvestigation from './_components/mission/StartInvestigation'
import LiveIntelligence from './_components/mission/LiveIntelligence'
import ThreatEnvironment from './_components/mission/ThreatEnvironment'
import NetworkIntelligence from './_components/mission/NetworkIntelligence'
import ActiveInvestigations from './_components/mission/ActiveInvestigations'
import AiFindings from './_components/mission/AiFindings'
import ActivityTimeline from './_components/mission/ActivityTimeline'

/**
 * Mission Control — reading order follows the analyst's questions:
 *   what is the situation → start an investigation → how bad is it →
 *   who is behind it → what is open → what did the AI find → background.
 * Every widget reads one shared dataset (MissionProvider) so they never disagree.
 */
export default function OverviewPage() {
  return (
    <MissionProvider>
      <div className="mc-wrap">
      <div className="mc">
        <StatusStrip />

        <div className="mc-row-2">
          <StartInvestigation />
          <LiveIntelligence />
        </div>

        <ThreatEnvironment />
        <NetworkIntelligence />

        <div className="mc-row-3">
          <ActiveInvestigations />
          <AiFindings />
        </div>

        <ActivityTimeline />
      </div>
      </div>
    </MissionProvider>
  )
}
