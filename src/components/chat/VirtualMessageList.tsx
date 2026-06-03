import { useRef, useEffect } from 'react'
import { List, useDynamicRowHeight, useListRef } from 'react-window'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../../types'

const ESTIMATED_SIZE = 120
const OVERSCAN = 5

interface RowData {
  messages: Message[]
}

function RowComponent({ index, style, messages }: { index: number; style: React.CSSProperties } & RowData) {
  const rowRef = useRef<HTMLDivElement>(null)
  const message = messages[index]

  return (
    <div style={style}>
      <div ref={rowRef}>
        <MessageBubble message={message} />
      </div>
    </div>
  )
}

export function VirtualMessageList({ messages }: { messages: Message[] }) {
  const listRef = useListRef()
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: ESTIMATED_SIZE })
  const containerRef = useRef<HTMLDivElement>(null)
  const measuredRef = useRef<Set<number>>(new Set())
  const prevLenRef = useRef(messages.length)

  const rowData: RowData = { messages }

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevLenRef.current) {
      // New messages added — scroll to bottom
      setTimeout(() => {
        listRef.current?.scrollToRow({ index: messages.length - 1, align: 'end' })
      }, 50)
    }
    prevLenRef.current = messages.length
  }, [messages.length, listRef])

  if (messages.length === 0) return null

  return (
    <div ref={containerRef} className="h-full">
      <List
        listRef={listRef}
        rowComponent={RowComponent}
        rowCount={messages.length}
        rowHeight={dynamicRowHeight}
        rowProps={rowData}
        overscanCount={OVERSCAN}
        className="virtual-list"
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  )
}
