import { useI18n } from '../../i18n'

export function WelcomeScreen() {
  const { t } = useI18n()

  return (
    <div className="text-center">
      <p className="text-2xl mb-2">🤖</p>
      <p className="text-text-secondary">{t('chat.empty')}</p>
    </div>
  )
}
