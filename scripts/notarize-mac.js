/**
 * macOS notarization helper.
 *
 * Prerequisites:
 * 1. Apple Developer Program membership ($99/year)
 * 2. Developer ID Application certificate in Keychain
 * 3. App-specific password for Apple ID
 * 4. Set environment variables:
 *    - APPLE_ID: your Apple ID email
 *    - APPLE_TEAM_ID: your Team ID (from developer.apple.com/account)
 *    - APPLE_APP_SPECIFIC_PASSWORD: app-specific password
 *    - APPLE_IDENTITY: certificate identity (e.g., "Developer ID Application: Name (TEAMID)")
 *
 * electron-builder handles notarization when these env vars are set.
 */

function log(msg) { console.log(`[Notarize:Mac] ${msg}`) }
function warn(msg) { console.warn(`[Notarize:Mac] WARN: ${msg}`) }

async function main() {
  const appleId = process.env.APPLE_ID
  const teamId = process.env.APPLE_TEAM_ID
  const appPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const identity = process.env.APPLE_IDENTITY

  if (!appleId || !teamId || !appPassword) {
    warn('macOS notarization not configured — skipping')
    warn('Required: APPLE_ID, APPLE_TEAM_ID, APPLE_APP_SPECIFIC_PASSWORD')
    warn('Without notarization, macOS Gatekeeper will block the app')
    warn('Users will need to right-click → Open to bypass')
    process.exit(0)
  }

  log(`Apple ID: ${appleId}`)
  log(`Team ID: ${teamId}`)
  log(`Identity: ${identity || '(auto-detect)'}`)
  log('Notarization ready')

  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
