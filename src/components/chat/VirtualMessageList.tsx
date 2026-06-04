import { memo } from 'react'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../../types'

interface Props {
  messages: Message[]
  onEdit?: (message: Message) => void
  onBranch?: (message: Message) => void
}

export const VirtualMessageList = memo(function VirtualMessageList({
  messages,
  onEdit,
  onBranch,
}: Props) {
  return (
    <div className="space-y-0">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onEdit={onEdit}
          onBranch={onBranch}
        />
      ))}
    </div>
  )
})
