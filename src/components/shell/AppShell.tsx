import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'
import { TrialBanner } from '../../renderer/components/auth/TrialBanner'
import { LoginModal } from '../../renderer/components/auth/LoginModal'

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
  onResizeSidebar: (w: number) => void
  onResizeRightPanel: (w: number) => void
  onResizeBottomPanel: (h: number) => void
}

const MIN_SIDEBAR = 160
const MAX_SIDEBAR = 480
const MIN_RIGHT = 200
const MAX_RIGHT = 600
const MIN_BOTTOM = 100
const MAX_BOTTOM = 500

function useDragResize(
  onResize: (delta: number) => void,
  minSize: number,
  maxSize: number,
  currentSize: number,
  direction: 'horizontal' | 'vertical'
) {
  const dragging = useRef(false)
  const startPos = useRef(0)
  const startSize = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY
    startSize.current = currentSize
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }, [direction, currentSize])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      const pos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = direction === 'horizontal' ? pos - startPos.current : startPos.current - pos
      const newSize = Math.min(maxSize, Math.max(minSize, startSize.current + delta))
      onResize(newSize)
    }

    function onMouseUp() {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onResize, minSize, maxSize, direction])

  return { onMouseDown }
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
  bottomPanelHeight,
  onResizeSidebar,
  onResizeRightPanel,
  onResizeBottomPanel,
}: Props) {
  const [isMac, setIsMac] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  useEffect(() => { setIsMac(navigator.platform.toLowerCase().includes('mac')) }, [])

  const sidebarResize = useDragResize(onResizeSidebar, MIN_SIDEBAR, MAX_SIDEBAR, sidebarWidth, 'horizontal')
  const rightResize = useDragResize(onResizeRightPanel, MIN_RIGHT, MAX_RIGHT, rightPanelWidth, 'horizontal')
  const bottomResize = useDragResize(onResizeBottomPanel, MIN_BOTTOM, MAX_BOTTOM, bottomPanelHeight, 'vertical')

  return (
    <div className="flex flex-col h-screen bg-base">
      {isMac && <TitleBar />}

      <TrialBanner />

      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-shrink-0 border-r border-hover overflow-hidden"
          style={{ width: `${sidebarWidth}px` }}
        >
          {sidebar}
        </div>

        {/* Sidebar resize handle */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
          onMouseDown={sidebarResize.onMouseDown}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              {main}
            </div>

            {rightPanelOpen && rightPanel && (
              <>
                {/* Right panel resize handle */}
                <div
                  className="w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
                  onMouseDown={rightResize.onMouseDown}
                />
                <div
                  className="flex-shrink-0 border-l border-hover overflow-hidden"
                  style={{ width: `${rightPanelWidth}px` }}
                >
                  {rightPanel}
                </div>
              </>
            )}
          </div>

          {bottomPanelOpen && bottomPanel && (
            <>
              {/* Bottom panel resize handle */}
              <div
                className="h-1 flex-shrink-0 cursor-row-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
                onMouseDown={bottomResize.onMouseDown}
              />
              <div
                className="flex-shrink-0 border-t border-hover overflow-hidden"
                style={{ height: `${bottomPanelHeight}px` }}
              >
                {bottomPanel}
              </div>
            </>
          )}
        </div>
      </div>

      <StatusBar />

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoginSuccess={() => {
          // Refresh license status after login
          window.api.getLicenseStatus().then(() => {}).catch(() => {})
        }}
      />
    </div>
  )
}
