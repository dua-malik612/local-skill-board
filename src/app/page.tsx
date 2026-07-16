"use client"
import { useEffect, useState, useRef } from "react"
import { supabase } from "../lib/supabase"

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  const [activeTab, setActiveTab] = useState<string>("concept")
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [authError, setAuthError] = useState("")
  
  const [profile, setProfile] = useState<any>(null)
  const [bio, setBio] = useState("")
  const [location, setLocation] = useState("")
  const [updatingProfile, setUpdatingProfile] = useState(false)

  const [listings, setListings] = useState<any[]>([])
  const [title, setTitle] = useState("")
  const [type, setType] = useState<"offer" | "request">("offer")
  const [category, setCategory] = useState("Technology")
  const [description, setDescription] = useState("")
  const [radiusKm, setRadiusKm] = useState(15)
  const [posting, setPosting] = useState(false)

  const [searchQuery, setSearchQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState("All")
  const [filterType, setFilterType] = useState("All")

  const [activeChatUser, setActiveChatUser] = useState<any>(null)
  const [activeChatListing, setActiveChatListing] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [sendingMsg, setSendingMsg] = useState(false)
  
  const [sentConnections, setSentConnections] = useState<any[]>([])
  const [receivedConnections, setReceivedConnections] = useState<any[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }
  useEffect(() => {
    if (activeChatUser) scrollToBottom()
  }, [messages, activeChatUser])

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    }
    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()

    if (data) {
      setProfile(data)
      setBio(data.bio || "")
      setLocation(data.location || "")
      await fetchListings()
      await fetchRealtimeInbox(userId)
    }
    setLoading(false)
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError("")
    const cleanEmail = email.trim().toLowerCase()

    if (isSignUp) {
      if (!fullName.trim()) return setAuthError("Name missing.")
      if (password.length < 6) return setAuthError("Short password.")
      if (password !== confirmPassword) return setAuthError("Passwords mismatch.")

      setLoading(true)
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password })
      if (error) {
        setAuthError(error.message)
        setLoading(false)
        return
      } 
      
      if (data?.user) {
        await supabase.from("profiles").insert([{ id: data.user.id, name: fullName, email: cleanEmail, location: "", bio: "" }])
        setUser(data.user)
        setShowAuthModal(false)
        await fetchProfile(data.user.id)
      }
    } else {
      setLoading(true)
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      if (error) {
        setAuthError(error.message)
        setLoading(false)
      } else if (data?.user) {
        setUser(data.user)
        setShowAuthModal(false)
        await fetchProfile(data.user.id)
      }
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setUpdatingProfile(true)
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, name: profile?.name || fullName, bio, location, email: user.email })

    if (!error) await fetchProfile(user.id)
    setUpdatingProfile(false)
  }

  const fetchListings = async () => {
    let query = supabase.from("listings").select(`*, profiles (id, name, location)`).order("created_at", { ascending: false })
    if (filterCategory !== "All") query = query.eq("category", filterCategory)
    if (filterType !== "All") query = query.eq("type", filterType)
    if (searchQuery.trim() !== "") query = query.ilike("title", `%${searchQuery}%`)

    const { data } = await query
    setListings(data || [])
  }

  const fetchRealtimeInbox = async (userId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select(`
        sender_id, receiver_id, listing_id, content,
        listings (id, title, type, category, user_id),
        sender_profile:profiles!messages_sender_id_fkey(name),
        receiver_profile:profiles!messages_receiver_id_fkey(name)
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("timestamp", { ascending: false })

    if (error || !data) return

    const outboxMap = new Map()
    const inboxMap = new Map()

    data.forEach((msg: any) => {
      if (!msg.listings) return
      const isOwnerOfListing = msg.listings.user_id === userId
      const key = `${msg.listing_id}_${msg.sender_id}_${msg.receiver_id}`

      if (isOwnerOfListing) {
        if (!inboxMap.has(key)) {
          inboxMap.set(key, {
            otherUser: { id: msg.sender_id, name: msg.sender_profile?.name },
            listing: msg.listings,
            lastMessage: msg.content
          })
        }
      } else {
        if (!outboxMap.has(key)) {
          outboxMap.set(key, {
            otherUser: { id: msg.receiver_id, name: msg.receiver_profile?.name },
            listing: msg.listings,
            lastMessage: msg.content
          })
        }
      }
    })

    setSentConnections(Array.from(outboxMap.values()))
    setReceivedConnections(Array.from(inboxMap.values()))
  }

  useEffect(() => {
    if (user) {
      fetchListings()
    }
  }, [filterCategory, filterType, searchQuery, activeTab])

  const addListing = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !description) return
    setPosting(true)

    const { error } = await supabase.from("listings").insert([{ user_id: user.id, type, title, category, description, radius_km: Number(radiusKm) }])
    if (!error) {
      setTitle("")
      setDescription("")
      setActiveTab("explore")
      fetchListings()
    }
    setPosting(false)
  }

  const deleteListing = async (id: string) => {
    if (confirm("Delete this craft entry?")) {
      await supabase.from("listings").delete().eq("id", id)
      fetchListings()
    }
  }

  const openChatWindow = async (targetUser: any, relatedListing: any) => {
    setActiveChatUser(targetUser)
    setActiveChatListing(relatedListing)
    await fetchMessages(targetUser.id, relatedListing.id)
  }

  const fetchMessages = async (targetUserId: string, listingId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${user.id})`)
      .eq("listing_id", listingId)
      .order("timestamp", { ascending: true })
    setMessages(data || [])
  }

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !user) return
    setSendingMsg(true)
    const { error } = await supabase.from("messages").insert([{ sender_id: user.id, receiver_id: activeChatUser.id, listing_id: activeChatListing.id, content: newMessage.trim() }])
    if (!error) {
      setNewMessage("")
      await fetchMessages(activeChatUser.id, activeChatListing.id)
      await fetchRealtimeInbox(user.id)
    }
    setSendingMsg(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center">
        <span className="text-xs tracking-[0.3em] text-[#C5A880] font-serif animate-pulse">VALOIR LOUNGE LOADING...</span>
      </div>
    )
  }

  const isProfileComplete = profile && profile.location && profile.bio
  const totalMatchesCount = sentConnections.length + receivedConnections.length

  return (
    <div className="min-h-screen bg-[#0F1015] text-[#EAEAEA] antialiased font-sans">
      
      {/* 🏛️ PREMIUM LUXURY TOP BAR */}
      <header className="bg-[#16171E] border-b border-[#23252F] px-4 md:px-8 py-4 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-center gap-4 lg:gap-6">
          
          {/* Logo Brand */}
          <div className="cursor-pointer text-center lg:text-left shrink-0" onClick={() => setActiveTab("concept")}>
            <span className="text-xl font-serif font-bold tracking-[0.25em] text-[#C5A880] block">VALOIR</span>
            <span className="text-[9px] tracking-[0.18em] text-[#6E7383] uppercase font-medium">PREMIUM CASHLESS SKILL GUILD</span>
          </div>

          {/* Clean Layout No-Scroll Wrapper */}
          {user && isProfileComplete && (
            <div className="w-full lg:w-auto overflow-x-auto [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-1 bg-[#1A1B23] p-1.5 rounded-xl border border-[#262936] whitespace-nowrap">
                
                {/* Concept Button */}
                <button 
                  onClick={() => setActiveTab("concept")} 
                  className={`text-[11px] font-medium tracking-widest uppercase px-4 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 ${
                    activeTab === 'concept' 
                      ? 'bg-[#C5A880] text-[#16171E] font-semibold shadow-sm' 
                      : 'text-[#8E94A6] hover:text-white hover:bg-[#232530]'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.084-1.008l-.041.02a.75.75 0 01-1.084 1.008zM12 3a9 9 0 100 18 9 9 0 000-18zM12.75 15.25V12H11.25v3.25h1.5z" />
                  </svg>
                  Concept
                </button>

                {/* Explore Market Button */}
                <button 
                  onClick={() => setActiveTab("explore")} 
                  className={`text-[11px] font-medium tracking-widest uppercase px-4 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 ${
                    activeTab === 'explore' 
                      ? 'bg-[#C5A880] text-[#16171E] font-semibold shadow-sm' 
                      : 'text-[#8E94A6] hover:text-white hover:bg-[#232530]'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503-11.485a.75.75 0 011.006-.118l3.18 2.12a.75.75 0 01.311.624v11.12a.75.75 0 01-1.006.712l-3.613-1.445a.75.75 0 00-.546 0l-3.323 1.33a.75.75 0 01-.546 0l-3.613-1.445A.75.75 0 013 18.25V7.13a.75.75 0 011.006-.712l3.613 1.445a.75.75 0 00.546 0l3.323-1.33a.75.75 0 01.546 0l1.468.587z" />
                  </svg>
                  Explore Market
                </button>

                {/* Publish Button */}
                <button 
                  onClick={() => setActiveTab("publish")} 
                  className={`text-[11px] font-medium tracking-widest uppercase px-4 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 ${
                    activeTab === 'publish' 
                      ? 'bg-[#C5A880] text-[#16171E] font-semibold shadow-sm' 
                      : 'text-[#8E94A6] hover:text-white hover:bg-[#232530]'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Publish
                </button>

                {/* Exchange Hub Button */}
                <button 
                  onClick={() => setActiveTab("dashboard")} 
                  className={`text-[11px] font-medium tracking-widest uppercase px-4 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 ${
                    activeTab === 'dashboard' 
                      ? 'bg-[#C5A880] text-[#16171E] font-semibold shadow-sm' 
                      : 'text-[#8E94A6] hover:text-white hover:bg-[#232530]'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94-3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                  Hub ({totalMatchesCount})
                </button>

              </div>
            </div>
          )}
          
          {/* Identity Action Box */}
          <div className="flex items-center gap-4 shrink-0">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#8E94A6] hidden sm:inline">Class: <strong className="text-[#C5A880] font-medium">{profile?.name || "Verified Member"}</strong></span>
                <button onClick={() => { supabase.auth.signOut(); setUser(null); }} className="text-[11px] font-medium border border-[#3A3E4F] text-[#E07A7A] hover:bg-[#2A1C1C] px-3 py-1.5 rounded-lg transition-all">Sign Out</button>
              </div>
            ) : (
              <button onClick={() => { setIsSignUp(false); setShowAuthModal(true); }} className="text-xs font-semibold bg-[#C5A880] text-[#16171E] px-4 py-2 rounded-lg hover:bg-[#B3966D] transition-all">Enter Private Lounge</button>
            )}
          </div>
        </div>
      </header>

      {/* AUTHENTICATION OVERLAY */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#16171E] rounded-2xl max-w-md w-full p-8 border border-[#2D303E] shadow-2xl relative">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-5 right-5 text-[#6E7383] hover:text-white">✕</button>
            <h3 className="text-lg font-serif font-bold text-[#C5A880] mb-6 text-center">{isSignUp ? "Create Club Identity" : "Member Verification"}</h3>
            
            {authError && <div className="p-3 bg-red-950/50 text-red-400 border border-red-900/50 text-xs rounded-lg mb-4">{authError}</div>}
            
            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-1">Full Name</label>
                  <input type="text" placeholder="Hashir Javed" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-[#1F212A] border border-[#2D303E] text-xs text-white outline-none focus:border-[#C5A880]" required />
                </div>
              )}
              <div>
                <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-1">Email</label>
                <input type="email" placeholder="name@domain.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-[#1F212A] border border-[#2D303E] text-xs text-white outline-none focus:border-[#C5A880]" required />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-1">Password</label>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-[#1F212A] border border-[#2D303E] text-xs text-white outline-none focus:border-[#C5A880]" required />
              </div>
              {isSignUp && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-1">Confirm Password</label>
                  <input type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-[#1F212A] border border-[#2D303E] text-xs text-white outline-none focus:border-[#C5A880]" required />
                </div>
              )}
              <button type="submit" className="w-full bg-[#C5A880] hover:bg-[#B3966D] text-[#16171E] font-semibold py-3 rounded-lg text-xs uppercase tracking-wider transition-all mt-2">
                {isSignUp ? "Register Private Seat" : "Verify Account"}
              </button>
            </form>
            <div className="text-center mt-4">
              <button onClick={() => setIsSignUp(!isSignUp)} className="text-xs text-[#C5A880] hover:underline">
                {isSignUp ? "Already registered? Access Sign In" : "New practitioner? Open seat form"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXTENDED DEEP CONCEPT VIEW */}
      {(activeTab === "concept" || !user) && (
        <section className="max-w-5xl mx-auto px-6 py-16 space-y-20 animate-fade-in">
          
          <div className="text-center space-y-6">
            <span className="text-[10px] font-bold tracking-[0.22em] bg-[#1F212A] text-[#C5A880] px-5 py-2 rounded-full border border-[#313543] inline-block uppercase">
              🏛️ ANTI-CURRENCY ARCHITECTURE PROTOCOL
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif text-white leading-tight tracking-tight max-w-4xl mx-auto">
              Trade your premium skills. <br />
              <span className="italic text-[#C5A880] font-light">Zero commercial currency involved.</span>
            </h2>
            <p className="text-[#A0A5B5] max-w-3xl mx-auto text-sm md:text-base leading-relaxed font-light">
              VALOIR redefines localized peer learning and strategic talent trade. We completely exclude intermediate transactional capital, token models, and digital currencies to preserve direct, unconditional reciprocal value exchange.
            </p>
            {!user && (
              <button onClick={() => { setIsSignUp(true); setShowAuthModal(true); }} className="bg-[#C5A880] hover:bg-[#B3966D] text-[#16171E] text-xs font-bold tracking-wider uppercase px-8 py-3.5 rounded-lg transition-all shadow-md mt-4">
                Initiate Club Seat Registration
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-8 pt-6 border-t border-[#1F212A]">
            <div className="bg-[#16171E] border border-[#23252F] p-8 rounded-2xl space-y-3">
              <div className="text-lg">⚖️</div>
              <h4 className="text-sm font-bold font-serif text-[#C5A880] uppercase tracking-wider">Direct Reciprocity</h4>
              <p className="text-xs text-[#8E94A6] leading-relaxed font-light">
                No complex banking token structures or centralized credits. You teach an intermediate or expert art domain, and in absolute mutual return, you claim skill mastery classes from neighbors.
              </p>
            </div>

            <div className="bg-[#16171E] border border-[#23252F] p-8 rounded-2xl space-y-3">
              <div className="text-lg">🎯</div>
              <h4 className="text-sm font-bold font-serif text-[#C5A880] uppercase tracking-wider">Zero Signal Distortions</h4>
              <p className="text-xs text-[#8E94A6] leading-relaxed font-light">
                By eliminating price points, we preserve pure intent alignment. Members connect exclusively when knowledge demands map directly to structural capabilities. No noise, just engineering and art.
              </p>
            </div>

            <div className="bg-[#16171E] border border-[#23252F] p-8 rounded-2xl space-y-3">
              <div className="text-lg">🔒</div>
              <h4 className="text-sm font-bold font-serif text-[#C5A880] uppercase tracking-wider">Verified Club Privacy</h4>
              <p className="text-xs text-[#8E94A6] leading-relaxed font-light">
                Every member maintains verified identities. Catalog postings undergo continuous localized metric filters to safeguard the network from commercial service providers and ads.
              </p>
            </div>
          </div>

          <div className="border-t border-[#1F212A] pt-12 space-y-8">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-serif font-bold text-white tracking-wide">Elite Operational Principles</h3>
              <p className="text-xs text-[#6E7383] max-w-xl mx-auto">Our rigorous methodology guarantees high-value skill returns within the sovereign peer community.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-[#16171E]/60 border border-[#23252F] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-[#C5A880] text-sm font-mono font-bold">01 /</span>
                  <h5 className="text-xs uppercase font-bold text-white tracking-wider">Asymmetric Value Architecture</h5>
                </div>
                <p className="text-xs text-[#8E94A6] leading-relaxed font-light">
                  Traditional learning vectors force individuals into subscription models or micro-payments. Valoir values human cognitive hours equally. One hour of bespoke architectural engineering exchange equates strictly to one hour of elite linguistics guidance.
                </p>
              </div>

              <div className="bg-[#16171E]/60 border border-[#23252F] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-[#C5A880] text-sm font-mono font-bold">02 /</span>
                  <h5 className="text-xs uppercase font-bold text-white tracking-wider">Hyper-Local Geofenced Operations</h5>
                </div>
                <p className="text-xs text-[#8E94A6] leading-relaxed font-light">
                  Digital networking platforms create global noise, minimizing real actionable local human interaction. Our strict radius thresholds ensure matching partners exist inside an active parameter suitable for real-world mentorship.
                </p>
              </div>

              <div className="bg-[#16171E]/60 border border-[#23252F] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-[#C5A880] text-sm font-mono font-bold">03 /</span>
                  <h5 className="text-xs uppercase font-bold text-white tracking-wider">Curation Over Volume</h5>
                </div>
                <p className="text-xs text-[#8E94A6] leading-relaxed font-light">
                  Unlike wide open marketplaces, Valoir rejects general consumer catalog entries. Members must demonstrate dedicated focus areas, establishing a strict high-integrity talent standard for the community ledger.
                </p>
              </div>

              <div className="bg-[#16171E]/60 border border-[#23252F] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-[#C5A880] text-sm font-mono font-bold">04 /</span>
                  <h5 className="text-xs uppercase font-bold text-white tracking-wider">Zero Broker Dependency</h5>
                </div>
                <p className="text-xs text-[#8E94A6] leading-relaxed font-light">
                  Communication occurs entirely peer-to-peer. The system acts as a transparent matchmaking node, preventing centralized oversight, monetization, or tracking algorithms from diluting user connections.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#16171E] border border-[#23252F] rounded-2xl p-8 md:p-10 space-y-6">
            <h4 className="text-lg font-serif font-semibold text-white tracking-wide">Protocol Execution Sequence</h4>
            <div className="grid sm:grid-cols-4 gap-6 text-xs text-[#8E94A6] font-light">
              <div className="space-y-2">
                <strong className="block text-[#C5A880] font-semibold">01 / Profile Set</strong>
                <p>Register your geographic perimeter and outline your primary fields of proficiency.</p>
              </div>
              <div className="space-y-2">
                <strong className="block text-[#C5A880] font-semibold">02 / Publish Cards</strong>
                <p>Deploy localized offers (skills you train) or active requests (domains you seek to absorb).</p>
              </div>
              <div className="space-y-2">
                <strong className="block text-[#C5A880] font-semibold">03 / Initialize Swaps</strong>
                <p>Review peer matching feeds inside your active dynamic radius and open communication.</p>
              </div>
              <div className="space-y-2">
                <strong className="block text-[#C5A880] font-semibold">04 / Ledger Log</strong>
                <p>Conclude mutual handshakes and archive structured interaction tracking history safely.</p>
              </div>
            </div>
          </div>

        </section>
      )}

      {/* CORE ACTIVE WORKSPACE CONTENT */}
      {user && activeTab !== "concept" && (
        <div className="max-w-7xl mx-auto px-6 py-12">
          
          {/* PROFILE FILLUP INTERCEPTOR */}
          {!isProfileComplete ? (
            <div className="max-w-md mx-auto bg-[#16171E] border border-[#23252F] rounded-2xl p-8 shadow-xl">
              <div className="text-center mb-6">
                <span className="text-[10px] font-bold text-[#C5A880] uppercase tracking-widest">Onboarding Ledger</span>
                <h3 className="text-lg font-serif font-bold text-white mt-1">Complete Identity Profile</h3>
              </div>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-1">Your Suburb / District Location</label>
                  <input type="text" placeholder="E.g. Rawalpindi, Punjab" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-[#1F212A] border border-[#2D303E] text-xs text-white outline-none focus:border-[#C5A880]" required />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-1">Briefly outline your trade domains</label>
                  <textarea placeholder="List core fields you look to exchange..." value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className="w-full px-4 py-2.5 rounded-lg bg-[#1F212A] border border-[#2D303E] text-xs text-white outline-none focus:border-[#C5A880] resize-none" required />
                </div>
                <button type="submit" disabled={updatingProfile} className="w-full bg-[#C5A880] hover:bg-[#B3966D] text-[#16171E] font-bold py-3 rounded-lg text-xs uppercase tracking-wide transition-all">
                  Activate Workspace Access
                </button>
              </form>
            </div>
          ) : (
            
            <div className="space-y-12">
              
              {/* CHAT OVERLAY WINDOW FRAME */}
              {activeChatUser && activeChatListing && (
                <div className="bg-[#16171E] border border-[#C5A880]/40 rounded-2xl p-6 shadow-2xl space-y-4 max-w-2xl mx-auto animate-fade-in">
                  <div className="flex justify-between items-start border-b border-[#23252F] pb-4">
                    <div>
                      <span className="text-[9px] font-bold uppercase bg-[#1F212A] text-[#C5A880] px-2.5 py-0.5 rounded">Live Transaction Room</span>
                      <h4 className="text-sm font-bold text-white mt-2">Chat with: {activeChatUser.name}</h4>
                      <p className="text-xs text-[#8E94A6]">Regarding card: <span className="text-[#C5A880]">"{activeChatListing.title}"</span></p>
                    </div>
                    <button onClick={() => { setActiveChatUser(null); setActiveChatListing(null); }} className="text-[10px] px-2.5 py-1.5 bg-[#1F212A] text-[#A0A5B5] hover:text-white rounded-lg border border-[#2D303E] transition-all">Minimize Window ×</button>
                  </div>

                  <div className="h-64 overflow-y-auto space-y-3 p-4 bg-[#0F1015] border border-[#23252F] rounded-xl">
                    {messages.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-center">
                        <p className="text-xs text-[#6E7383] italic">No conversational ledger history found. Send a query below to propose swap rules.</p>
                      </div>
                    ) : (
                      messages.map((m: any, i: number) => {
                        const isMe = m.sender_id === user.id
                        return (
                          <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] px-4 py-2 rounded-xl text-xs ${isMe ? "bg-[#C5A880] text-[#16171E] font-medium" : "bg-[#1F212A] text-white border border-[#2D303E]"}`}>
                              <p className="leading-relaxed">{m.content}</p>
                            </div>
                          </div>
                        )
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <form onSubmit={sendChatMessage} className="flex gap-2">
                    <input type="text" placeholder="Propose exact availability parameters..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="flex-1 px-4 py-3 bg-[#1F212A] border border-[#2D303E] text-xs text-white rounded-lg outline-none focus:border-[#C5A880] transition-all" required />
                    <button type="submit" disabled={sendingMsg} className="bg-[#C5A880] hover:bg-[#B3966D] text-[#16171E] text-xs font-bold px-5 rounded-lg uppercase tracking-wide transition-all">Send</button>
                  </form>
                </div>
              )}

              {/* VIEW 1: EXPLORE CATALOG */}
              {activeTab === "explore" && (
                <div className="space-y-8 animate-fade-in">
                  
                  <div className="bg-[#16171E] border border-[#23252F] rounded-2xl p-6 shadow-sm">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
                      <div className="lg:col-span-6">
                        <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-2">Refine Filter Keywords</label>
                        <input type="text" placeholder="Lookup skill labels, titles, locations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-4 py-2.5 bg-[#1F212A] border border-[#2D303E] text-xs text-white rounded-lg outline-none focus:border-[#C5A880] transition-all" />
                      </div>
                      
                      <div className="lg:col-span-3">
                        <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-2">Skill Domains</label>
                        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full px-3 py-2.5 bg-[#1F212A] border border-[#2D303E] text-xs text-white rounded-lg outline-none focus:border-[#C5A880]">
                          <option value="All">All Categories</option>
                          <option value="Technology">Technology</option>
                          <option value="Music">Music</option>
                          <option value="Cooking">Cooking</option>
                          <option value="Languages">Languages</option>
                          <option value="Crafts & Art">Crafts & Art</option>
                        </select>
                      </div>

                      <div className="lg:col-span-3">
                        <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-2">Intent Direction</label>
                        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full px-3 py-2.5 bg-[#1F212A] border border-[#2D303E] text-xs text-white rounded-lg outline-none focus:border-[#C5A880]">
                          <option value="All">All Operations</option>
                          <option value="offer">Offers (Teaches)</option>
                          <option value="request">Requests (Seeks)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {listings.length === 0 ? (
                      <div className="col-span-full bg-[#16171E] border border-[#23252F] rounded-2xl p-16 text-center text-[#6E7383] italic text-xs">No entries match your specific filters.</div>
                    ) : (
                      listings.map((item) => {
                        const isMyOwn = item.user_id === user.id
                        return (
                          <div key={item.id} className="bg-[#16171E] border border-[#23252F] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6 hover:border-[#3A3E4F] transition-all">
                            <div className="space-y-4">
                              <div className="flex justify-between items-center">
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${item.type === "offer" ? "bg-[#1B2A22] text-[#52B774]" : "bg-[#182930] text-[#47A3B8]"}`}>
                                  {item.type === "offer" ? "💡 Teaches" : "🔍 Seeks"}
                                </span>
                                <span className="text-[10px] text-[#A0A5B5] bg-[#1F212A] px-2 py-0.5 rounded font-medium">{item.category}</span>
                              </div>
                              
                              <div>
                                <h4 className="text-base font-serif font-bold text-white tracking-tight">{item.title}</h4>
                                <p className="text-xs text-[#8E94A6] font-light leading-relaxed mt-2 line-clamp-3">{item.description}</p>
                              </div>
                            </div>

                            <div className="border-t border-[#1F212A] pt-4 space-y-4">
                              <div className="flex justify-between text-[10px] text-[#6E7383]">
                                <span>Owner: <strong className="text-[#C5A880] font-medium">{isMyOwn ? "You" : item.profiles?.name}</strong></span>
                                <span className="italic">{item.profiles?.location || "Global"} ({item.radius_km} km)</span>
                              </div>

                              {isMyOwn ? (
                                <button onClick={() => deleteListing(item.id)} className="w-full py-2 bg-red-950/30 text-[#E07A7A] border border-red-900/40 hover:bg-red-950/60 text-xs font-medium rounded-lg transition-all">🗑️ Delete From Public Catalog</button>
                              ) : (
                                <button 
                                  onClick={() => openChatWindow(item.profiles, item)} 
                                  className="w-full py-2.5 bg-[#C5A880] hover:bg-[#B3966D] text-[#16171E] text-xs font-bold uppercase tracking-wider rounded-lg transition-all text-center block shadow-sm"
                                >
                                  💬 Propose Exchange Swap
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                </div>
              )}

              {/* VIEW 2: INDEPENDENT PUBLISH FORM */}
              {activeTab === "publish" && (
                <div className="max-w-xl mx-auto bg-[#16171E] border border-[#23252F] rounded-2xl p-8 shadow-md space-y-6 animate-fade-in">
                  <div>
                    <h3 className="text-lg font-serif font-bold text-[#C5A880]">Deploy New Exchange Card</h3>
                    <p className="text-xs text-[#8E94A6] mt-1">Specify parameters clearly to maintain pure intent alignment.</p>
                  </div>

                  <form onSubmit={addListing} className="space-y-6">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-2">Intent Direction</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => setType("offer")} className={`py-3 rounded-lg text-xs font-bold border transition-all ${type === "offer" ? "bg-[#C5A880] border-[#C5A880] text-[#16171E]" : "bg-[#1F212A] border-[#2D303E] text-[#6E7383] hover:text-white"}`}>I Wish to Teach Skill</button>
                        <button type="button" onClick={() => setType("request")} className={`py-3 rounded-lg text-xs font-bold border transition-all ${type === "request" ? "bg-[#C5A880] border-[#C5A880] text-[#16171E]" : "bg-[#1F212A] border-[#2D303E] text-[#6E7383] hover:text-white"}`}>I Wish to Request Skill</button>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-1">Subject Title Line</label>
                        <input type="text" placeholder="E.g. Advanced Piano Craft" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2.5 bg-[#1F212A] border border-[#2D303E] text-xs text-white rounded-lg outline-none focus:border-[#C5A880]" required />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-1">Domain Class</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2.5 bg-[#1F212A] border border-[#2D303E] text-xs text-white rounded-lg outline-none focus:border-[#C5A880]">
                          <option value="Technology">Technology</option>
                          <option value="Music">Music</option>
                          <option value="Cooking">Cooking</option>
                          <option value="Languages">Languages</option>
                          <option value="Crafts & Art">Crafts & Art</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-[#8E94A6] mb-1">Detailed Description Requirements</label>
                      <textarea placeholder="Outline clearly what you want to learn vs what you are ready to teach in return..." value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="w-full px-3 py-2 bg-[#1F212A] border border-[#2D303E] text-xs text-white rounded-lg outline-none focus:border-[#C5A880] resize-none leading-relaxed" required />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] uppercase font-bold text-[#8E94A6] mb-1">
                        <span>Search Range Threshold</span>
                        <strong className="text-[#C5A880]">{radiusKm} KM Radius</strong>
                      </div>
                      <input type="range" min="1" max="100" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="w-full accent-[#C5A880] h-1 bg-[#2D303E] rounded-lg cursor-pointer" />
                    </div>

                    <button type="submit" disabled={posting} className="w-full py-3 bg-[#C5A880] hover:bg-[#B3966D] text-[#16171E] text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-md">
                      Publish Card Entry
                    </button>
                  </form>
                </div>
              )}

              {/* VIEW 3: SEPARATED CLEAN EXCHANGE HUB */}
              {activeTab === "dashboard" && (
                <div className="space-y-10 animate-fade-in">
                  
                  <div className="bg-[#16171E] border border-[#23252F] rounded-2xl p-8 shadow-sm grid md:grid-cols-3 gap-8">
                    <div className="space-y-2 md:border-r border-[#2D303E] pr-4">
                      <span className="text-[10px] font-bold text-[#6E7383] uppercase tracking-widest">TRANSACTION OVERVIEW</span>
                      <h3 className="text-xl font-serif font-semibold text-[#C5A880]">Ledger Metrics</h3>
                      <p className="text-xs text-[#8E94A6]">Realtime metrics mapping active incoming messages and outbox logs.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 col-span-2">
                      <div className="bg-[#1F212A] border border-[#2D303E] p-4 rounded-xl">
                        <span className="block text-3xl font-bold text-white">{receivedConnections.length}</span>
                        <span className="text-[10px] uppercase font-semibold text-[#8E94A6]">Incoming Responses (Inbox)</span>
                      </div>
                      <div className="bg-[#1F212A] border border-[#2D303E] p-4 rounded-xl">
                        <span className="block text-3xl font-bold text-white">{sentConnections.length}</span>
                        <span className="text-[10px] uppercase font-semibold text-[#8E94A6]">Outgoing Swaps Pending</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#16171E] border border-[#23252F] rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#1F212A] pb-3">
                      <span className="text-sm">📥</span>
                      <h4 className="text-xs uppercase font-bold text-white tracking-wider">Incoming Communication Requests (Inbox)</h4>
                    </div>

                    {receivedConnections.length === 0 ? (
                      <p className="text-xs text-[#6E7383] italic py-2">No external members have initiated proposals on your cards yet.</p>
                    ) : (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {receivedConnections.map((conn, idx) => (
                          <div key={idx} className="border border-[#2D303E] bg-[#1F212A] rounded-xl p-5 flex flex-col justify-between space-y-4">
                            <div>
                              <div className="flex justify-between items-center">
                                <span className="text-[9px] font-bold uppercase bg-[#1B2A22] text-[#52B774] px-2 py-0.5 rounded">Received Thread</span>
                                <span className="text-[9px] text-[#6E7383] font-medium">{conn.listing.category}</span>
                              </div>
                              <h5 className="text-xs font-bold text-white mt-3 line-clamp-1">Your Post: "{conn.listing.title}"</h5>
                              <p className="text-[11px] text-[#A0A5B5] mt-1">From Candidate: <strong className="text-[#C5A880] font-medium">{conn.otherUser.name}</strong></p>
                              <p className="text-[11px] text-[#8E94A6] italic line-clamp-1 mt-2 bg-[#16171E] p-2 border border-[#23252F] rounded-lg">Last: "{conn.lastMessage}"</p>
                            </div>
                            <button 
                              onClick={() => openChatWindow(conn.otherUser, conn.listing)} 
                              className="w-full text-center py-2 bg-[#C5A880] text-[#16171E] hover:bg-[#B3966D] text-xs font-bold rounded-lg transition-all"
                            >
                              💬 Open Chat Inbox
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-[#16171E] border border-[#23252F] rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#1F212A] pb-3">
                      <span className="text-sm">📤</span>
                      <h4 className="text-xs uppercase font-bold text-white tracking-wider">Outgoing Swap Initializations (Outbox)</h4>
                    </div>

                    {sentConnections.length === 0 ? (
                      <p className="text-xs text-[#6E7383] italic py-2">You have not proposed communication to any external cards yet.</p>
                    ) : (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sentConnections.map((conn, idx) => (
                          <div key={idx} className="border border-[#2D303E] bg-[#1F212A] rounded-xl p-5 flex flex-col justify-between space-y-4">
                            <div>
                              <div className="flex justify-between items-center">
                                <span className="text-[9px] font-bold uppercase bg-[#242736] text-[#A0A5B5] px-2 py-0.5 rounded">Sent Request</span>
                                <span className="text-[9px] text-[#6E7383] font-medium">{conn.listing.category}</span>
                              </div>
                              <h5 className="text-xs font-bold text-white mt-3 line-clamp-1">Target Post: "{conn.listing.title}"</h5>
                              <p className="text-[11px] text-[#A0A5B5] mt-1">Recipient Craftsman: <strong className="text-[#C5A880] font-medium">{conn.otherUser.name}</strong></p>
                            </div>
                            <button 
                              onClick={() => openChatWindow(conn.otherUser, conn.listing)} 
                              className="w-full text-center py-2 bg-transparent border border-[#2D303E] hover:bg-[#2D303E] text-white text-xs font-bold rounded-lg transition-all"
                            >
                              💬 Review Conversation
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          )}

        </div>
      )}

    </div>
  )
}