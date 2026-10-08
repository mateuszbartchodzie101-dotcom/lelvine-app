import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Mode = 'signin' | 'signup' | 'forgot'
type Organization = { id: string; name: string; owner_id: string; created_at: string }
type Location = { id: string; organization_id: string; name: string; city: string | null; country: string | null; created_at: string }
type Zone = { id: string; location_id: string; name: string; created_at: string }

export default function App() {
  const [mode, setMode] = useState<Mode>('signin')
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [authLoading, setAuthLoading] = useState(true)

  const [organization, setOrganization] = useState<Organization | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataMsg, setDataMsg] = useState('')

  const [orgName, setOrgName] = useState('')
  const [locationName, setLocationName] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [zoneName, setZoneName] = useState('')
  const [zoneLocationId, setZoneLocationId] = useState('')

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
      return
    }
    void loadHotelData()
  }, [session])

  async function loadHotelData() {
    setDataLoading(true)
    setDataMsg('')

    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)

    if (orgError) {
      setDataMsg(orgError.message)
      setDataLoading(false)
      return
    }

    const org = (orgs?.[0] ?? null) as Organization | null
    setOrganization(org)

    if (!org) {
      setLocations([])
      setZones([])
      setDataLoading(false)
      return
    }

    const [{ data: locData, error: locError }, { data: zoneData, error: zoneError }] = await Promise.all([
      supabase.from('locations').select('*').eq('organization_id', org.id).order('created_at', { ascending: true }),
      supabase.from('zones').select('*').order('created_at', { ascending: true }),
    ])

    if (locError || zoneError) {
      setDataMsg(locError?.message ?? zoneError?.message ?? 'Could not load hotel data.')
      setDataLoading(false)
      return
    }

    const nextLocations = (locData ?? []) as Location[]
    setLocations(nextLocations)
    setZones((zoneData ?? []) as Zone[])

    if (!zoneLocationId && nextLocations[0]) setZoneLocationId(nextLocations[0].id)
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

    setZones((current) => [...current, data as Zone])
    setZoneName('')
    setDataLoading(false)
  }

  const zonesByLocation = useMemo(() => {
    const map: Record<string, Zone[]> = {}
    for (const zone of zones) {
      if (!map[zone.location_id]) map[zone.location_id] = []
      map[zone.location_id].push(zone)
    }
    return map
  }, [zones])

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
                    <div className="zone-pills">
                      {(zonesByLocation[location.id] ?? []).length === 0
                        ? <em>No zones yet</em>
                        : (zonesByLocation[location.id] ?? []).map((zone) => <span key={zone.id}>{zone.name}</span>)}
                    </div>
                  </article>
                ))
              )}
            </section>
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
