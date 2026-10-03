// Run ONCE on your own computer:  node scripts/make-voucher-keys.cjs
// Creates the key pair that lets the online server sign credit vouchers and the offline server check them.
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const publicFile = path.join(__dirname, '..', 'server', 'voucher-public.txt')
if (fs.existsSync(publicFile) && !process.argv.includes('--force')) {
  console.log('server/voucher-public.txt already exists, so no new keys were made.')
  console.log('Making new keys would stop every credit voucher already issued from working.')
  console.log('Run again with --force only if you really want to replace the keys.')
  process.exit(0)
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
const publicText = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
const privateText = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
fs.writeFileSync(publicFile, publicText + '\n')

console.log('Done. The public key was saved to server/voucher-public.txt (safe to keep in the project and GitHub).')
console.log('')
console.log('Now add this as a Railway variable named VOUCHER_PRIVATE_KEY.')
console.log('It is SECRET: never put it in a file, GitHub or a chat.')
console.log('')
console.log(privateText)
