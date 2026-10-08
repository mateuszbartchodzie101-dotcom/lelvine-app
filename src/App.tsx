import { FormEvent, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Mode='signin'|'signup'|'forgot'
export default function App(){
 const [mode,setMode]=useState<Mode>('signin'),[session,setSession]=useState<Session|null>(null)
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[msg,setMsg]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 async function submit(e:FormEvent){e.preventDefault();setMsg('');setLoading(true);try{
  if(mode==='signin'){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error}
  if(mode==='signup'){const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}});if(error)throw error;setMsg('Check your inbox and confirm your email.')}
  if(mode==='forgot'){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});if(error)throw error;setMsg('Reset link sent.')}
 }catch(e){setMsg(e instanceof Error?e.message:'Something went wrong')}finally{setLoading(false)}}
 if(loading&&!session)return <main className="loading">LELVINE</main>
 if(session)return <main className="dash"><header><div className="brand">LELVINE<span>HOSPITALITY PLATFORM</span></div><button onClick={()=>supabase.auth.signOut()}>Sign out</button></header><section className="welcome"><div className="eyebrow">Dashboard</div><h1>Welcome to LELVINE.</h1><p>{session.user.email}</p></section><section className="cards"><article><b>01</b><h2>Locations</h2><p>Your hotel locations will appear here.</p></article><article><b>02</b><h2>Zones</h2><p>Lobby, Spa, Rooftop and other spaces.</p></article><article><b>03</b><h2>Music</h2><p>Curated LELVINE channels for every moment.</p></article></section></main>
 return <main className="shell"><section className="visual"><div className="vcontent"><div className="brand">LELVINE<span>MUSIC FOR HOSPITALITY</span></div><h1>Atmosphere,<br/>made intentional.</h1><p>One platform for music, spaces and the rhythm of hospitality.</p></div></section><section className="auth"><div className="inner"><div className="eyebrow">LELVINE Platform</div><h2>{mode==='signin'?'Sign in':mode==='signup'?'Create account':'Reset password'}</h2><form onSubmit={submit}><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@hotel.com"/>{mode!=='forgot'&&<><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required/></>}{msg&&<div className="msg">{msg}</div>}<button className="primary" disabled={loading}>{loading?'Please wait…':mode==='signin'?'Sign in':mode==='signup'?'Create account':'Send reset link'}</button></form><div className="links">{mode!=='signin'&&<button onClick={()=>setMode('signin')}>Back to sign in</button>}{mode==='signin'&&<><button onClick={()=>setMode('signup')}>Create account</button><button onClick={()=>setMode('forgot')}>Forgot password?</button></>}</div></div></section></main>
}
