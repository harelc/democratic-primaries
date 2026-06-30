import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function mergeBios() {
  let browser
  try {
    console.log('🚀 Launching headless browser...')

    const possiblePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Users/harel/.cache/puppeteer/chrome-headless-shell/mac_arm-145.0.7632.77/chrome-headless-shell-mac-arm64/chrome-headless-shell',
      '/Users/harel/.cache/puppeteer/chrome-headless-shell/mac_arm-145.0.7632.67/chrome-headless-shell-mac-arm64/chrome-headless-shell',
      '/Users/harel/.cache/puppeteer/chrome/mac_arm-121.0.6167.85/chrome-mac-arm64/Google Chrome.app/Contents/MacOS/Google Chrome',
    ]

    let executablePath
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        executablePath = p
        console.log(`📍 Using Chrome at: ${executablePath}`)
        break
      }
    }

    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }

    if (executablePath) {
      launchOptions.executablePath = executablePath
    }

    browser = await puppeteer.launch(launchOptions)
    const page = await browser.newPage()
    page.setDefaultNavigationTimeout(45000)
    page.setDefaultTimeout(45000)

    console.log('📄 Navigating to democrats.org.il/candidates...')
    await page.goto('https://democrats.org.il/candidates/', {
      waitUntil: 'networkidle2',
      timeout: 45000,
    })

    console.log('⏳ Waiting for candidates to load...')
    await new Promise(resolve => setTimeout(resolve, 5000))

    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight)
    })
    await new Promise(resolve => setTimeout(resolve, 3000))

    console.log('📊 Extracting fresh bio data...')
    const freshBios = await page.evaluate(() => {
      const items = []
      const gridItems = document.querySelectorAll('.jet-listing-grid__item')

      gridItems.forEach((item, index) => {
        const textEditors = item.querySelectorAll('.elementor-widget-text-editor')

        let name = ''
        let bio = ''

        if (textEditors.length >= 2) {
          let firstName = textEditors[0].textContent?.trim() || ''
          let lastName = textEditors[1].textContent?.trim() || ''
          name = `${firstName} ${lastName}`.trim()
        } else if (textEditors.length >= 1) {
          name = textEditors[0].textContent?.trim() || ''
        }

        // Get better bio extraction
        if (textEditors.length >= 3) {
          bio = textEditors[2].textContent?.trim() || ''
        } else {
          const bioEl = item.querySelector('[class*="excerpt"], [class*="description"]')
          if (bioEl) {
            bio = bioEl.textContent?.trim() || ''
          }
        }

        if (bio.length > 200) {
          bio = bio.substring(0, 200) + '...'
        }

        if (name && name.length > 3) {
          items.push({
            name: name,
            bio: bio,
          })
        }
      })

      return items
    })

    console.log(`✅ Scraped fresh data for ${freshBios.length} candidates`)

    // Load existing candidates
    const candidatesPath = path.join(__dirname, '../src/data/candidates.json')
    const existing = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'))

    console.log(`📦 Loaded ${existing.length} existing candidates`)

    // Merge intelligently
    let updated = 0
    const merged = existing.map((candidate, idx) => {
      if (idx >= freshBios.length) return candidate

      const fresh = freshBios[idx]
      const oldBio = candidate.bio || ''
      const oldBioWordCount = oldBio.trim().split(/\s+/).length

      // Only update if old bio is short (1-2 words) and new bio is substantial (3+ words)
      if (oldBioWordCount <= 2 && fresh.bio.length > 10) {
        console.log(`  ✓ [${idx}] ${candidate.name}: "${oldBio}" → "${fresh.bio.substring(0, 50)}..."`)
        updated++
        return {
          ...candidate,
          bio: fresh.bio,
        }
      }

      return candidate
    })

    console.log(`\n📝 Updated ${updated} bios with fresh data`)

    // Save merged candidates
    fs.writeFileSync(candidatesPath, JSON.stringify(merged, null, 2))
    console.log(`💾 Saved merged candidates to ${candidatesPath}`)

  } catch (error) {
    console.error('❌ Error merging bios:', error.message)
    process.exit(1)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

mergeBios()
