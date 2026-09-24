import NetworkGraphPanel from '../_components/NetworkGraphPanel'

const BORDER = '1px solid #1E2D4A'

// Full-width, full-height graph — fills the main content area completely.
// Campaign selector tabs are built into NetworkGraphPanel.
export default function NetworkPage() {
  return (
    <div
      style={{
        borderTop:     BORDER,
        height:        'calc(100vh - 44px)', // viewport minus topbar
        display:       'flex',
        flexDirection: 'column',
        overflow:      'hidden',
      }}
    >
      <NetworkGraphPanel />
    </div>
  )
}
