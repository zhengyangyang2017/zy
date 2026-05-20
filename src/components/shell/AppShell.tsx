import type { ReactNode } from 'react'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'

interface Props {
  sidebar: ReactNode
  main: ReactNode
  rightPanel?: ReactNode
  bottomPanel?: ReactNode
  sidebarWidth: number
  rightPanelWidth: number
  bottomPanelHeight: number
  rightPanelOpen: boolean
  bottomPanelOpen: boolean
}

export function AppShell({
  sidebar,
  main,
  rightPanel,
  bottomPanel,
  sidebarWidth,
  rightPanelWidth,
  rightPanelOpen,
  bottomPanelOpen,
  bottomPanelHeight
}: Props) {
  return (
    <div className="flex flex-col h-screen bg-base">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-shrink-0 border-r border-hover overflow-hidden transition-all duration-300"
          style={{ width: `${sidebarWidth}px` }}
        >
          {sidebar}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              {main}
            </div>
            {rightPanelOpen && rightPanel && (
              <div
                className="flex-shrink-0 border-l border-hover overflow-hidden transition-all duration-300"
                style={{ width: `${rightPanelWidth}px` }}
              >
                {rightPanel}
              </div>
            )}
          </div>

          {bottomPanelOpen && bottomPanel && (
            <div
              className="flex-shrink-0 border-t border-hover overflow-hidden transition-all duration-300"
              style={{ height: `${bottomPanelHeight}px` }}
            >
              {bottomPanel}
            </div>
          )}
        </div>
      </div>

      <StatusBar />
    </div>
  )
}
