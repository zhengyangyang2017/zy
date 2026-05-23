/**
 * Windows Authenticode signing script.
 *
 * Prerequisites:
 * 1. Obtain an EV Code Signing Certificate from a CA (DigiCert, Sectigo, etc.)
 * 2. Export as .pfx file (contains private key + certificate chain)
 * 3. Set environment variables:
 *    - WIN_CSC_FILE: path to .pfx file
 *    - WIN_CSC_PASSWORD: certificate password
 *
 * For CI: store the .pfx as a base64-encoded secret and decode at build time.
 *
 * electron-builder handles the actual signing when these env vars are set.
 * This script validates the signing environment.
 */

const fs = require('fs')
const path = require('path')

function log(msg) { console.log(`[Sign:Win] ${msg}`) }
function warn(msg) { console.warn(`[Sign:Win] WARN: ${msg}`) }

async function main() {
  const certFile = process.env.WIN_CSC_FILE
  const certPass = process.env.WIN_CSC_PASSWORD

  if (!certFile) {
    warn('No WIN_CSC_FILE set — skipping code signing')
    warn('The generated .exe will show "Unknown Publisher" warnings')
    warn('To sign: set WIN_CSC_FILE and WIN_CSC_PASSWORD environment variables')
    process.exit(0)
  }

  if (!fs.existsSync(certFile)) {
    warn(`Certificate file not found: ${certFile}`)
    process.exit(1)
  }

  if (!certPass) {
    warn('WIN_CSC_PASSWORD not set')
    process.exit(1)
  }

  log(`Using certificate: ${certFile}`)
  log('Code signing ready')

  // electron-builder handles actual signing via sign tool
  // This script just validates the environment
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
