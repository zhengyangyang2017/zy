import { ChatView } from '../chat/ChatView'
import { InputArea } from '../chat/InputArea'

export function MainPanel() {
  return (
    <div className="flex flex-col h-full bg-base">
      <ChatView />
      <InputArea />
    </div>
  )
}
