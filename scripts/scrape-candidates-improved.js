import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function scrapeCanditates() {
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

    console.log('📊 Extracting candidate data...')
    const candidates = await page.evaluate(() => {
      const items = []
      const gridItems = document.querySelectorAll('.jet-listing-grid__item')

      gridItems.forEach((item, index) => {
        const textEditors = item.querySelectorAll('.elementor-widget-text-editor')

        let name = ''
        let bio = ''

        // Extract name from first 2 text editors
        if (textEditors.length >= 2) {
          let firstName = textEditors[0].textContent?.trim() || ''
          let lastName = textEditors[1].textContent?.trim() || ''
          name = `${firstName} ${lastName}`.trim()
        } else if (textEditors.length >= 1) {
          name = textEditors[0].textContent?.trim() || ''
        }

        // Try multiple strategies to extract bio
        // Strategy 1: Look for longest text in text editors (3rd and beyond)
        let bioTexts = []
        for (let i = 2; i < textEditors.length; i++) {
          const text = textEditors[i].textContent?.trim() || ''
          if (text.length > 20) {
            bioTexts.push(text)
          }
        }

        if (bioTexts.length > 0) {
          bio = bioTexts.join(' ')
        }

        // Strategy 2: Look for paragraph or description elements
        if (!bio || bio.length < 20) {
          const paragraphs = item.querySelectorAll('p, .elementor-text-editor')
          for (const p of paragraphs) {
            const text = p.textContent?.trim() || ''
            // Skip if it's the name or very short
            if (text.length > 30 && !text.includes(firstName) && text !== name) {
              bio = text
              break
            }
          }
        }

        // Strategy 3: Get all text content and extract the longest meaningful part
        if (!bio || bio.length < 20) {
          const allText = item.textContent?.trim() || ''
          const parts = allText.split('\n').filter(p => p.trim().length > 30)
          if (parts.length > 0) {
            bio = parts[parts.length - 1]
          }
        }

        // Keep full bio, no trimming

        if (name && name.length > 3) {
          items.push({
            id: `candidate_${String(items.length + 1).padStart(3, '0')}`,
            name: name,
            bio: bio,
            region: '',
            background: '',
            photoUrl: item.querySelector('img')?.src || '',
            socialLinks: {},
          })
        }
      })

      return items
    })

    console.log(`✅ Scraped ${candidates.length} candidates with bios`)

    // Show sample
    console.log('\n📋 Sample candidates:')
    candidates.slice(4, 7).forEach((c, i) => {
      console.log(`  [${i + 5}] ${c.name}`)
      console.log(`      Bio: "${c.bio.substring(0, 60)}${c.bio.length > 60 ? '...' : ''}"`)
    })

    // Load existing candidates to merge
    const candidatesPath = path.join(__dirname, '../src/data/candidates.json')
    const existing = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'))

    console.log(`\n📦 Merging with ${existing.length} existing candidates...`)

    // Merge: preserve corrected names, update bios
    const merged = existing.map((oldCandidate, idx) => {
      if (idx >= candidates.length) return oldCandidate

      const newData = candidates[idx]
      const oldBioLength = (oldCandidate.bio || '').trim().length

      // If old bio is short (<=20 chars) and new bio is longer, use new
      if (oldBioLength <= 20 && newData.bio.length > 30) {
        console.log(`  ✓ Updated bio for ${oldCandidate.name}`)
        return {
          ...oldCandidate,
          bio: newData.bio,
        }
      }

      return oldCandidate
    })

    const bioUpdates = merged.filter((m, idx) => m.bio !== existing[idx].bio).length
    console.log(`\n✅ Updated ${bioUpdates} bios`)

    // Save
    fs.writeFileSync(candidatesPath, JSON.stringify(merged, null, 2))
    console.log(`💾 Saved to ${candidatesPath}`)

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

scrapeCanditates()
