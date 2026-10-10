import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Mode = 'signin' | 'signup' | 'forgot'
type Organization = { id: string; name: string; owner_id: string; created_at: string }
type Location = { id: string; organization_id: string; name: string; city: string | null; country: string | null; timezone?: string; created_at: string }
type Zone = { id: string; location_id: string; name: string; channel_id: string | null; created_at: string }
type Channel = { id: string; name: string; slug: string; description: string | null; mood: string | null; active: boolean; created_at: string }
type Track = {
  id: string
  channel_id: string
  track_code: string | null
  title: string
  audio_url: string | null
  bpm: number | null
  musical_key: string | null
  storage_path: string | null
  duration_seconds: number | null
  sort_order: number
  active?: boolean
}
type Schedule = {
  id: string
  zone_id: string
  channel_id: string
  name: string | null
  days_of_week: number[]
  start_time: string
  end_time: string
  priority: number
  active: boolean
}
type ZoneOverview = {
  zone_id: string
  current_channel_id: string | null
  current_channel_name: string | null
  default_channel_name: string | null
}
type SubscriptionRecord = {
  id: string
  organization_id: string | null
  user_id: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  plan: 'essence' | 'signature' | 'premium' | null
  status: string
  trial_end: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

type AdminSubscription = {
  id: string
  organization_id: string | null
  plan: 'essence' | 'signature' | 'premium' | null
  status: string
  trial_end: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
}

type AdminCustomer = {
  id: string
  name: string
  created_at: string
  subscription: AdminSubscription | null
  locations: number
  zones: number
  devices: number
  online_devices: number
  offline_devices: number
  unpaired_devices: number
}

type AdminHealthAlert = {
  id: string
  kind: 'billing' | 'player' | 'playback' | string
  priority: 'critical' | 'high' | 'medium' | 'low' | string
  title: string
  detail: string
  organization_id: string | null
  device_id: string | null
  created_at: string
}

type AdminHealth = {
  generated_at: string
  counts: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  alerts: AdminHealthAlert[]
}

type AdminActivityEvent = {
  id: string
  type: 'subscription' | 'music' | 'player' | 'error' | string
  severity: 'info' | 'success' | 'warning' | 'critical' | string
  title: string
  detail: string
  organization_id: string | null
  device_id: string | null
  actor_user_id?: string | null
  actor_email?: string | null
  source?: string | null
  metadata?: Record<string, unknown>
  created_at: string
}

type AdminActivity = {
  generated_at: string
  persistent?: boolean
  events: AdminActivityEvent[]
}

type AdminMusicLibrary = {
  channels: Channel[]
  tracks: Track[]
}

type AdminTrackDraft = {
  channel_id: string
  title: string
  track_code: string
  bpm: string
  musical_key: string
  audio_url: string
  storage_path: string
  duration_seconds: string
  sort_order: string
}

type AdminSummary = {
  generated_at: string
  metrics: {
    organizations: number
    active_subscriptions: number
    trialing: number
    mrr_eur: number
    devices: number
    online_devices: number
    offline_devices: number
    unpaired_devices: number
  }
  customers: AdminCustomer[]
  devices: PlayerDevice[]
}

type PlayerDevice = {
  device_id: string
  device_code: string
  device_name: string
  organization_id: string
  organization_name: string
  location_id: string
  location_name: string
  zone_id: string
  zone_name: string
  platform: string | null
  app_version: string | null
  volume: number
  playback_state: string
  current_channel_id: string | null
  current_channel_name: string | null
  current_track_id: string | null
  track_code: string | null
  current_track_title: string | null
  last_seen_at: string | null
  paired_at: string | null
  activation_code: string | null
  activation_expires_at: string | null
  is_active: boolean
  device_status: 'online' | 'offline' | 'unpaired' | 'disabled'
  seconds_since_last_seen: number | null
}

const dayOptions = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
]

function DashboardApp() {
  const [mode, setMode] = useState<Mode>('signin')
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [authLoading, setAuthLoading] = useState(true)

  const [organization, setOrganization] = useState<Organization | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [zoneOverview, setZoneOverview] = useState<ZoneOverview[]>([])
  const [devices, setDevices] = useState<PlayerDevice[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataMsg, setDataMsg] = useState('')
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [selectedAdminCustomerId, setSelectedAdminCustomerId] = useState<string | null>(null)
  const [adminActionLoading, setAdminActionLoading] = useState<string | null>(null)
  const [adminMusic, setAdminMusic] = useState<AdminMusicLibrary | null>(null)
  const [adminMusicLoading, setAdminMusicLoading] = useState(false)
  const [adminMusicMsg, setAdminMusicMsg] = useState('')
  const [adminUploadTrackId, setAdminUploadTrackId] = useState<string | null>(null)
  const [adminCustomerSearch, setAdminCustomerSearch] = useState('')
  const [adminPlanFilter, setAdminPlanFilter] = useState('all')
  const [adminStatusFilter, setAdminStatusFilter] = useState('all')
  const [adminPlayerFilter, setAdminPlayerFilter] = useState('all')
  const [adminDeviceSearch, setAdminDeviceSearch] = useState('')
  const [adminActivity, setAdminActivity] = useState<AdminActivity | null>(null)
  const [adminActivityLoading, setAdminActivityLoading] = useState(false)
  const [adminActivitySearch, setAdminActivitySearch] = useState('')
  const [adminActivityType, setAdminActivityType] = useState('all')
  const [adminHealth, setAdminHealth] = useState<AdminHealth | null>(null)
  const [adminHealthLoading, setAdminHealthLoading] = useState(false)
  const [adminHealthPriority, setAdminHealthPriority] = useState('all')
  const [adminHealthKind, setAdminHealthKind] = useState('all')
  const [adminMusicChannelFilter, setAdminMusicChannelFilter] = useState('all')
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelMood, setNewChannelMood] = useState('')
  const [newTrack, setNewTrack] = useState<AdminTrackDraft>({
    channel_id: '',
    title: '',
    track_code: '',
    bpm: '',
    musical_key: '',
    audio_url: '',
    storage_path: '',
    duration_seconds: '',
    sort_order: '0',
  })
  const isAdminPath = window.location.pathname.startsWith('/admin')

  const [orgName, setOrgName] = useState('')
  const [locationName, setLocationName] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [zoneName, setZoneName] = useState('')
  const [zoneLocationId, setZoneLocationId] = useState('')

  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [scheduleZoneId, setScheduleZoneId] = useState('')
  const [scheduleChannelId, setScheduleChannelId] = useState('')
  const [scheduleName, setScheduleName] = useState('')
  const [scheduleStart, setScheduleStart] = useState('07:00')
  const [scheduleEnd, setScheduleEnd] = useState('12:00')
  const [scheduleDays, setScheduleDays] = useState<number[]>([1,2,3,4,5,6,7])

  const [deviceName, setDeviceName] = useState('')
  const [deviceZoneId, setDeviceZoneId] = useState('')

  const [audioUrl, setAudioUrl] = useState('')
  const [nowPlaying, setNowPlaying] = useState<Track | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !isAdminPath) return

    void loadAdminSummary()
    void loadAdminMusic()
    void loadAdminActivity()
    void loadAdminHealth()
  }, [session, isAdminPath])

  async function loadAdminHealth() {
    if (!session) return

    setAdminHealthLoading(true)

    try {
      const response = await fetch(
        'https://lelvine-api-git.mateusz-bartchodzie101.workers.dev/admin/health',
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      const result = await response.json() as AdminHealth & { error?: string }

      if (!response.ok) {
        throw new Error(result.error || 'Could not load health monitoring.')
      }

      setAdminHealth(result)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not load health monitoring.')
    } finally {
      setAdminHealthLoading(false)
    }
  }

  async function loadAdminActivity() {
    if (!session) return

    setAdminActivityLoading(true)

    try {
      const response = await fetch(
        'https://lelvine-api-git.mateusz-bartchodzie101.workers.dev/admin/activity',
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      const result = await response.json() as AdminActivity & { error?: string }

      if (!response.ok) {
        throw new Error(result.error || 'Could not load activity log.')
      }

      setAdminActivity(result)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not load activity log.')
    } finally {
      setAdminActivityLoading(false)
    }
  }

  async function adminMusicRequest(path: string, options: RequestInit = {}) {
    if (!session) throw new Error('Not signed in.')

    const response = await fetch(
      'https://lelvine-api-git.mateusz-bartchodzie101.workers.dev' + path,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          ...(options.headers || {}),
        },
      }
    )

    const result = await response.json() as Record<string, unknown> & { error?: string }
    if (!response.ok) throw new Error(result.error || 'Admin music request failed.')
    return result
  }

  async function loadAdminMusic() {
    if (!session) return
    setAdminMusicLoading(true)
    setAdminMusicMsg('')

    try {
      const result = await adminMusicRequest('/admin/music') as unknown as AdminMusicLibrary
      setAdminMusic(result)
      if (!newTrack.channel_id && result.channels[0]) {
        setNewTrack((current) => ({ ...current, channel_id: result.channels[0].id }))
      }
    } catch (error) {
      setAdminMusicMsg(error instanceof Error ? error.message : 'Could not load music library.')
    } finally {
      setAdminMusicLoading(false)
    }
  }

  async function createAdminChannel(e: FormEvent) {
    e.preventDefault()
    if (!newChannelName.trim()) return

    setAdminMusicLoading(true)
    setAdminMusicMsg('')

    try {
      await adminMusicRequest('/admin/music/channel', {
        method: 'POST',
        body: JSON.stringify({
          name: newChannelName.trim(),
          mood: newChannelMood.trim() || null,
          active: true,
        }),
      })
      setNewChannelName('')
      setNewChannelMood('')
      setAdminMusicMsg('Channel added.')
      await loadAdminMusic()
    } catch (error) {
      setAdminMusicMsg(error instanceof Error ? error.message : 'Could not add channel.')
      setAdminMusicLoading(false)
    }
  }

  async function uploadAdminTrackAudio(trackId: string, file: File) {
    if (!session) return

    setAdminUploadTrackId(trackId)
    setAdminMusicMsg('')

    try {
      const form = new FormData()
      form.append('file', file)

      const response = await fetch(
        `https://lelvine-api-git.mateusz-bartchodzie101.workers.dev/admin/music/upload/${encodeURIComponent(trackId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: form,
        }
      )

      const result = await response.json() as { error?: string; file_name?: string }

      if (!response.ok) {
        throw new Error(result.error || 'Could not upload audio file.')
      }

      setAdminMusicMsg(`Uploaded ${result.file_name || 'audio file'}.`)
      await loadAdminMusic()
    } catch (error) {
      setAdminMusicMsg(error instanceof Error ? error.message : 'Could not upload audio file.')
    } finally {
      setAdminUploadTrackId(null)
    }
  }

  async function createAdminTrack(e: FormEvent) {
    e.preventDefault()
    if (!newTrack.channel_id || !newTrack.title.trim()) return

    setAdminMusicLoading(true)
    setAdminMusicMsg('')

    try {
      await adminMusicRequest('/admin/music/track', {
        method: 'POST',
        body: JSON.stringify(newTrack),
      })
      setNewTrack((current) => ({
        ...current,
        title: '',
        track_code: '',
        bpm: '',
        musical_key: '',
        audio_url: '',
        storage_path: '',
        duration_seconds: '',
        sort_order: '0',
      }))
      setAdminMusicMsg('Track added.')
      await loadAdminMusic()
    } catch (error) {
      setAdminMusicMsg(error instanceof Error ? error.message : 'Could not add track.')
      setAdminMusicLoading(false)
    }
  }

  async function patchAdminMusic(kind: 'channel' | 'track', id: string, patch: Record<string, unknown>) {
    setAdminMusicLoading(true)
    setAdminMusicMsg('')

    try {
      await adminMusicRequest(`/admin/music/${kind}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      await loadAdminMusic()
    } catch (error) {
      setAdminMusicMsg(error instanceof Error ? error.message : 'Could not update music library.')
      setAdminMusicLoading(false)
    }
  }

  async function openAdminCustomerPortal(organizationId: string) {
    if (!session) return

    setAdminActionLoading('portal')
    setAdminError('')

    try {
      const response = await fetch(
        'https://lelvine-api-git.mateusz-bartchodzie101.workers.dev/admin/create-portal-session',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ organization_id: organizationId }),
        }
      )

      const result = await response.json() as { url?: string; error?: string }

      if (!response.ok || !result.url) {
        throw new Error(result.error || 'Could not open customer billing portal.')
      }

      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not open customer billing portal.')
    } finally {
      setAdminActionLoading(null)
    }
  }

  async function loadAdminSummary() {
    if (!session) return

    setAdminLoading(true)
    setAdminError('')

    try {
      const response = await fetch(
        'https://lelvine-api-git.mateusz-bartchodzie101.workers.dev/admin/summary',
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      )

      const result = await response.json() as AdminSummary & { error?: string }

      if (!response.ok) {
        throw new Error(result.error || 'Could not load admin dashboard.')
      }

      setAdminSummary(result)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not load admin dashboard.')
      setAdminSummary(null)
    } finally {
      setAdminLoading(false)
    }
  }

  useEffect(() => {
    if (!session) {
      setOrganization(null)
      setLocations([])
      setZones([])
      setChannels([])
      setTracks([])
      setSchedules([])
      setZoneOverview([])
      setDevices([])
      setSubscription(null)
      return
    }
    void loadHotelData()
  }, [session])

  useEffect(() => {
    if (!session || !organization) {
      setSubscription(null)
      return
    }

    void (async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!error) setSubscription((data ?? null) as SubscriptionRecord | null)
    })()
  }, [session, organization?.id])

  async function loadHotelData() {
    setDataLoading(true)
    setDataMsg('')

    const [
      { data: orgs, error: orgError },
      { data: channelData, error: channelError },
      { data: trackData, error: trackError },
    ] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at', { ascending: true }).limit(1),
      supabase.from('channels').select('*').eq('active', true).order('created_at', { ascending: true }),
      supabase.from('tracks').select('*').eq('active', true).order('track_code', { ascending: true }),
    ])

    if (orgError || channelError || trackError) {
      setDataMsg(orgError?.message ?? channelError?.message ?? trackError?.message ?? 'Could not load data.')
      setDataLoading(false)
      return
    }

    const nextChannels = (channelData ?? []) as Channel[]
    setChannels(nextChannels)
    setTracks((trackData ?? []) as Track[])
    setSelectedChannelId((current) => current || nextChannels[0]?.id || '')
    setScheduleChannelId((current) => current || nextChannels[0]?.id || '')

    const org = (orgs?.[0] ?? null) as Organization | null
    setOrganization(org)

    if (!org) {
      setLocations([])
      setZones([])
      setSchedules([])
      setZoneOverview([])
      setDevices([])
      setDataLoading(false)
      return
    }

    const [
      { data: locData, error: locError },
      { data: zoneData, error: zoneError },
      { data: scheduleData, error: scheduleError },
      { data: overviewData, error: overviewError },
      { data: deviceData, error: deviceError },
    ] = await Promise.all([
      supabase.from('locations').select('*').eq('organization_id', org.id).order('created_at', { ascending: true }),
      supabase.from('zones').select('*').order('created_at', { ascending: true }),
      supabase.from('zone_schedules').select('*').order('start_time', { ascending: true }),
      supabase.from('zone_music_overview').select('zone_id,current_channel_id,current_channel_name,default_channel_name'),
      supabase.from('player_device_overview').select('*').order('device_name', { ascending: true }),
    ])

    if (locError || zoneError || scheduleError || overviewError || deviceError) {
      setDataMsg(
        locError?.message ??
        zoneError?.message ??
        scheduleError?.message ??
        overviewError?.message ??
        deviceError?.message ??
        'Could not load hotel data.'
      )
      setDataLoading(false)
      return
    }

    const nextLocations = (locData ?? []) as Location[]
    const nextZones = (zoneData ?? []) as Zone[]
    setLocations(nextLocations)
    setZones(nextZones)
    setSchedules((scheduleData ?? []) as Schedule[])
    setZoneOverview((overviewData ?? []) as ZoneOverview[])
    setDevices((deviceData ?? []) as PlayerDevice[])

    if (!zoneLocationId && nextLocations[0]) setZoneLocationId(nextLocations[0].id)
    setScheduleZoneId((current) => current || nextZones[0]?.id || '')
    setDeviceZoneId((current) => current || nextZones[0]?.id || '')
    setDataLoading(false)
  }

  async function submitAuth(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    setAuthLoading(true)

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        setMsg('Check your inbox and confirm your email.')
      }

      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setMsg('Reset link sent.')
      }
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setAuthLoading(false)
    }
  }

  async function createOrganization(e: FormEvent) {
    e.preventDefault()
    if (!session || !orgName.trim()) return

    setDataLoading(true)
    setDataMsg('')

    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: orgName.trim(), owner_id: session.user.id })
      .select()
      .single()

    if (error) {
      setDataMsg(error.message)
      setDataLoading(false)
      return
    }

    setOrganization(data as Organization)
    setOrgName('')
    setDataLoading(false)
  }

  async function createLocation(e: FormEvent) {
    e.preventDefault()
    if (!organization || !locationName.trim()) return

    setDataLoading(true)
    setDataMsg('')

    const { data, error } = await supabase
      .from('locations')
      .insert({
        organization_id: organization.id,
        name: locationName.trim(),
        city: city.trim() || null,
        country: country.trim() || null,
        timezone: 'Europe/Warsaw',
      })
      .select()
      .single()

    if (error) {
      setDataMsg(error.message)
      setDataLoading(false)
      return
    }

    const created = data as Location
    setLocations((current) => [...current, created])
    setZoneLocationId((current) => current || created.id)
    setLocationName('')
    setCity('')
    setCountry('')
    setDataLoading(false)
  }

  const subscriptionUsable = subscription ? ['trialing', 'active'].includes(subscription.status) : false
  const zoneLimit =
    subscription?.plan === 'essence'
      ? 1
      : subscription?.plan === 'signature'
        ? 3
        : subscription?.plan === 'premium'
          ? Infinity
          : 0
  const zoneLimitReached = Number.isFinite(zoneLimit) && zones.length >= zoneLimit
  const advancedSchedulingEnabled =
    subscriptionUsable &&
    (subscription?.plan === 'signature' || subscription?.plan === 'premium')
  const premiumFeaturesEnabled =
    subscriptionUsable && subscription?.plan === 'premium'
  const regularRefreshesEnabled =
    subscriptionUsable &&
    (subscription?.plan === 'signature' || subscription?.plan === 'premium')
  const seasonalUpdatesEnabled =
    subscriptionUsable && subscription?.plan === 'premium'

  const hasChannelAssigned = zones.some((zone) => Boolean(zone.channel_id))
  const hasPairedPlayer = devices.some((device) => Boolean(device.paired_at))
  const onlineDevices = devices.filter((device) => device.device_status === 'online').length
  const playingDevices = devices.filter((device) => device.playback_state === 'playing').length
  const configuredZones = zones.filter((zone) => Boolean(zone.channel_id)).length
  const attentionDevices = devices.filter((device) => device.device_status === 'offline' || device.device_status === 'unpaired').length
  const systemHealthy =
    Boolean(organization) &&
    subscriptionUsable &&
    zones.length > 0 &&
    configuredZones === zones.length &&
    devices.length > 0 &&
    attentionDevices === 0

  const trialDaysLeft = subscription?.trial_end
    ? Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / 86400000)
    : null

  const dashboardAlerts = [
    ...(!subscription
      ? [{
          key: 'no-plan',
          level: 'warning',
          title: 'No active plan',
          detail: 'Choose a plan to activate zones and playback.',
          target: 'onboarding-billing',
          action: 'Choose plan',
        }]
      : []),
    ...(trialDaysLeft !== null && trialDaysLeft >= 0 && trialDaysLeft <= 3
      ? [{
          key: 'trial-ending',
          level: 'warning',
          title: trialDaysLeft === 0 ? 'Trial ends today' : `Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}`,
          detail: 'Review your subscription before the trial period ends.',
          target: 'onboarding-billing',
          action: 'View plan',
        }]
      : []),
    ...(subscription?.cancel_at_period_end
      ? [{
          key: 'cancel-scheduled',
          level: 'warning',
          title: 'Subscription cancellation scheduled',
          detail: 'Your access is scheduled to end at the close of the current billing period.',
          target: 'onboarding-billing',
          action: 'Manage plan',
        }]
      : []),
    ...zones
      .filter((zone) => !zone.channel_id)
      .map((zone) => ({
        key: 'zone-' + zone.id,
        level: 'warning',
        title: zone.name + ' has no music assigned',
        detail: 'Choose a LELVINE channel for this zone.',
        target: 'onboarding-sound',
        action: 'Assign music',
      })),
    ...devices
      .filter((device) => device.device_status === 'offline')
      .map((device) => ({
        key: 'offline-' + device.device_id,
        level: 'critical',
        title: device.device_name + ' is offline',
        detail: device.location_name + ' · ' + device.zone_name,
        target: 'onboarding-player',
        action: 'Check player',
      })),
    ...devices
      .filter((device) => device.device_status === 'unpaired')
      .map((device) => ({
        key: 'unpaired-' + device.device_id,
        level: 'warning',
        title: device.device_name + ' is not paired',
        detail: 'Use the pairing code to connect this player.',
        target: 'onboarding-player',
        action: 'Pair player',
      })),
  ]
  const criticalAlertCount = dashboardAlerts.filter((alert) => alert.level === 'critical').length
  const onboardingCoreSteps = [
    {
      key: 'organization',
      label: 'Create organization',
      description: 'Set up your hotel or hospitality brand.',
      done: Boolean(organization),
      target: 'onboarding-organization',
    },
    {
      key: 'location',
      label: 'Add location',
      description: 'Add your first hotel property.',
      done: locations.length > 0,
      target: 'onboarding-spaces',
    },
    {
      key: 'zone',
      label: 'Add zone',
      description: 'Create a guest-facing space such as Lobby or Spa.',
      done: zones.length > 0,
      target: !subscriptionUsable && organization ? 'onboarding-billing' : 'onboarding-spaces',
    },
    {
      key: 'sound',
      label: 'Choose your sound',
      description: 'Assign a LELVINE music channel to a zone.',
      done: hasChannelAssigned,
      target: 'onboarding-sound',
    },
    {
      key: 'player',
      label: 'Pair player',
      description: 'Connect the player that will run music in the space.',
      done: hasPairedPlayer,
      target: 'onboarding-player',
    },
  ]

  const onboardingDoneCount = onboardingCoreSteps.filter((step) => step.done).length
  const onboardingComplete = onboardingDoneCount === onboardingCoreSteps.length
  const onboardingProgress = Math.round((onboardingDoneCount / onboardingCoreSteps.length) * 100)
  const nextOnboardingStep = onboardingCoreSteps.find((step) => !step.done) ?? null

  function goToOnboardingTarget(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function createZone(e: FormEvent) {
    e.preventDefault()
    if (!zoneLocationId || !zoneName.trim()) return

    if (!subscriptionUsable) {
      setDataMsg('Start a trial or activate a subscription before adding zones.')
      return
    }

    if (zoneLimitReached) {
      setDataMsg(
        subscription?.plan === 'essence'
          ? 'Essence includes 1 zone. Use Manage subscription if you want to change plan.'
          : 'Signature includes up to 3 zones. Use Manage subscription if you want to change plan.'
      )
      return
    }

    setDataLoading(true)
    setDataMsg('')

    const { data, error } = await supabase
      .from('zones')
      .insert({ location_id: zoneLocationId, name: zoneName.trim() })
      .select()
      .single()

    if (error) {
      setDataMsg(error.message)
      setDataLoading(false)
      return
    }

    const created = data as Zone
    setZones((current) => [...current, created])
    setScheduleZoneId((current) => current || created.id)
    setZoneName('')
    setDataLoading(false)
  }

  async function assignChannel(zoneId: string, channelId: string) {
    setDataLoading(true)
    setDataMsg('')

    const nextChannelId = channelId || null
    const { error } = await supabase
      .from('zones')
      .update({ channel_id: nextChannelId })
      .eq('id', zoneId)

    if (error) {
      setDataMsg(error.message)
      setDataLoading(false)
      return
    }

    await loadHotelData()
  }

  async function createSchedule(e: FormEvent) {
    e.preventDefault()
    if (!scheduleZoneId || !scheduleChannelId || scheduleDays.length === 0) return

    if (!advancedSchedulingEnabled) {
      setDataMsg('Advanced scheduling is available on Signature and Premium.')
      return
    }

    setDataLoading(true)
    setDataMsg('')

    const { error } = await supabase
      .from('zone_schedules')
      .insert({
        zone_id: scheduleZoneId,
        channel_id: scheduleChannelId,
        name: scheduleName.trim() || null,
        days_of_week: [...scheduleDays].sort((a, b) => a - b),
        start_time: scheduleStart,
        end_time: scheduleEnd,
        active: true,
      })

    if (error) {
      setDataMsg(error.message)
      setDataLoading(false)
      return
    }

    setScheduleName('')
    await loadHotelData()
  }

  async function deleteSchedule(id: string) {
    setDataLoading(true)
    setDataMsg('')

    const { error } = await supabase
      .from('zone_schedules')
      .delete()
      .eq('id', id)

    if (error) {
      setDataMsg(error.message)
      setDataLoading(false)
      return
    }

    await loadHotelData()
  }

  function toggleDay(day: number) {
    setScheduleDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day]
    )
  }

  async function createDevice(e: FormEvent) {
    e.preventDefault()
    if (!deviceZoneId || !deviceName.trim()) return

    setDataLoading(true)
    setDataMsg('')

    const { error } = await supabase.rpc('create_player_device', {
      p_zone_id: deviceZoneId,
      p_name: deviceName.trim(),
    })

    if (error) {
      setDataMsg(error.message)
      setDataLoading(false)
      return
    }

    setDeviceName('')
    await loadHotelData()
  }

  async function queueDeviceCommand(deviceId: string, commandType: string) {
    setDataLoading(true)
    setDataMsg('')

    const { error } = await supabase.rpc('queue_player_command', {
      p_device_id: deviceId,
      p_command_type: commandType,
      p_payload: {},
    })

    if (error) setDataMsg(error.message)
    else setDataMsg('Command queued: ' + commandType)

    setDataLoading(false)
  }

  async function refreshPairingCode(deviceId: string) {
    setDataLoading(true)
    setDataMsg('')

    const { error } = await supabase.rpc('refresh_player_pairing_code', {
      p_device_id: deviceId,
    })

    if (error) {
      setDataMsg(error.message)
      setDataLoading(false)
      return
    }

    await loadHotelData()
  }

  async function setDeviceVolume(deviceId: string, volume: number) {
    setDataLoading(true)
    setDataMsg('')

    const { error } = await supabase.rpc('set_player_volume', {
      p_device_id: deviceId,
      p_volume: volume,
    })

    if (error) {
      setDataMsg(error.message)
      setDataLoading(false)
      return
    }

    await loadHotelData()
  }

  async function playTrack(track: Track) {
    setDataMsg('')

    if (track.audio_url) {
      setNowPlaying(track)
      setAudioUrl(track.audio_url)
      return
    }

    if (!track.storage_path) {
      setDataMsg('This track is in the catalog, but no audio file has been uploaded yet.')
      return
    }

    const { data, error } = await supabase.storage
      .from('music')
      .createSignedUrl(track.storage_path, 3600)

    if (error || !data?.signedUrl) {
      setDataMsg(error?.message ?? 'Could not create audio link.')
      return
    }

    setNowPlaying(track)
    setAudioUrl(data.signedUrl)
  }

  async function openCustomerPortal() {
    if (!session || !organization) {
      setDataMsg('No organization found.')
      return
    }

    setCheckoutLoading('portal')
    setDataMsg('')

    try {
      const response = await fetch(
        'https://lelvine-api-git.mateusz-bartchodzie101.workers.dev/create-portal-session',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            organization_id: organization.id,
          }),
        }
      )

      const result = await response.json() as { url?: string; error?: string }

      if (!response.ok || !result.url) {
        throw new Error(result.error || 'Could not open subscription settings.')
      }

      window.location.href = result.url
    } catch (error) {
      setDataMsg(error instanceof Error ? error.message : 'Could not open subscription settings.')
      setCheckoutLoading(null)
    }
  }

  async function startCheckout(plan: 'essence' | 'signature' | 'premium') {
    if (!session || !organization) {
      setDataMsg('Create your organization before starting a subscription.')
      return
    }

    setCheckoutLoading(plan)
    setDataMsg('')

    try {
      const response = await fetch(
        'https://lelvine-api-git.mateusz-bartchodzie101.workers.dev/create-checkout-session',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            plan,
            organization_id: organization.id,
          }),
        }
      )

      const result = await response.json() as { url?: string; error?: string; details?: string }

      if (!response.ok || !result.url) {
        throw new Error(result.details || result.error || 'Could not start checkout.')
      }

      window.location.href = result.url
    } catch (error) {
      setDataMsg(error instanceof Error ? error.message : 'Could not start checkout.')
      setCheckoutLoading(null)
    }
  }

  const channelsById = useMemo(() => {
    const map: Record<string, Channel> = {}
    for (const channel of channels) map[channel.id] = channel
    return map
  }, [channels])

  const zonesById = useMemo(() => {
    const map: Record<string, Zone> = {}
    for (const zone of zones) map[zone.id] = zone
    return map
  }, [zones])

  const overviewByZone = useMemo(() => {
    const map: Record<string, ZoneOverview> = {}
    for (const item of zoneOverview) map[item.zone_id] = item
    return map
  }, [zoneOverview])

  const zonesByLocation = useMemo(() => {
    const map: Record<string, Zone[]> = {}
    for (const zone of zones) {
      if (!map[zone.location_id]) map[zone.location_id] = []
      map[zone.location_id].push(zone)
    }
    return map
  }, [zones])

  const tracksByChannel = useMemo(() => {
    const map: Record<string, Track[]> = {}
    for (const track of tracks) {
      if (!map[track.channel_id]) map[track.channel_id] = []
      map[track.channel_id].push(track)
    }
    return map
  }, [tracks])

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) ?? channels[0]
  const selectedTracks = selectedChannel ? (tracksByChannel[selectedChannel.id] ?? []) : []

  if (authLoading && !session) return <main className="loading">LELVINE</main>

  const filteredAdminCustomers = (adminSummary?.customers ?? []).filter((customer) => {
    const search = adminCustomerSearch.trim().toLowerCase()
    const matchesSearch = !search || customer.name.toLowerCase().includes(search)
    const matchesPlan =
      adminPlanFilter === 'all' ||
      (adminPlanFilter === 'none' && !customer.subscription?.plan) ||
      customer.subscription?.plan === adminPlanFilter
    const matchesStatus =
      adminStatusFilter === 'all' ||
      (adminStatusFilter === 'none' && !customer.subscription?.status) ||
      customer.subscription?.status === adminStatusFilter
    const matchesPlayer =
      adminPlayerFilter === 'all' ||
      (adminPlayerFilter === 'online' && customer.online_devices > 0) ||
      (adminPlayerFilter === 'offline' && customer.offline_devices > 0) ||
      (adminPlayerFilter === 'unpaired' && customer.unpaired_devices > 0) ||
      (adminPlayerFilter === 'none' && customer.devices === 0)

    return matchesSearch && matchesPlan && matchesStatus && matchesPlayer
  })

  const filteredAdminDevices = (adminSummary?.devices ?? []).filter((device) => {
    const search = adminDeviceSearch.trim().toLowerCase()
    if (!search) return true

    return [
      device.device_name,
      device.organization_name,
      device.location_name,
      device.zone_name,
      device.current_channel_name ?? '',
      device.device_status,
    ].some((value) => value.toLowerCase().includes(search))
  })

  const filteredAdminHealth = (adminHealth?.alerts ?? []).filter((alert) => {
    const matchesPriority = adminHealthPriority === 'all' || alert.priority === adminHealthPriority
    const matchesKind = adminHealthKind === 'all' || alert.kind === adminHealthKind
    return matchesPriority && matchesKind
  })

  const filteredAdminActivity = (adminActivity?.events ?? []).filter((event) => {
    const search = adminActivitySearch.trim().toLowerCase()
    const matchesSearch =
      !search ||
      event.title.toLowerCase().includes(search) ||
      event.detail.toLowerCase().includes(search)
    const matchesType = adminActivityType === 'all' || event.type === adminActivityType
    return matchesSearch && matchesType
  })

  const selectedAdminCustomer =
    adminSummary?.customers.find((customer) => customer.id === selectedAdminCustomerId) ?? null
  const selectedAdminDevices =
    selectedAdminCustomer && adminSummary
      ? adminSummary.devices.filter((device) => device.organization_id === selectedAdminCustomer.id)
      : []

  if (session && isAdminPath) {
    return (
      <main className="admin-shell">
        <header className="admin-header">
          <div className="brand">LELVINE<span>PLATFORM ADMIN</span></div>
          <div className="admin-header-actions">
            <button onClick={() => { window.location.href = '/' }}>Client dashboard</button>
            <div className="header-actions">
            {session.user.email?.toLowerCase() === 'contact@lelvine.com' && (
              <button onClick={() => { window.location.href = '/admin' }}>Admin</button>
            )}
            <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
          </div>
        </header>

        <section className="admin-hero">
          <div>
            <div className="eyebrow">LELVINE Operations</div>
            <h1>Platform overview</h1>
            <p>Customers, subscriptions and playback network in one place.</p>
          </div>
          <button className="billing-manage" onClick={() => void loadAdminSummary()} disabled={adminLoading}>
            {adminLoading ? 'Refreshing…' : 'Refresh data'}
          </button>
        </section>

        {adminLoading && !adminSummary && <div className="admin-loading">Loading platform data…</div>}

        {adminError && (
          <section className="admin-access-error">
            <strong>Admin access unavailable</strong>
            <p>{adminError}</p>
            <small>
              This page is protected by the LELVINE API. Only configured platform administrators can access customer data.
            </small>
          </section>
        )}

        {adminSummary && (
          <>
            <section className="admin-metrics">
              <article><span>Customers</span><strong>{adminSummary.metrics.organizations}</strong><small>Organizations</small></article>
              <article><span>Subscriptions</span><strong>{adminSummary.metrics.active_subscriptions}</strong><small>{adminSummary.metrics.trialing} trialing</small></article>
              <article><span>Est. MRR</span><strong>€{adminSummary.metrics.mrr_eur}</strong><small>Based on active test plans</small></article>
              <article><span>Players online</span><strong>{adminSummary.metrics.online_devices}/{adminSummary.metrics.devices}</strong><small>{adminSummary.metrics.offline_devices} offline · {adminSummary.metrics.unpaired_devices} unpaired</small></article>
            </section>

            <section className="admin-section admin-music-library" id="admin-music-library">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Content Library</div>
                  <h2>Music admin</h2>
                </div>
                <div className="admin-music-head-actions">
                  <select
                    value={adminMusicChannelFilter}
                    onChange={(e) => setAdminMusicChannelFilter(e.target.value)}
                  >
                    <option value="all">All channels</option>
                    {(adminMusic?.channels ?? []).map((channel) => (
                      <option key={channel.id} value={channel.id}>{channel.name}</option>
                    ))}
                  </select>
                  <button onClick={() => void loadAdminMusic()} disabled={adminMusicLoading}>
                    {adminMusicLoading ? 'Refreshing…' : 'Refresh library'}
                  </button>
                </div>
              </div>

              {adminMusicMsg && <div className="data-message">{adminMusicMsg}</div>}

              <div className="admin-music-layout">
                <div className="admin-music-panel">
                  <div className="admin-music-panel-head">
                    <div>
                      <span>Channels</span>
                      <strong>{adminMusic?.channels.length ?? 0}</strong>
                    </div>
                  </div>

                  <form className="admin-music-form compact" onSubmit={createAdminChannel}>
                    <input
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder="Channel name"
                      required
                    />
                    <input
                      value={newChannelMood}
                      onChange={(e) => setNewChannelMood(e.target.value)}
                      placeholder="Mood / positioning"
                    />
                    <button disabled={adminMusicLoading}>Add channel</button>
                  </form>

                  <div className="admin-channel-list">
                    {(adminMusic?.channels ?? []).map((channel) => (
                      <div className="admin-channel-row" key={channel.id}>
                        <div>
                          <strong>{channel.name}</strong>
                          <small>{channel.mood ?? channel.slug}</small>
                        </div>
                        <button
                          className={channel.active ? 'toggle-active on' : 'toggle-active'}
                          onClick={() => void patchAdminMusic('channel', channel.id, { active: !channel.active })}
                          disabled={adminMusicLoading}
                        >
                          {channel.active ? 'Active' : 'Hidden'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-music-panel wide">
                  <div className="admin-music-panel-head">
                    <div>
                      <span>Tracks</span>
                      <strong>{adminMusic?.tracks.length ?? 0}</strong>
                    </div>
                    <small>
                      {(adminMusic?.tracks ?? []).filter((track) => Boolean(track.audio_url || track.storage_path)).length} with audio
                    </small>
                  </div>

                  <form className="admin-track-form" onSubmit={createAdminTrack}>
                    <select
                      value={newTrack.channel_id}
                      onChange={(e) => setNewTrack((current) => ({ ...current, channel_id: e.target.value }))}
                      required
                    >
                      <option value="">Choose channel</option>
                      {(adminMusic?.channels ?? []).filter((channel) => channel.active).map((channel) => (
                        <option key={channel.id} value={channel.id}>{channel.name}</option>
                      ))}
                    </select>
                    <input
                      value={newTrack.title}
                      onChange={(e) => setNewTrack((current) => ({ ...current, title: e.target.value }))}
                      placeholder="Track title"
                      required
                    />
                    <input
                      value={newTrack.track_code}
                      onChange={(e) => setNewTrack((current) => ({ ...current, track_code: e.target.value }))}
                      placeholder="Code e.g. LS-051"
                    />
                    <input
                      value={newTrack.bpm}
                      onChange={(e) => setNewTrack((current) => ({ ...current, bpm: e.target.value }))}
                      placeholder="BPM"
                      inputMode="numeric"
                    />
                    <input
                      value={newTrack.musical_key}
                      onChange={(e) => setNewTrack((current) => ({ ...current, musical_key: e.target.value }))}
                      placeholder="Key"
                    />
                    <input
                      value={newTrack.sort_order}
                      onChange={(e) => setNewTrack((current) => ({ ...current, sort_order: e.target.value }))}
                      placeholder="Order"
                      inputMode="numeric"
                    />
                    <input
                      className="span-two"
                      value={newTrack.audio_url}
                      onChange={(e) => setNewTrack((current) => ({ ...current, audio_url: e.target.value }))}
                      placeholder="Audio URL (optional for now)"
                    />
                    <input
                      className="span-two"
                      value={newTrack.storage_path}
                      onChange={(e) => setNewTrack((current) => ({ ...current, storage_path: e.target.value }))}
                      placeholder="Supabase storage path (optional)"
                    />
                    <button disabled={adminMusicLoading}>Add track</button>
                  </form>

                  <div className="admin-track-list">
                    {(adminMusic?.tracks ?? [])
                      .filter((track) => adminMusicChannelFilter === 'all' || track.channel_id === adminMusicChannelFilter)
                      .map((track) => {
                        const channel = adminMusic?.channels.find((item) => item.id === track.channel_id)
                        const playable = Boolean(track.audio_url || track.storage_path)
                        return (
                          <div className="admin-track-row" key={track.id}>
                            <div className="admin-track-main">
                              <span className={playable ? 'audio-dot ready' : 'audio-dot'}></span>
                              <div>
                                <strong>{track.title}</strong>
                                <small>
                                  {(track.track_code ?? 'No code') + ' · ' + (channel?.name ?? 'Unknown channel')}
                                  {track.bpm ? ' · ' + track.bpm + ' BPM' : ''}
                                  {track.musical_key ? ' · ' + track.musical_key : ''}
                                </small>
                              </div>
                            </div>
                            <div className="admin-track-actions">
                              <span>{playable ? 'Audio ready' : 'No audio yet'}</span>
                              <label className="admin-upload-audio">
                                <input
                                  type="file"
                                  accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*"
                                  disabled={adminUploadTrackId !== null}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    e.currentTarget.value = ''
                                    if (file) void uploadAdminTrackAudio(track.id, file)
                                  }}
                                />
                                <span>
                                  {adminUploadTrackId === track.id
                                    ? 'Uploading…'
                                    : playable
                                      ? 'Replace file'
                                      : 'Upload audio'}
                                </span>
                              </label>
                              <button
                                onClick={() => {
                                  const next = window.prompt(
                                    'Audio URL or Supabase storage path. Leave blank to keep current value.',
                                    track.audio_url || track.storage_path || ''
                                  )
                                  if (next === null || !next.trim()) return
                                  const value = next.trim()
                                  void patchAdminMusic(
                                    'track',
                                    track.id,
                                    value.startsWith('http')
                                      ? { audio_url: value, storage_path: null }
                                      : { storage_path: value, audio_url: null }
                                  )
                                }}
                              >
                                Set audio
                              </button>
                              <button
                                className={track.active !== false ? 'toggle-active on' : 'toggle-active'}
                                onClick={() => void patchAdminMusic('track', track.id, { active: track.active === false })}
                                disabled={adminMusicLoading}
                              >
                                {track.active === false ? 'Hidden' : 'Active'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>
            </section>

            <section className="admin-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Customers</div>
                  <h2>Hotels & organizations</h2>
                </div>
                <p>{adminSummary.customers.length} total organizations</p>
              </div>

              <div className="admin-customer-filters">
                <input
                  value={adminCustomerSearch}
                  onChange={(e) => setAdminCustomerSearch(e.target.value)}
                  placeholder="Search hotel / organization"
                />
                <select value={adminPlanFilter} onChange={(e) => setAdminPlanFilter(e.target.value)}>
                  <option value="all">All plans</option>
                  <option value="essence">Essence</option>
                  <option value="signature">Signature</option>
                  <option value="premium">Premium</option>
                  <option value="none">No plan</option>
                </select>
                <select value={adminStatusFilter} onChange={(e) => setAdminStatusFilter(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past due</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="canceled">Canceled</option>
                  <option value="none">No subscription</option>
                </select>
                <select value={adminPlayerFilter} onChange={(e) => setAdminPlayerFilter(e.target.value)}>
                  <option value="all">All player states</option>
                  <option value="online">Has online player</option>
                  <option value="offline">Has offline player</option>
                  <option value="unpaired">Has unpaired player</option>
                  <option value="none">No players</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setAdminCustomerSearch('')
                    setAdminPlanFilter('all')
                    setAdminStatusFilter('all')
                    setAdminPlayerFilter('all')
                  }}
                >
                  Clear
                </button>
              </div>

              <div className="admin-filter-count">
                Showing {filteredAdminCustomers.length} of {adminSummary.customers.length}
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Organization</th>
                      <th>Plan</th>
                      <th>Status</th>
                      <th>Locations</th>
                      <th>Zones</th>
                      <th>Players</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminCustomers.map((customer) => (
                      <tr
                        key={customer.id}
                        className="admin-customer-row"
                        onClick={() => setSelectedAdminCustomerId(customer.id)}
                      >
                        <td><strong>{customer.name}</strong></td>
                        <td className="admin-plan">{customer.subscription?.plan ?? '—'}</td>
                        <td>
                          <span className={'admin-status ' + (customer.subscription?.status ?? 'none')}>
                            {customer.subscription?.status ?? 'no plan'}
                          </span>
                        </td>
                        <td>{customer.locations}</td>
                        <td>{customer.zones}</td>
                        <td>
                          {customer.devices}
                          <small className="admin-device-detail">
                            {customer.online_devices} online
                            {customer.offline_devices > 0 ? ' · ' + customer.offline_devices + ' offline' : ''}
                            {customer.unpaired_devices > 0 ? ' · ' + customer.unpaired_devices + ' unpaired' : ''}
                          </small>
                        </td>
                        <td>{new Date(customer.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {selectedAdminCustomer && (
              <section className="admin-customer-detail">
                <div className="admin-customer-detail-head">
                  <div>
                    <div className="eyebrow">Customer detail</div>
                    <h2>{selectedAdminCustomer.name}</h2>
                    <p>Organization ID: {selectedAdminCustomer.id}</p>
                  </div>
                  <div className="admin-customer-detail-actions">
                    <button
                      onClick={() => void openAdminCustomerPortal(selectedAdminCustomer.id)}
                      disabled={adminActionLoading !== null || !selectedAdminCustomer.subscription}
                    >
                      {adminActionLoading === 'portal' ? 'Opening…' : 'Open billing portal'}
                    </button>
                    <button onClick={() => void loadAdminSummary()} disabled={adminLoading}>
                      Refresh
                    </button>
                    <button
                      onClick={() => document.getElementById('admin-player-health')?.scrollIntoView({ behavior: 'smooth' })}
                    >
                      View players
                    </button>
                                      <button onClick={() => setSelectedAdminCustomerId(null)}>Close</button>
                  </div>
                </div>

                <div className="admin-customer-detail-grid">
                  <article>
                    <span>Plan</span>
                    <strong>{selectedAdminCustomer.subscription?.plan ?? 'No plan'}</strong>
                    <small>{selectedAdminCustomer.subscription?.status ?? 'No subscription'}</small>
                  </article>
                  <article>
                    <span>Locations</span>
                    <strong>{selectedAdminCustomer.locations}</strong>
                    <small>Properties</small>
                  </article>
                  <article>
                    <span>Zones</span>
                    <strong>{selectedAdminCustomer.zones}</strong>
                    <small>Configured spaces</small>
                  </article>
                  <article>
                    <span>Players</span>
                    <strong>{selectedAdminCustomer.devices}</strong>
                    <small>{selectedAdminCustomer.online_devices} online</small>
                  </article>
                </div>

                <div className="admin-customer-subscription">
                  <div><span>Status</span><strong>{selectedAdminCustomer.subscription?.status ?? '—'}</strong></div>
                  <div><span>Trial ends</span><strong>{selectedAdminCustomer.subscription?.trial_end ? new Date(selectedAdminCustomer.subscription.trial_end).toLocaleDateString() : '—'}</strong></div>
                  <div><span>Period ends</span><strong>{selectedAdminCustomer.subscription?.current_period_end ? new Date(selectedAdminCustomer.subscription.current_period_end).toLocaleDateString() : '—'}</strong></div>
                  <div><span>Cancel scheduled</span><strong>{selectedAdminCustomer.subscription?.cancel_at_period_end ? 'Yes' : 'No'}</strong></div>
                </div>

                <div className="admin-customer-alerts">
                  <div className="admin-customer-players-head">
                    <strong>Attention</strong>
                    <span>
                      {selectedAdminCustomer.offline_devices + selectedAdminCustomer.unpaired_devices +
                        (selectedAdminCustomer.subscription ? 0 : 1)} alerts
                    </span>
                  </div>

                  {!selectedAdminCustomer.subscription && (
                    <div className="admin-customer-alert warning">No active subscription is connected to this organization.</div>
                  )}
                  {selectedAdminCustomer.offline_devices > 0 && (
                    <div className="admin-customer-alert critical">
                      {selectedAdminCustomer.offline_devices} player{selectedAdminCustomer.offline_devices === 1 ? '' : 's'} offline.
                    </div>
                  )}
                  {selectedAdminCustomer.unpaired_devices > 0 && (
                    <div className="admin-customer-alert warning">
                      {selectedAdminCustomer.unpaired_devices} player{selectedAdminCustomer.unpaired_devices === 1 ? '' : 's'} not paired.
                    </div>
                  )}
                  {selectedAdminCustomer.subscription &&
                    selectedAdminCustomer.offline_devices === 0 &&
                    selectedAdminCustomer.unpaired_devices === 0 && (
                      <div className="admin-customer-alert clear">No active operational alerts for this customer.</div>
                    )}
                </div>

                <div className="admin-customer-players">
                  <div className="admin-customer-players-head">
                    <strong>Players</strong>
                    <span>{selectedAdminDevices.length} devices</span>
                  </div>

                  {selectedAdminDevices.length === 0 ? (
                    <div className="empty-state">This customer has no player devices yet.</div>
                  ) : (
                    selectedAdminDevices.map((device) => (
                      <div className="admin-customer-player-row" key={device.device_id}>
                        <div>
                          <span className={'status-dot ' + device.device_status}></span>
                          <strong>{device.device_name}</strong>
                          <small>{device.location_name} · {device.zone_name}</small>
                        </div>
                        <div>
                          <span>{device.current_channel_name ?? 'No channel'}</span>
                          <strong>{device.device_status}</strong>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            <section className="admin-section admin-health-monitor" id="admin-health-monitor">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Health Monitoring</div>
                  <h2>Admin alerts</h2>
                  <p>Current player, playback and billing issues that need attention.</p>
                </div>
                <button onClick={() => void loadAdminHealth()} disabled={adminHealthLoading}>
                  {adminHealthLoading ? 'Refreshing…' : 'Refresh health'}
                </button>
              </div>

              <div className="admin-health-metrics">
                <article className="critical"><span>Critical</span><strong>{adminHealth?.counts.critical ?? 0}</strong></article>
                <article className="high"><span>High</span><strong>{adminHealth?.counts.high ?? 0}</strong></article>
                <article className="medium"><span>Medium</span><strong>{adminHealth?.counts.medium ?? 0}</strong></article>
                <article><span>Total alerts</span><strong>{adminHealth?.counts.total ?? 0}</strong></article>
              </div>

              <div className="admin-health-filters">
                <select value={adminHealthPriority} onChange={(e) => setAdminHealthPriority(e.target.value)}>
                  <option value="all">All priorities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select value={adminHealthKind} onChange={(e) => setAdminHealthKind(e.target.value)}>
                  <option value="all">All types</option>
                  <option value="player">Players</option>
                  <option value="playback">Playback</option>
                  <option value="billing">Billing</option>
                </select>
                <span>{filteredAdminHealth.length} visible</span>
              </div>

              <div className="admin-health-list">
                {filteredAdminHealth.length === 0 ? (
                  <div className="admin-health-clear">
                    <strong>No active issues</strong>
                    <span>Platform health currently looks good.</span>
                  </div>
                ) : (
                  filteredAdminHealth.map((alert) => (
                    <article className={'admin-health-alert ' + alert.priority} key={alert.id}>
                      <div className="admin-health-priority">{alert.priority}</div>
                      <div className="admin-health-copy">
                        <strong>{alert.title}</strong>
                        <span>{alert.detail}</span>
                      </div>
                      <div className="admin-health-meta">
                        <span>{alert.kind}</span>
                        <time>{new Date(alert.created_at).toLocaleString()}</time>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="admin-section admin-activity-log" id="admin-activity-log">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">System Events</div>
                  <h2>Activity log</h2>
                  <p>{adminActivity?.persistent ? 'Persistent audit enabled' : 'Derived activity feed'}</p>
                </div>
                <div className="admin-activity-actions">
                  <select value={adminActivityType} onChange={(e) => setAdminActivityType(e.target.value)}>
                    <option value="all">All events</option>
                    <option value="player">Players</option>
                    <option value="subscription">Subscriptions</option>
                    <option value="music">Music</option>
                    <option value="error">Errors</option>
                  </select>
                  <button onClick={() => void loadAdminActivity()} disabled={adminActivityLoading}>
                    {adminActivityLoading ? 'Refreshing…' : 'Refresh log'}
                  </button>
                </div>
              </div>

              <div className="admin-activity-search">
                <input
                  value={adminActivitySearch}
                  onChange={(e) => setAdminActivitySearch(e.target.value)}
                  placeholder="Search events"
                />
                <span>{filteredAdminActivity.length} events</span>
              </div>

              <div className="admin-activity-list">
                {filteredAdminActivity.length === 0 ? (
                  <div className="empty-state">No matching system events.</div>
                ) : (
                  filteredAdminActivity.slice(0, 150).map((event) => (
                    <article className={'admin-activity-row ' + event.severity} key={event.id}>
                      <div className="admin-activity-indicator"></div>
                      <div className="admin-activity-copy">
                        <div>
                          <strong>{event.title}</strong>
                          <span>{event.type}</span>
                        </div>
                        <p>{event.detail || 'No additional details'}</p>
                        {(event.actor_email || event.source) && (
                          <small>
                            {event.actor_email ? 'Actor: ' + event.actor_email : ''}
                            {event.actor_email && event.source ? ' · ' : ''}
                            {event.source ? 'Source: ' + event.source : ''}
                          </small>
                        )}
                      </div>
                      <time>{new Date(event.created_at).toLocaleString()}</time>
                    </article>
                  ))
                )}
              </div>

              <p className="admin-activity-note">
                {adminActivity?.persistent
                  ? 'Persistent audit history is active. New player, subscription and music changes are stored as individual events.'
                  : 'Persistent audit table is not active yet, so this view is temporarily derived from current system timestamps.'}
              </p>
            </section>

            <section id="admin-player-health" className="admin-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Playback Network</div>
                  <h2>Player health</h2>
                </div>
                <p>Live status from connected hotel players.</p>
              </div>

              <div className="admin-player-search">
                <input
                  value={adminDeviceSearch}
                  onChange={(e) => setAdminDeviceSearch(e.target.value)}
                  placeholder="Search player, hotel, location, zone or channel"
                />
                <span>{filteredAdminDevices.length} of {adminSummary.devices.length} players</span>
              </div>

              <div className="admin-device-grid">
                {filteredAdminDevices.length === 0 ? (
                  <div className="empty-state">No player devices have been created yet.</div>
                ) : (
                  filteredAdminDevices.map((device) => (
                    <article className="admin-device-card" key={device.device_id}>
                      <div className="admin-device-top">
                        <div>
                          <span className={'status-dot ' + device.device_status}></span>
                          <strong>{device.device_name}</strong>
                        </div>
                        <span>{device.device_status}</span>
                      </div>
                      <h3>{device.organization_name}</h3>
                      <p>{device.location_name} · {device.zone_name}</p>
                      <div className="admin-device-meta">
                        <div><span>Playback</span><strong>{device.playback_state}</strong></div>
                        <div><span>Channel</span><strong>{device.current_channel_name ?? '—'}</strong></div>
                        <div><span>Last seen</span><strong>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Never'}</strong></div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <div className="admin-generated">
              Last refreshed {new Date(adminSummary.generated_at).toLocaleString()}
            </div>
          </>
        )}
      </main>
    )
  }

  if (session) {
    return (
      <main className="dash">
        <header>
          <div className="brand">LELVINE<span>HOSPITALITY PLATFORM</span></div>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </header>

        <nav className="dashboard-nav" aria-label="Dashboard sections">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Overview</button>
          <button onClick={() => goToOnboardingTarget('onboarding-spaces')}>Spaces</button>
          <button onClick={() => goToOnboardingTarget('onboarding-player')}>Devices</button>
          <button onClick={() => goToOnboardingTarget('dashboard-schedule')}>Schedule</button>
          <button onClick={() => goToOnboardingTarget('dashboard-music')}>Music</button>
          <button onClick={() => goToOnboardingTarget('onboarding-billing')}>Plan</button>
          <a href="https://player.lelvine.com" target="_blank" rel="noreferrer">Open Player ↗</a>
        </nav>

        <section className="welcome">
          <div className="eyebrow">Dashboard</div>
          <h1>{organization ? organization.name : 'Welcome to LELVINE.'}</h1>
          <p>{session.user.email}</p>
        </section>

        <section className="overview-dashboard">
          <div className="overview-head">
            <div>
              <div className="eyebrow">Live overview</div>
              <h2>Property status</h2>
            </div>
            <div className={systemHealthy ? 'system-health healthy' : 'system-health attention'}>
              <span></span>
              {systemHealthy ? 'All systems ready' : 'Setup needs attention'}
            </div>
          </div>

          <div className="overview-metrics">
            <article>
              <span>Plan</span>
              <strong>{subscription?.plan ?? 'No plan'}</strong>
              <small>{subscription?.status ?? 'Choose a plan to activate playback'}</small>
            </article>
            <article>
              <span>Zones configured</span>
              <strong>{configuredZones}/{zones.length}</strong>
              <small>{zones.length === 0 ? 'No zones yet' : configuredZones === zones.length ? 'All zones have sound' : 'Assign music to remaining zones'}</small>
            </article>
            <article>
              <span>Players online</span>
              <strong>{onlineDevices}/{devices.length}</strong>
              <small>{attentionDevices > 0 ? attentionDevices + ' need attention' : devices.length > 0 ? 'All connected players healthy' : 'No players paired yet'}</small>
            </article>
            <article>
              <span>Playing now</span>
              <strong>{playingDevices}</strong>
              <small>{playingDevices > 0 ? 'Active playback sessions' : 'No active playback reported'}</small>
            </article>
          </div>

          <div className="overview-zones">
            <div className="overview-zones-head">
              <div>
                <span>Current sound</span>
                <strong>Zones</strong>
              </div>
              <button onClick={() => goToOnboardingTarget('onboarding-sound')}>Manage spaces</button>
            </div>

            {zones.length === 0 ? (
              <div className="overview-empty">Add your first zone to see live sound status here.</div>
            ) : (
              <div className="overview-zone-list">
                {zones.slice(0, 6).map((zone) => {
                  const current = overviewByZone[zone.id]
                  const zoneDevice = devices.find((device) => device.zone_id === zone.id)
                  return (
                    <div className="overview-zone-row" key={zone.id}>
                      <div>
                        <strong>{zone.name}</strong>
                        <span>{current?.current_channel_name ?? current?.default_channel_name ?? 'No channel assigned'}</span>
                      </div>
                      <div className="overview-zone-state">
                        <span className={'status-dot ' + (zoneDevice?.device_status ?? 'unpaired')}></span>
                        <span>{zoneDevice ? zoneDevice.device_status : 'no player'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <section className={dashboardAlerts.length > 0 ? 'alerts-panel has-alerts' : 'alerts-panel clear'}>
          <div className="alerts-head">
            <div>
              <div className="eyebrow">Alerts</div>
              <h2>{dashboardAlerts.length > 0 ? 'Needs attention' : 'Everything looks good'}</h2>
            </div>
            <div className={criticalAlertCount > 0 ? 'alerts-count critical' : 'alerts-count'}>
              {dashboardAlerts.length}
            </div>
          </div>

          {dashboardAlerts.length === 0 ? (
            <div className="alerts-clear-message">
              <span>✓</span>
              <div>
                <strong>No active alerts</strong>
                <p>Your plan, zones and connected players do not currently need attention.</p>
              </div>
            </div>
          ) : (
            <div className="alerts-list">
              {dashboardAlerts.slice(0, 8).map((alert) => (
                <article className={'alert-row ' + alert.level} key={alert.key}>
                  <span className="alert-indicator"></span>
                  <div className="alert-copy">
                    <strong>{alert.title}</strong>
                    <span>{alert.detail}</span>
                  </div>
                  <button onClick={() => goToOnboardingTarget(alert.target)}>
                    {alert.action}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={onboardingComplete ? 'onboarding-card complete' : 'onboarding-card'}>
          <div className="onboarding-head">
            <div>
              <div className="eyebrow">Getting started</div>
              <h2>{onboardingComplete ? 'Your LELVINE setup is ready.' : 'Set up your first space.'}</h2>
              <p>
                {onboardingComplete
                  ? 'Your organization, space, sound and player are connected.'
                  : 'Follow these steps to go from account to music running in your hotel.'}
              </p>
            </div>
            <div className="onboarding-progress-number">{onboardingProgress}%</div>
          </div>

          <div className="onboarding-progress-track">
            <span style={{ width: onboardingProgress + '%' }} />
          </div>

          <div className="onboarding-steps">
            {onboardingCoreSteps.map((step, index) => (
              <button
                type="button"
                key={step.key}
                className={step.done ? 'onboarding-step done' : nextOnboardingStep?.key === step.key ? 'onboarding-step current' : 'onboarding-step'}
                onClick={() => goToOnboardingTarget(step.target)}
              >
                <span className="onboarding-step-number">{step.done ? '✓' : index + 1}</span>
                <span className="onboarding-step-copy">
                  <strong>{step.label}</strong>
                  <small>{step.description}</small>
                </span>
              </button>
            ))}

            <div className={onboardingComplete ? 'onboarding-step ready done' : 'onboarding-step ready'}>
              <span className="onboarding-step-number">{onboardingComplete ? '✓' : 6}</span>
              <span className="onboarding-step-copy">
                <strong>Ready</strong>
                <small>Music is configured for your first space.</small>
              </span>
            </div>
          </div>

          {!onboardingComplete && nextOnboardingStep && (
            <div className="onboarding-next">
              <div>
                <span>Next step</span>
                <strong>
                  {nextOnboardingStep.key === 'zone' && !subscriptionUsable
                    ? 'Choose a plan before adding your first zone'
                    : nextOnboardingStep.label}
                </strong>
              </div>
              <button
                className="primary"
                onClick={() => goToOnboardingTarget(nextOnboardingStep.target)}
              >
                {nextOnboardingStep.key === 'zone' && !subscriptionUsable ? 'Choose plan' : 'Continue setup'}
              </button>
            </div>
          )}
        </section>

        {organization && (
          <section id="onboarding-billing" className="billing-panel">
            <div className="billing-head">
              <div>
                <div className="eyebrow">Your Plan</div>
                <h2>{subscription ? (subscription.plan ?? 'LELVINE') : 'Choose your plan'}</h2>
                <p>
                  {subscription
                    ? `${subscription.status}${subscription.trial_end ? ' · trial until ' + new Date(subscription.trial_end).toLocaleDateString() : ''}`
                    : 'Start with a 7-day free trial. Cancel anytime.'}
                </p>
              </div>
              {subscription && (
                <div className="billing-actions">
                  <div className={'subscription-badge ' + subscription.status}>
                    {subscription.status}
                  </div>
                  <button
                    className="billing-manage"
                    onClick={() => void openCustomerPortal()}
                    disabled={checkoutLoading !== null}
                  >
                    {checkoutLoading === 'portal' ? 'Opening…' : 'Manage subscription'}
                  </button>
                </div>
              )}
            </div>

            {subscription && (
              <div className="plan-overview">
                <div className="plan-overview-main">
                  <span className="plan-kicker">Current plan</span>
                  <strong className="plan-name">{subscription.plan ?? 'LELVINE'}</strong>
                  <span className="plan-price">
                    {subscription.plan === 'essence'
                      ? '€49 / month'
                      : subscription.plan === 'signature'
                        ? '€99 / month'
                        : subscription.plan === 'premium'
                          ? '€199 / month'
                          : 'Custom'}
                  </span>
                </div>

                <div className="plan-metrics">
                  <div>
                    <span>Status</span>
                    <strong>{subscription.status}</strong>
                  </div>
                  <div>
                    <span>Zones</span>
                    <strong>{zones.length}/{zoneLimit === Infinity ? '∞' : zoneLimit}</strong>
                  </div>
                  <div>
                    <span>Trial ends</span>
                    <strong>{subscription.trial_end ? new Date(subscription.trial_end).toLocaleDateString() : '—'}</strong>
                  </div>
                  <div>
                    <span>Billing period ends</span>
                    <strong>{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : '—'}</strong>
                  </div>
                </div>

                <div className="plan-features">
                  <div className={subscriptionUsable ? 'plan-feature on' : 'plan-feature off'}>
                    <span>Core music controls</span><strong>{subscriptionUsable ? 'Included' : 'Locked'}</strong>
                  </div>
                  <div className={advancedSchedulingEnabled ? 'plan-feature on' : 'plan-feature off'}>
                    <span>Advanced scheduling</span><strong>{advancedSchedulingEnabled ? 'Included' : 'Not included'}</strong>
                  </div>
                  <div className={regularRefreshesEnabled ? 'plan-feature on' : 'plan-feature off'}>
                    <span>Regular music refreshes</span><strong>{regularRefreshesEnabled ? 'Included' : 'Not included'}</strong>
                  </div>
                  <div className={seasonalUpdatesEnabled ? 'plan-feature on' : 'plan-feature off'}>
                    <span>Seasonal updates</span><strong>{seasonalUpdatesEnabled ? 'Included' : 'Not included'}</strong>
                  </div>
                  <div className={premiumFeaturesEnabled ? 'plan-feature on' : 'plan-feature off'}>
                    <span>Sound Concierge</span><strong>{premiumFeaturesEnabled ? 'Included' : 'Not included'}</strong>
                  </div>
                </div>

                {subscription.cancel_at_period_end && (
                  <div className="plan-cancel-note">
                    Cancellation scheduled for the end of the current billing period.
                  </div>
                )}
              </div>
            )}

            {!subscription && (
              <div className="plan-grid">
                <article className="plan-card">
                  <span>Essence</span>
                  <strong>€49<small>/month</small></strong>
                  <p>1 zone · LELVINE channels · core music controls</p>
                  <button
                    className="primary"
                    onClick={() => void startCheckout('essence')}
                    disabled={checkoutLoading !== null}
                  >
                    {checkoutLoading === 'essence' ? 'Opening…' : 'Start 7-day trial'}
                  </button>
                </article>

                <article className="plan-card featured">
                  <span>Signature</span>
                  <strong>€99<small>/month</small></strong>
                  <p>Up to 3 zones · advanced scheduling · regular refreshes</p>
                  <button
                    className="primary"
                    onClick={() => void startCheckout('signature')}
                    disabled={checkoutLoading !== null}
                  >
                    {checkoutLoading === 'signature' ? 'Opening…' : 'Start 7-day trial'}
                  </button>
                </article>

                <article className="plan-card">
                  <span>Premium</span>
                  <strong>€199<small>/month</small></strong>
                  <p>Multiple zones · seasonal updates · Sound Concierge</p>
                  <button
                    className="primary"
                    onClick={() => void startCheckout('premium')}
                    disabled={checkoutLoading !== null}
                  >
                    {checkoutLoading === 'premium' ? 'Opening…' : 'Start 7-day trial'}
                  </button>
                </article>
              </div>
            )}
          </section>
        )}

        {dataMsg && <div className="data-message">{dataMsg}</div>}

        {!organization ? (
          <section id="onboarding-organization" className="setup-panel">
            <div>
              <div className="eyebrow">Step 01</div>
              <h2>Create your hotel organization</h2>
              <p>This is the main account for your hotel or hospitality brand.</p>
            </div>
            <form onSubmit={createOrganization} className="setup-form">
              <label>Hotel / brand name</label>
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Hotel Aurora" required />
              <button className="primary" disabled={dataLoading}>{dataLoading ? 'Creating…' : 'Create organization'}</button>
            </form>
          </section>
        ) : (
          <>
            <section id="onboarding-spaces" className="workspace-grid">
              <article className="panel">
                <div className="eyebrow">Locations</div>
                <h2>Add location</h2>
                <form onSubmit={createLocation} className="setup-form">
                  <label>Location name</label>
                  <input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Warsaw" required />
                  <div className="two-col">
                    <div>
                      <label>City</label>
                      <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Warsaw" />
                    </div>
                    <div>
                      <label>Country</label>
                      <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Poland" />
                    </div>
                  </div>
                  <button className="primary" disabled={dataLoading}>{dataLoading ? 'Saving…' : 'Add location'}</button>
                </form>
              </article>

              <article className="panel">
                <div className="eyebrow">Zones</div>
                <h2>Add zone</h2>
                {locations.length === 0 ? (
                  <p className="muted">Create a location first.</p>
                ) : (
                  <form onSubmit={createZone} className="setup-form">
                    <label>Location</label>
                    <select value={zoneLocationId} onChange={(e) => setZoneLocationId(e.target.value)} required>
                      {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                    </select>
                    <label>Zone name</label>
                    <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="Lobby" required />
                    <button className="primary" disabled={dataLoading || !subscriptionUsable || zoneLimitReached}>
                      {dataLoading
                        ? 'Saving…'
                        : !subscriptionUsable
                          ? 'Start a plan first'
                          : zoneLimitReached
                            ? 'Zone limit reached'
                            : 'Add zone'}
                    </button>
                  </form>
                )}
              </article>
            </section>

            <section id="onboarding-sound" className="location-list">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Your spaces</div>
                  <h2>Locations & zones</h2>
                </div>
                <button className="refresh" onClick={() => void loadHotelData()} disabled={dataLoading}>Refresh</button>
              </div>

              {locations.length === 0 ? (
                <div className="empty-state">No locations yet. Add your first hotel location above.</div>
              ) : (
                locations.map((location) => (
                  <article className="location-card" key={location.id}>
                    <div className="location-top">
                      <div>
                        <h3>{location.name}</h3>
                        <p>{[location.city, location.country].filter(Boolean).join(', ') || 'Location details not set'}</p>
                      </div>
                      <span>{(zonesByLocation[location.id] ?? []).length} zones</span>
                    </div>

                    <div className="zone-list">
                      {(zonesByLocation[location.id] ?? []).length === 0 ? (
                        <em>No zones yet</em>
                      ) : (
                        (zonesByLocation[location.id] ?? []).map((zone) => {
                          const current = overviewByZone[zone.id]
                          return (
                            <div className="zone-row" key={zone.id}>
                              <div className="zone-name">
                                <strong>{zone.name}</strong>
                                <span>
                                  Now playing: {current?.current_channel_name ?? 'No channel active'}
                                </span>
                              </div>
                              <select
                                className="channel-select"
                                value={zone.channel_id ?? ''}
                                onChange={(e) => void assignChannel(zone.id, e.target.value)}
                                disabled={dataLoading}
                              >
                                <option value="">Default channel</option>
                                {channels.map((channel) => (
                                  <option key={channel.id} value={channel.id}>{channel.name}</option>
                                ))}
                              </select>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </article>
                ))
              )}
            </section>

            <section id="onboarding-player" className="devices-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Playback network</div>
                  <h2>Devices</h2>
                </div>
                <p>Create and manage the player assigned to each hotel zone.</p>
              </div>

              <div className="devices-layout">
                <article className="panel">
                  <form onSubmit={createDevice} className="setup-form">
                    <label>Device name</label>
                    <input
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder="Lobby Player 01"
                      required
                    />

                    <label>Zone</label>
                    <select value={deviceZoneId} onChange={(e) => setDeviceZoneId(e.target.value)} required>
                      <option value="">Select zone</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.name}</option>
                      ))}
                    </select>

                    <button className="primary" disabled={dataLoading || zones.length === 0}>
                      {dataLoading ? 'Creating…' : 'Create player device'}
                    </button>
                  </form>
                </article>

                <div className="device-grid">
                  {devices.length === 0 ? (
                    <div className="empty-state">No player devices yet. Create one for a zone.</div>
                  ) : (
                    devices.map((device) => (
                      <article className="device-card" key={device.device_id}>
                        <div className="device-card-top">
                          <div>
                            <span className={'status-dot ' + device.device_status}></span>
                            <span className="device-status">{device.device_status}</span>
                            <h3>{device.device_name}</h3>
                            <p>{device.location_name} · {device.zone_name}</p>
                          </div>
                          <span className="device-code">{device.device_code}</span>
                        </div>

                        <div className="device-meta">
                          <div><span>Channel</span><strong>{device.current_channel_name ?? 'Not reported'}</strong></div>
                          <div><span>Playback</span><strong>{device.playback_state}</strong></div>
                          <div><span>Volume</span><strong>{device.volume}%</strong></div>
                          <div><span>Last seen</span><strong>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Never'}</strong></div>
                        </div>

                        {device.device_status === 'unpaired' && (
                          <div className="pairing-box">
                            <span>Pairing code</span>
                            <strong>{device.activation_code ?? '—'}</strong>
                            <button onClick={() => void refreshPairingCode(device.device_id)} disabled={dataLoading}>
                              New code
                            </button>
                          </div>
                        )}

                        <div className="volume-control">
                          <span>Volume</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={device.volume}
                            onChange={(e) => void setDeviceVolume(device.device_id, Number(e.target.value))}
                            disabled={dataLoading}
                          />
                        </div>

                        <div className="device-actions">
                          <button onClick={() => void queueDeviceCommand(device.device_id, 'play')} disabled={dataLoading}>Play</button>
                          <button onClick={() => void queueDeviceCommand(device.device_id, 'pause')} disabled={dataLoading}>Pause</button>
                          <button onClick={() => void queueDeviceCommand(device.device_id, 'next')} disabled={dataLoading}>Next</button>
                          <button onClick={() => void queueDeviceCommand(device.device_id, 'sync')} disabled={dataLoading}>Sync</button>
                          <button onClick={() => void queueDeviceCommand(device.device_id, 'restart')} disabled={dataLoading}>Restart</button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section id="dashboard-schedule" className="schedule-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Dayparting</div>
                  <h2>Schedule Editor</h2>
                </div>
                <p>Choose which sound environment should run in each zone at different times of day.</p>
              </div>

              {!advancedSchedulingEnabled ? (
                <div className="feature-lock">
                  <div>
                    <span className="feature-lock-badge">Signature & Premium</span>
                    <h3>Advanced scheduling</h3>
                    <p>
                      Automatically change the sound of each zone by time of day and day of week.
                    </p>
                  </div>
                  <div className="feature-lock-copy">
                    <strong>Available on Signature and Premium.</strong>
                    <span>
                      {subscription?.plan === 'essence'
                        ? 'Your Essence plan includes one zone and core music controls.'
                        : 'Start a Signature or Premium trial to unlock dayparting.'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="schedule-layout">
                  <article className="panel">
                    <form onSubmit={createSchedule} className="setup-form">
                      <label>Zone</label>
                      <select value={scheduleZoneId} onChange={(e) => setScheduleZoneId(e.target.value)} required>
                        <option value="">Select zone</option>
                        {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                      </select>

                      <label>Music channel</label>
                      <select value={scheduleChannelId} onChange={(e) => setScheduleChannelId(e.target.value)} required>
                        <option value="">Select channel</option>
                        {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                      </select>

                      <label>Schedule name</label>
                      <input value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="Morning lobby" />

                      <div className="two-col">
                        <div>
                          <label>Start</label>
                          <input type="time" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} required />
                        </div>
                        <div>
                          <label>End</label>
                          <input type="time" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} required />
                        </div>
                      </div>

                      <label>Days</label>
                      <div className="day-selector">
                        {dayOptions.map((day) => (
                          <button
                            type="button"
                            key={day.value}
                            className={scheduleDays.includes(day.value) ? 'day active' : 'day'}
                            onClick={() => toggleDay(day.value)}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>

                      <button className="primary" disabled={dataLoading || zones.length === 0}>
                        {dataLoading ? 'Saving…' : 'Add schedule'}
                      </button>
                    </form>
                  </article>

                  <article className="schedule-list">
                    {schedules.length === 0 ? (
                      <div className="empty-state">No schedules yet. Your zone will use its default channel.</div>
                    ) : (
                      schedules.map((schedule) => (
                        <div className="schedule-row" key={schedule.id}>
                          <div>
                            <strong>{schedule.name || channelsById[schedule.channel_id]?.name || 'Schedule'}</strong>
                            <span>
                              {zonesById[schedule.zone_id]?.name ?? 'Zone'} · {channelsById[schedule.channel_id]?.name ?? 'Channel'}
                            </span>
                          </div>
                          <div className="schedule-time">
                            {schedule.start_time.slice(0,5)}–{schedule.end_time.slice(0,5)}
                          </div>
                          <div className="schedule-days">
                            {schedule.days_of_week.map((day) => dayOptions.find((item) => item.value === day)?.label).filter(Boolean).join(' ')}
                          </div>
                          <button className="danger-link" onClick={() => void deleteSchedule(schedule.id)} disabled={dataLoading}>Remove</button>
                        </div>
                      ))
                    )}
                  </article>
                </div>
              )}
            </section>

            <section className="refresh-services">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Music Updates</div>
                  <h2>Refreshes & Seasonal Updates</h2>
                </div>
                <p>Keep the sound of your property fresh without rebuilding your setup.</p>
              </div>

              <div className="refresh-grid">
                <article className={regularRefreshesEnabled ? 'refresh-card active' : 'refresh-card locked'}>
                  <span className="feature-lock-badge">Signature & Premium</span>
                  <h3>Regular music refreshes</h3>
                  <p>Periodic updates to your active channels so the atmosphere keeps evolving over time.</p>
                  <strong>{regularRefreshesEnabled ? 'Included in your plan' : 'Upgrade to unlock'}</strong>
                </article>

                <article className={seasonalUpdatesEnabled ? 'refresh-card active' : 'refresh-card locked'}>
                  <span className="feature-lock-badge">Premium only</span>
                  <h3>Seasonal updates</h3>
                  <p>Tailored seasonal adjustments for periods such as summer, festive season and special hotel moments.</p>
                  <strong>{seasonalUpdatesEnabled ? 'Included in your plan' : 'Available on Premium'}</strong>
                </article>
              </div>
            </section>

            <section className="premium-services">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Premium Service</div>
                  <h2>Sound Concierge</h2>
                </div>
                <p>Priority music adjustments and tailored seasonal sound support for premium hospitality spaces.</p>
              </div>

              {premiumFeaturesEnabled ? (
                <div className="concierge-panel active">
                  <div>
                    <span className="feature-lock-badge">Premium</span>
                    <h3>Your Sound Concierge is active</h3>
                    <p>
                      Request priority adjustments, seasonal updates and tailored recommendations for your spaces.
                    </p>
                  </div>
                  <a
                    className="concierge-action"
                    href="mailto:contact@lelvine.com?subject=LELVINE%20Sound%20Concierge"
                  >
                    Contact Sound Concierge
                  </a>
                </div>
              ) : (
                <div className="feature-lock">
                  <div>
                    <span className="feature-lock-badge">Premium only</span>
                    <h3>Sound Concierge</h3>
                    <p>
                      Get priority adjustments, seasonal sound updates and more tailored music support for your property.
                    </p>
                  </div>
                  <div className="feature-lock-copy">
                    <strong>Available on Premium.</strong>
                    <span>
                      {subscription?.plan
                        ? 'Your current plan does not include Sound Concierge.'
                        : 'Start Premium to unlock this service.'}
                    </span>
                  </div>
                </div>
              )}
            </section>

            <section id="dashboard-music" className="music-library">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">LELVINE Music</div>
                  <h2>Music Library</h2>
                </div>
                <p>50 curated tracks across five hospitality sound environments.</p>
              </div>

              <div className="channel-grid">
                {channels.map((channel, index) => (
                  <button
                    className={selectedChannel?.id === channel.id ? 'channel-card selected' : 'channel-card'}
                    key={channel.id}
                    onClick={() => setSelectedChannelId(channel.id)}
                  >
                    <div className="channel-number">{String(index + 1).padStart(2, '0')}</div>
                    <div>
                      <h3>{channel.name}</h3>
                      <p className="channel-mood">{channel.mood}</p>
                      <p className="channel-description">{channel.description}</p>
                    </div>
                    <div className="channel-status">{(tracksByChannel[channel.id] ?? []).length} tracks</div>
                  </button>
                ))}
              </div>

              {selectedChannel && (
                <div className="track-panel">
                  <div className="track-panel-head">
                    <div>
                      <div className="eyebrow">Selected channel</div>
                      <h3>{selectedChannel.name}</h3>
                    </div>
                    <span>{selectedTracks.length} tracks</span>
                  </div>

                  <div className="track-list">
                    {selectedTracks.map((track) => (
                      <div className="track-row" key={track.id}>
                        <span className="track-code">{track.track_code}</span>
                        <strong>{track.title}</strong>
                        <span>{track.bpm ? track.bpm + ' BPM' : '—'}</span>
                        <span>{track.musical_key ?? '—'}</span>
                        <button
                          className="play-button"
                          onClick={() => void playTrack(track)}
                          disabled={!track.audio_url && !track.storage_path}
                          title={!track.audio_url && !track.storage_path ? 'Upload audio first' : 'Play'}
                        >
                          {!track.audio_url && !track.storage_path ? 'No audio' : 'Play'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {nowPlaying && audioUrl && (
              <div className="player-bar">
                <div>
                  <span>Now playing</span>
                  <strong>{nowPlaying.track_code} · {nowPlaying.title}</strong>
                </div>
                <audio controls autoPlay src={audioUrl} />
                <button onClick={() => { setAudioUrl(''); setNowPlaying(null) }}>Close</button>
              </div>
            )}
          </>
        )}
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="visual">
        <div className="vcontent">
          <div className="brand">LELVINE<span>MUSIC FOR HOSPITALITY</span></div>
          <h1>Atmosphere,<br />made intentional.</h1>
          <p>One platform for music, spaces and the rhythm of hospitality.</p>
        </div>
      </section>

      <section className="auth">
        <div className="inner">
          <div className="eyebrow">LELVINE Platform</div>
          <h2>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}</h2>
          <form onSubmit={submitAuth}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@hotel.com" />
            {mode !== 'forgot' && (
              <>
                <label>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
              </>
            )}
            {msg && <div className="msg">{msg}</div>}
            <button className="primary" disabled={authLoading}>
              {authLoading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </button>
          </form>
          <div className="links">
            {mode !== 'signin' && <button onClick={() => setMode('signin')}>Back to sign in</button>}
            {mode === 'signin' && (
              <>
                <button onClick={() => setMode('signup')}>Create account</button>
                <button onClick={() => setMode('forgot')}>Forgot password?</button>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}


type PlayerBootstrap = {
  device: { id: string; code: string; name: string; volume: number }
  location: { id: string; name: string; timezone: string }
  zone: { id: string; name: string }
  channel: { id: string; name: string; slug: string; mood: string | null } | null
  server_time: string
}

type RuntimeCommand = {
  command_id: string
  command_type: string
  payload: Record<string, unknown>
  created_at: string
}

function PlayerRuntime() {
  const [activationCode, setActivationCode] = useState('')
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem('lelvine_player_device_id') || '')
  const [deviceToken, setDeviceToken] = useState(() => localStorage.getItem('lelvine_player_token') || '')
  const [config, setConfig] = useState<PlayerBootstrap | null>(null)
  const [runtimeState, setRuntimeState] = useState('stopped')
  const [volume, setVolume] = useState(70)
  const [runtimeMsg, setRuntimeMsg] = useState('')
  const [pairing, setPairing] = useState(false)
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null)
  const [playlist, setPlaylist] = useState<Track[]>([])
  const [trackIndex, setTrackIndex] = useState(0)
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [currentAudioUrl, setCurrentAudioUrl] = useState('')
  const [audioReady, setAudioReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const paired = Boolean(deviceId && deviceToken)

  async function resolveTrackAudio(track: Track) {
    if (track.audio_url) return track.audio_url
    if (!track.storage_path) return ''

    const { data, error } = await supabase.storage
      .from('music')
      .createSignedUrl(track.storage_path, 60 * 60 * 6)

    if (error || !data?.signedUrl) return ''
    return data.signedUrl
  }

  async function loadPlaylist(channelId: string | null | undefined) {
    if (!channelId) {
      setPlaylist([])
      setCurrentTrack(null)
      setCurrentAudioUrl('')
      setTrackIndex(0)
      return
    }

    const { data, error } = await supabase
      .from('tracks')
      .select('*')
      .eq('channel_id', channelId)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('track_code', { ascending: true })

    if (error) {
      setRuntimeMsg('Could not load channel playlist: ' + error.message)
      return
    }

    const playable = ((data ?? []) as Track[]).filter((track) => track.audio_url || track.storage_path)
    setPlaylist(playable)
    setTrackIndex(0)

    if (playable.length === 0) {
      setCurrentTrack(null)
      setCurrentAudioUrl('')
      setAudioReady(false)
      setRuntimeMsg('Channel connected. Audio files can be added later.')
      return
    }

    setRuntimeMsg('')
  }

  async function prepareTrack(index: number, autoplay = runtimeState === 'playing') {
    if (playlist.length === 0) return

    let resolvedTrack: Track | null = null
    let resolvedUrl = ''
    let resolvedIndex = 0

    for (let offset = 0; offset < playlist.length; offset += 1) {
      const candidateIndex = ((index + offset) % playlist.length + playlist.length) % playlist.length
      const candidate = playlist[candidateIndex]
      const candidateUrl = await resolveTrackAudio(candidate)

      if (candidateUrl) {
        resolvedTrack = candidate
        resolvedUrl = candidateUrl
        resolvedIndex = candidateIndex
        break
      }
    }

    if (!resolvedTrack || !resolvedUrl) {
      setRuntimeMsg('This channel has no playable audio file yet.')
      return
    }

    setTrackIndex(resolvedIndex)
    setCurrentTrack(resolvedTrack)
    setCurrentAudioUrl(resolvedUrl)
    setAudioReady(false)

    window.setTimeout(async () => {
      const audio = audioRef.current
      if (!audio || !autoplay) return
      try {
        await audio.play()
        setRuntimeState('playing')
        setRuntimeMsg('')
      } catch {
        setRuntimeState('paused')
        setRuntimeMsg('Press Play once on this device to enable audio playback.')
      }
    }, 0)
  }

  async function playRuntime() {
    if (playlist.length === 0) {
      setRuntimeState('paused')
      setRuntimeMsg('No audio files are available in this channel yet.')
      return
    }

    if (!currentTrack || !currentAudioUrl) {
      await prepareTrack(trackIndex, true)
      return
    }

    try {
      await audioRef.current?.play()
      setRuntimeState('playing')
      setRuntimeMsg('')
    } catch {
      setRuntimeState('paused')
      setRuntimeMsg('Press Play once on this device to enable audio playback.')
    }
  }

  function pauseRuntime() {
    audioRef.current?.pause()
    setRuntimeState('paused')
  }

  function stopRuntime() {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setRuntimeState('stopped')
  }

  async function nextTrack() {
    if (playlist.length === 0) return
    await prepareTrack(trackIndex + 1, runtimeState === 'playing')
  }

  async function bootstrap(id = deviceId, token = deviceToken) {
    if (!id || !token) return

    const { data, error } = await supabase.rpc('player_bootstrap', {
      p_device_id: id,
      p_token: token,
    })

    if (error) {
      setRuntimeMsg(error.message)
      if (error.message.toLowerCase().includes('invalid device token')) {
        localStorage.removeItem('lelvine_player_device_id')
        localStorage.removeItem('lelvine_player_token')
        setDeviceId('')
        setDeviceToken('')
        setConfig(null)
      }
      return
    }

    const next = data as PlayerBootstrap
    setConfig(next)
    setVolume(next.device.volume ?? 70)
    setRuntimeMsg('')
  }

  async function pairDevice(e: FormEvent) {
    e.preventDefault()
    if (!activationCode.trim()) return

    setPairing(true)
    setRuntimeMsg('')

    const { data, error } = await supabase.rpc('pair_player_device', {
      p_activation_code: activationCode.trim(),
      p_platform: 'web-player',
      p_app_version: '1.1.0',
    })

    if (error) {
      setRuntimeMsg(error.message)
      setPairing(false)
      return
    }

    const result = data as { device_id: string; device_token: string }
    localStorage.setItem('lelvine_player_device_id', result.device_id)
    localStorage.setItem('lelvine_player_token', result.device_token)
    setDeviceId(result.device_id)
    setDeviceToken(result.device_token)
    setActivationCode('')
    setPairing(false)
    await bootstrap(result.device_id, result.device_token)
  }

  async function heartbeat() {
    if (!deviceId || !deviceToken) return

    const { data, error } = await supabase.rpc('player_heartbeat', {
      p_device_id: deviceId,
      p_token: deviceToken,
      p_playback_state: runtimeState,
      p_current_channel_id: config?.channel?.id ?? null,
      p_current_track_id: currentTrack?.id ?? null,
      p_volume: volume,
      p_app_version: '1.1.0',
      p_last_error: runtimeMsg || null,
    })

    if (error) {
      setRuntimeMsg(error.message)
      return
    }

    const result = data as { desired_channel_id?: string | null }
    if (result.desired_channel_id && result.desired_channel_id !== config?.channel?.id) {
      await bootstrap()
    }
    setLastHeartbeat(new Date().toISOString())
  }

  async function acknowledge(command: RuntimeCommand, success = true, errorMessage: string | null = null) {
    await supabase.rpc('player_ack_command', {
      p_device_id: deviceId,
      p_token: deviceToken,
      p_command_id: command.command_id,
      p_success: success,
      p_error_message: errorMessage,
    })
  }

  async function processCommand(command: RuntimeCommand) {
    try {
      if (command.command_type === 'play' || command.command_type === 'resume') await playRuntime()
      if (command.command_type === 'pause') pauseRuntime()
      if (command.command_type === 'stop') stopRuntime()
      if (command.command_type === 'next') await nextTrack()

      if (command.command_type === 'set_volume') {
        const nextVolume = Number(command.payload?.volume)
        if (Number.isFinite(nextVolume)) setVolume(Math.max(0, Math.min(100, nextVolume)))
      }

      if (command.command_type === 'sync' || command.command_type === 'set_channel') {
        await bootstrap()
      }

      await acknowledge(command, true)

      if (command.command_type === 'restart' || command.command_type === 'reload') {
        window.setTimeout(() => window.location.reload(), 500)
      }
    } catch (error) {
      await acknowledge(command, false, error instanceof Error ? error.message : 'Command failed')
    }
  }

  async function pullCommands() {
    if (!deviceId || !deviceToken) return

    const { data, error } = await supabase.rpc('player_pull_commands', {
      p_device_id: deviceId,
      p_token: deviceToken,
    })

    if (error) {
      setRuntimeMsg(error.message)
      return
    }

    for (const command of (data ?? []) as RuntimeCommand[]) {
      await processCommand(command)
    }
  }

  function unpairLocal() {
    stopRuntime()
    localStorage.removeItem('lelvine_player_device_id')
    localStorage.removeItem('lelvine_player_token')
    setDeviceId('')
    setDeviceToken('')
    setConfig(null)
    setPlaylist([])
    setCurrentTrack(null)
    setCurrentAudioUrl('')
    setLastHeartbeat(null)
  }

  useEffect(() => {
    if (!paired) return
    void bootstrap()
  }, [deviceId, deviceToken])

  useEffect(() => {
    void loadPlaylist(config?.channel?.id)
  }, [config?.channel?.id])

  useEffect(() => {
    if (playlist.length === 0) return
    void prepareTrack(0, runtimeState === 'playing')
  }, [playlist])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = Math.max(0, Math.min(1, volume / 100))
  }, [volume, currentAudioUrl])

  useEffect(() => {
    if (!paired) return

    void heartbeat()
    void pullCommands()

    const heartbeatTimer = window.setInterval(() => void heartbeat(), 30000)
    const commandTimer = window.setInterval(() => void pullCommands(), 4000)

    return () => {
      window.clearInterval(heartbeatTimer)
      window.clearInterval(commandTimer)
    }
  }, [paired, deviceId, deviceToken, runtimeState, volume, config?.channel?.id, currentTrack?.id, runtimeMsg])

  return (
    <main className="runtime-shell">
      <audio
        ref={audioRef}
        src={currentAudioUrl || undefined}
        preload="auto"
        onCanPlay={() => setAudioReady(true)}
        onPlay={() => setRuntimeState('playing')}
        onPause={() => {
          if (runtimeState === 'playing') setRuntimeState('paused')
        }}
        onEnded={() => void nextTrack()}
        onError={() => {
          setAudioReady(false)
          setRuntimeMsg('Audio file could not be played. Moving to the next track.')
          window.setTimeout(() => void nextTrack(), 500)
        }}
      />

      <header className="runtime-header">
        <div className="brand">LELVINE<span>PLAYER</span></div>
        {paired && <div className="runtime-online"><i></i> Connected</div>}
      </header>

      {!paired ? (
        <section className="pair-screen">
          <div className="eyebrow">LELVINE Player</div>
          <h1>Pair this player.</h1>
          <p>Enter the pairing code shown in the hotel dashboard.</p>

          <form onSubmit={pairDevice} className="pair-form">
            <label>Pairing code</label>
            <input
              className="pair-code-input"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
              placeholder="A7F83D21"
              autoFocus
              required
            />
            <button className="primary" disabled={pairing}>
              {pairing ? 'Pairing…' : 'Connect player'}
            </button>
          </form>

          {runtimeMsg && <div className="data-message">{runtimeMsg}</div>}
        </section>
      ) : (
        <section className="runtime-console">
          <div className="runtime-topline">
            <div>
              <div className="eyebrow">Live player</div>
              <h1>{config?.device.name ?? 'LELVINE Player'}</h1>
              <p>{config ? config.location.name + ' · ' + config.zone.name : 'Connecting…'}</p>
            </div>
            <div className="runtime-code">{config?.device.code ?? '—'}</div>
          </div>

          <div className="runtime-now">
            <div className="runtime-art">
              <span>LELVINE</span>
            </div>
            <div className="runtime-track">
              <div className="eyebrow">Now playing</div>
              <h2>{currentTrack?.title ?? config?.channel?.name ?? 'No channel assigned'}</h2>
              <p>
                {currentTrack
                  ? (currentTrack.track_code ? currentTrack.track_code + ' · ' : '') + (config?.channel?.name ?? 'LELVINE')
                  : config?.channel?.mood ?? 'Waiting for a channel from the dashboard.'}
              </p>
              <div className="runtime-state">
                <span className={'state-pill ' + runtimeState}>{runtimeState}</span>
                <span>Volume {volume}%</span>
                <span>{playlist.length} playable tracks</span>
                {currentAudioUrl && <span>{audioReady ? 'Audio ready' : 'Loading audio…'}</span>}
              </div>
            </div>
          </div>

          <div className="runtime-controls">
            <button onClick={() => runtimeState === 'playing' ? pauseRuntime() : void playRuntime()}>
              {runtimeState === 'playing' ? 'Pause' : 'Play'}
            </button>
            <button onClick={() => void nextTrack()} disabled={playlist.length < 2}>Next</button>
            <button onClick={stopRuntime}>Stop</button>
            <button onClick={() => void bootstrap()}>Sync</button>
          </div>

          <div className="runtime-volume">
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
            <strong>{volume}%</strong>
          </div>

          <div className="runtime-info">
            <div><span>Player status</span><strong>ONLINE</strong></div>
            <div><span>Heartbeat</span><strong>{lastHeartbeat ? new Date(lastHeartbeat).toLocaleTimeString() : 'Connecting…'}</strong></div>
            <div><span>Timezone</span><strong>{config?.location.timezone ?? '—'}</strong></div>
            <div><span>Channel</span><strong>{config?.channel?.name ?? 'Not assigned'}</strong></div>
            <div><span>Track</span><strong>{currentTrack?.title ?? 'Waiting for audio'}</strong></div>
            <div><span>Playlist</span><strong>{playlist.length > 0 ? playlist.length + ' ready' : 'Awaiting audio files'}</strong></div>
          </div>

          {runtimeMsg && <div className="data-message">{runtimeMsg}</div>}

          <button className="runtime-unpair" onClick={unpairLocal}>Forget this player</button>
        </section>
      )}
    </main>
  )
}

export default function App() {
  const isPlayerHost =
    window.location.hostname === 'player.lelvine.com' ||
    window.location.pathname.startsWith('/player')

  return isPlayerHost ? <PlayerRuntime /> : <DashboardApp />
}
