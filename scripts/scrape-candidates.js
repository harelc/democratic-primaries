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

    // Find installed Chrome executables
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
    // Give page time to render with JS - longer wait
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Try to trigger scroll or interaction to load lazy content
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight)
    })
    await new Promise(resolve => setTimeout(resolve, 3000))

    console.log('📊 Extracting candidate data...')
    const candidates = await page.evaluate(() => {
      const items = []

      // Target the Elementor Jet Engine grid items
      const gridItems = document.querySelectorAll('.jet-listing-grid__item')

      gridItems.forEach((item, index) => {
        // Find all text-editor widgets - these contain name and bio
        const textEditors = item.querySelectorAll('.elementor-widget-text-editor')

        // Debug: log for candidate 4 & 5
        if (index === 4 || index === 5) {
          console.log(`[DEBUG] Item ${index}: ${textEditors.length} text editors`)
          textEditors.forEach((te, i) => {
            console.log(`  [${i}]: "${te.textContent?.trim()}"`)
          })
        }

        let name = ''
        let bio = ''

        // Function to remove title prefixes
        const removeTitle = (text) => {
          return text
            .replace(/^ד״ר\s+/, '')
            .replace(/^דר\.\s+/, '')
            .replace(/^פרופ״\s+/, '')
            .replace(/^פרופ\.\s+/, '')
            .replace(/^מר\.\s+/, '')
            .replace(/^גב\.\s+/, '')
            .replace(/^תאג״ד\s+/, '')
            .trim()
        }

        // Extract name and bio from text editors
        // Usually structure is: [0] = firstName/title+firstName, [1] = lastName, [2+] = bio
        // Note: Don't try to remove titles here - will do post-processing with better string handling
        if (textEditors.length >= 2) {
          let firstName = textEditors[0].textContent?.trim() || ''
          let lastName = textEditors[1].textContent?.trim() || ''
          name = `${firstName} ${lastName}`.trim()
        } else if (textEditors.length >= 1) {
          name = textEditors[0].textContent?.trim() || ''
        }

        // Find image
        const imgEl = item.querySelector('img')
        const photoUrl = imgEl?.src || imgEl?.dataset?.src || ''

        // Extract biography - skip the first 2 (name fields) and get the 3rd+
        // Bio is usually longer text in a paragraph element
        const bioEl = item.querySelector('[class*="excerpt"], [class*="description"]')
        if (bioEl) {
          bio = bioEl.textContent?.trim() || ''
        } else if (textEditors.length >= 3) {
          // Fallback: try to get from additional text editors
          bio = textEditors[2].textContent?.trim() || ''
        }

        // Limit bio to 150 characters
        if (bio.length > 150) {
          bio = bio.substring(0, 150) + '...'
        }

        // Extract social media links
        const socialLinks = {}
        const links = item.querySelectorAll('a[href]')
        links.forEach(link => {
          const href = link.getAttribute('href') || ''
          const html = link.innerHTML.toLowerCase()

          // Check for social media indicators
          if (html.includes('facebook') || href.includes('facebook')) {
            socialLinks.facebook = href
          } else if (html.includes('instagram') || href.includes('instagram')) {
            socialLinks.instagram = href
          } else if (html.includes('twitter') || html.includes('x.com') || href.includes('twitter') || href.includes('x.com')) {
            socialLinks.twitter = href
          } else if (html.includes('linkedin') || href.includes('linkedin')) {
            socialLinks.linkedin = href
          } else if (html.includes('website') || html.includes('אתר')) {
            socialLinks.website = href
          }
        })

        // Only add valid candidates (name with 2+ words or meaningful length)
        if (name && name.length > 3) {
          items.push({
            id: `candidate_${String(items.length + 1).padStart(3, '0')}`,
            name: name,
            bio: bio,
            region: '',
            background: '',
            photoUrl: photoUrl,
            socialLinks: socialLinks,
          })
        }
      })

      return items
    })

    console.log(`✅ Found ${candidates.length} candidates`)
    console.log('📋 RAW (before cleanup):')
    candidates.slice(4, 6).forEach((c, i) => console.log(`  [${i+4}] "${c.name}"`))

    if (candidates.length === 0) {
      console.log('⚠️  Warning: No candidates found. Page may not have loaded properly.')
      console.log('📷 Taking screenshot for debugging...')
      await page.screenshot({ path: 'candidates-debug.png' })
    }

    // Post-process: clean up titles and fix names
    const titlePatterns = [
      'ד״ר', 'דר', 'דר.', 'DR', 'Dr',
      'פרופ״', 'פרופ', 'פרופ.', 'PROF', 'Prof',
      'אלוף', 'ALOFוף',
      'מר', 'MR', 'Mr',
      'גב', 'MS', 'Mrs', 'גברת',
      'תאג״ד'
    ]

    const cleanedCandidates = candidates.map(c => {
      let words = c.name.split(' ').filter(w => w.trim())

      // Remove words from start if they match title patterns
      while (words.length > 1) { // Keep at least 1 word
        const first = words[0].trim()
        const isTitle =
          titlePatterns.some(pattern => first.includes(pattern)) ||
          (first.length <= 6 && /^[דפמגתD]/.test(first)) // Short word starting with title letters

        if (isTitle) {
          words = words.slice(1)
        } else {
          break
        }
      }

      return {...c, name: words.join(' ').trim()}
    })

    // Save to file
    const outputPath = path.join(__dirname, '../src/data/candidates.json')
    fs.writeFileSync(outputPath, JSON.stringify(cleanedCandidates, null, 2))
    console.log(`💾 Saved ${cleanedCandidates.length} candidates to ${outputPath}`)

    // Print first few candidates
    if (candidates.length > 0) {
      console.log('\n📋 Sample candidates:')
      candidates.slice(0, 3).forEach(c => {
        console.log(`  - ${c.name}`)
      })
    }

  } catch (error) {
    console.error('❌ Error scraping candidates:', error.message)
    process.exit(1)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

scrapeCanditates()
