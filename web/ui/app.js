const $ = (selector) => document.querySelector(selector)
const tabs = [...document.querySelectorAll('.tab')]
const panels = [...document.querySelectorAll('.panel')]
const video = $('#native-video')
const placeholder = $('#video-placeholder')
let current = null
let hls = null
let lastPlaylist = ''
let status = null

function setTab(name) {
  if (!['world', 'status', 'native'].includes(name)) name = 'world'
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name))
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${name}`))
  if (name === 'native') startNative()
  if (name === 'world') $('#viewer').contentWindow?.dispatchEvent(new Event('resize'))
}

tabs.forEach((tab) => tab.addEventListener('click', () => {
  location.hash = tab.dataset.tab
  setTab(tab.dataset.tab)
}))
window.addEventListener('hashchange', () => setTab(location.hash.slice(1)))
setTab(location.hash.slice(1))

function metric(label, value) {
  const card = document.createElement('div')
  card.className = 'metric'
  const caption = document.createElement('div')
  caption.className = 'label'
  caption.textContent = label
  const output = document.createElement('div')
  output.className = 'value'
  output.textContent = value
  card.append(caption, output)
  return card
}

function definition(parent, label, value) {
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.textContent = value ?? '—'
  parent.append(dt, dd)
}

function renderStatus(state) {
  status = state
  const connection = $('#connection')
  connection.classList.toggle('online', Boolean(state.run))
  connection.lastChild.textContent = state.run ? ' runtime connected' : ' waiting for bot'
  $('#run-name').textContent = state.run || 'waiting for runtime'
  $('#stage').textContent = state.stage || state.active || 'starting'
  $('#metrics').replaceChildren(
    metric('position', state.position ? `${state.position.x}, ${state.position.y}, ${state.position.z}` : '—'),
    metric('health', state.health == null ? '—' : `${Number(state.health).toFixed(1)} / 20`),
    metric('food', state.food == null ? '—' : `${state.food} / 20`),
    metric('actions', String(state.steps ?? 0)),
    metric('dimension', state.dimension || 'connecting'),
  )

  const controller = $('#controller')
  controller.replaceChildren()
  definition(controller, 'planner', state.plannerName)
  definition(controller, 'controller', state.controllerName)
  definition(controller, 'world seed', state.knownSeed?.seed)
  definition(controller, 'difficulty', state.difficulty)
  definition(controller, 'native recorder', state.recordReady ? (state.recordFinished ? 'finished' : 'capturing') : 'starting')
  $('#objective').textContent = state.plan?.objective || 'waiting for first observation'
  $('#active').textContent = state.active ? `active: ${state.active}` : ''

  const inventory = $('#inventory')
  inventory.replaceChildren()
  const items = Object.entries(state.inventory || {}).filter(([, count]) => count > 0)
  if (!items.length) {
    const empty = document.createElement('span')
    empty.className = 'muted'
    empty.textContent = 'empty'
    inventory.append(empty)
  } else {
    for (const [name, count] of items) {
      const item = document.createElement('span')
      item.className = 'item'
      item.textContent = `${name.replaceAll('_', ' ')} ×${count}`
      inventory.append(item)
    }
  }

  const recent = $('#recent')
  recent.replaceChildren()
  for (const action of [...(state.recent || [])].reverse()) {
    const row = document.createElement('li')
    const step = document.createElement('span')
    step.textContent = `#${action.step ?? '—'}`
    const description = document.createElement('span')
    description.textContent = `${action.action || 'action'} · ${action.result || 'pending'}`
    const position = document.createElement('span')
    position.textContent = action.position ? `${action.position.x}, ${action.position.y}, ${action.position.z}` : ''
    row.append(step, description, position)
    recent.append(row)
  }
  $('#raw-status').textContent = JSON.stringify(state, null, 2)
  $('#updated').textContent = `updated ${new Date().toLocaleTimeString()}`
  updateNativeState(state)
}

function initializeHls(url) {
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url
    video.play().catch(() => {})
    return true
  }
  if (!window.Hls?.isSupported()) return false
  hls?.destroy()
  hls = new Hls({
    liveSyncDurationCount: 2,
    liveMaxLatencyDurationCount: 3,
    maxLiveSyncPlaybackRate: 1.05,
    maxBufferLength: 10,
    lowLatencyMode: false,
  })
  hls.loadSource(url)
  hls.attachMedia(video)
  hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
    else if (data.fatal && data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
    else if (data.fatal) {
      hls.destroy()
      hls = null
      current = null
    }
  })
  return true
}

async function updateNativeState(state) {
  const run = state.run
  const streamState = $('#stream-state')
  if (!run || !state.recordReady) {
    streamState.textContent = 'waiting for the bot, native mirror, and recorder'
    placeholder.classList.remove('hidden')
    return
  }
  streamState.textContent = state.recordFinished ? 'capture finished · live playlist retained' : 'capturing 960 × 540 at 20 fps'
  const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')
  if (!nativeHls && !window.Hls?.isSupported()) {
    streamState.textContent = 'this browser has no native or Media Source HLS playback'
    placeholder.textContent = 'HLS playback is unavailable in this browser'
    placeholder.classList.remove('hidden')
    return
  }
  placeholder.classList.add('hidden')
  const url = `/runs/${encodeURIComponent(run)}/native-live/index.m3u8`
  if (current !== run || lastPlaylist !== url) {
    current = run
    lastPlaylist = url
    if (!initializeHls(url)) streamState.textContent = 'this browser cannot play HLS'
  }
  const download = $('#download')
  const finishedUrl = `/runs/${encodeURIComponent(run)}/full-playthrough.mp4.finished.json`
  try {
    const finished = await fetch(finishedUrl, { method: 'HEAD', cache: 'no-store' })
    download.href = `/runs/${encodeURIComponent(run)}/full-playthrough.mp4`
    download.classList.toggle('hidden', !finished.ok)
  } catch {
    download.classList.add('hidden')
  }
}

function startNative() {
  if (!status) return
  updateNativeState(status)
}

async function poll() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' })
    if (!response.ok) throw new Error(`status endpoint returned ${response.status}`)
    renderStatus(await response.json())
  } catch (error) {
    $('#connection').classList.remove('online')
    $('#connection').lastChild.textContent = ' runtime unavailable'
    $('#stream-state').textContent = error.message
  } finally {
    window.setTimeout(poll, 1000)
  }
}

poll()
