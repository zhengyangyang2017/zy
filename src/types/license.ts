export interface LicenseStatus {
  tier: 'free' | 'pro' | 'enterprise'
  trial: boolean
  daysRemaining?: number
  userId?: string
}
