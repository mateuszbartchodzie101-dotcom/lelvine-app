import { FormEvent, useEffect, useMemo, useState } from 'react'
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
    if (!session) {
      setOrganization(null)
      setLocations([])
      setZones([])
      setChannels([])
      setTracks([])
      setSchedules([])
      setZoneOverview([])
      setDevices([])
      return
    }
    void loadHotelData()
  }, [session])

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

  async function createZone(e: FormEvent) {
    e.preventDefault()
    if (!zoneLocationId || !zoneName.trim()) return

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

  if (session) {
    return (
      <main className="dash">
        <header>
          <div className="brand">LELVINE<span>HOSPITALITY PLATFORM</span></div>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </header>

        <section className="welcome">
          <div className="eyebrow">Dashboard</div>
          <h1>{organization ? organization.name : 'Welcome to LELVINE.'}</h1>
          <p>{session.user.email}</p>
        </section>

        <section className="stats">
          <article><strong>{organization ? 1 : 0}</strong><span>Organization</span></article>
          <article><strong>{locations.length}</strong><span>Locations</span></article>
          <article><strong>{zones.length}</strong><span>Zones</span></article>
          <article><strong>{tracks.length}</strong><span>Tracks</span></article>
        </section>

        {dataMsg && <div className="data-message">{dataMsg}</div>}

        {!organization ? (
          <section className="setup-panel">
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
            <section className="workspace-grid">
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
                    <button className="primary" disabled={dataLoading}>{dataLoading ? 'Saving…' : 'Add zone'}</button>
                  </form>
                )}
              </article>
            </section>

            <section className="location-list">
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

            <section className="devices-section">
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

            <section className="schedule-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Dayparting</div>
                  <h2>Schedule Editor</h2>
                </div>
                <p>Choose which sound environment should run in each zone at different times of day.</p>
              </div>

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
            </section>

            <section className="music-library">
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

  const paired = Boolean(deviceId && deviceToken)

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
      p_app_version: '1.0.0',
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
      p_current_track_id: null,
      p_volume: volume,
      p_app_version: '1.0.0',
      p_last_error: null,
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
      if (command.command_type === 'play' || command.command_type === 'resume') setRuntimeState('playing')
      if (command.command_type === 'pause') setRuntimeState('paused')
      if (command.command_type === 'stop') setRuntimeState('stopped')

      if (command.command_type === 'set_volume') {
        const nextVolume = Number(command.payload?.volume)
        if (Number.isFinite(nextVolume)) setVolume(nextVolume)
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
    localStorage.removeItem('lelvine_player_device_id')
    localStorage.removeItem('lelvine_player_token')
    setDeviceId('')
    setDeviceToken('')
    setConfig(null)
    setRuntimeState('stopped')
    setLastHeartbeat(null)
  }

  useEffect(() => {
    if (!paired) return
    void bootstrap()
  }, [deviceId, deviceToken])

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
  }, [paired, deviceId, deviceToken, runtimeState, volume, config?.channel?.id])

  return (
    <main className="runtime-shell">
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
              <div className="eyebrow">Current sound environment</div>
              <h2>{config?.channel?.name ?? 'No channel assigned'}</h2>
              <p>{config?.channel?.mood ?? 'Waiting for a channel from the dashboard.'}</p>
              <div className="runtime-state">
                <span className={'state-pill ' + runtimeState}>{runtimeState}</span>
                <span>Volume {volume}%</span>
              </div>
            </div>
          </div>

          <div className="runtime-controls">
            <button onClick={() => setRuntimeState(runtimeState === 'playing' ? 'paused' : 'playing')}>
              {runtimeState === 'playing' ? 'Pause' : 'Play'}
            </button>
            <button onClick={() => setRuntimeState('stopped')}>Stop</button>
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
            <div><span>Audio</span><strong>Awaiting catalog files</strong></div>
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
