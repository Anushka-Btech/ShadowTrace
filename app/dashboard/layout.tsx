import Sidebar, { BottomTabBar } from './_components/Sidebar'
import Topbar from './_components/Topbar'
import CommandPalette from './_components/CommandPalette'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#080E1A',
        color: '#E2E8F0',
      }}
    >
      <Sidebar />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <Topbar />
        <main
          className="st-main-wrap"
          style={{
            flex: 1,
            overflowY: 'auto',
            backgroundColor: '#080E1A',
          }}
        >
          {children}
        </main>
      </div>
      <BottomTabBar />
      <CommandPalette />
    </div>
  )
}
