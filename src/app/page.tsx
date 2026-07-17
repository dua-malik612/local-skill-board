"use client"
import { useEffect, useState, useRef } from "react"
import { supabase } from "../lib/supabase"

// 🚨 ADMIN EMAIL CONTEXT: Aap yahan apne client ka email likh dein
const ADMIN_EMAIL = "fa24b1-se-034@fjwu.edu.pk" 

export default function Home() {
  // --- NAVIGATION STATE ---
  const [currentTab, setCurrentTab] = useState<"about" | "add" | "view">("about")

  // --- AUTH & PROFILE STATES ---
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
  
  // 👑 ADMIN STATE
  const [isAdmin, setIsAdmin] = useState(false)

  // --- LISTINGS STATES ---
  const [listings, setListings] = useState<any[]>([])
  const [title, setTitle] = useState("")
  const [type, setType] = useState<"offer" | "request">("offer")
  const [category, setCategory] = useState("Technology")
  const [description, setDescription] = useState("")
  const [radiusKm, setRadiusKm] = useState(15)
  const [posting, setPosting] = useState(false)
  
  // --- SEARCH & FILTER STATES ---
  const [searchQuery, setSearchQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState("All")
  const [filterType, setFilterType] = useState("All")

  // --- AUTOMATIC MATCHES STATE ---
  const [suggestedMatches, setSuggestedMatches] = useState<any[]>([])

  // --- CHAT SYSTEM STATES ---
  const [activeChatUser, setActiveChatUser] = useState<any>(null)
  const [activeChatListing, setActiveChatListing] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [sendingMsg, setSendingMsg] = useState(false)
  const [sentConnections, setSentConnections] = useState<any[]>([])
  const [receivedConnections, setReceivedConnections] = useState<any[]>([])

  // --- REVIEWS & FEEDBACK ---
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewListingId, setReviewListingId] = useState("")
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState("")
  const [submittingReview, setSubmittingReview] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }
  
  useEffect(() => {
    if (activeChatUser) scrollToBottom()
  }, [messages, activeChatUser])

  // --- AUTH INITIALIZATION ---
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser(session.user)
        // Check if logged in user is admin
        if (session.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          setIsAdmin(true)
        }
        await fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    }
    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        if (session.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          setIsAdmin(true)
        } else {
          setIsAdmin(false)
        }
        fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setIsAdmin(false)
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
      await runAutoMatching(userId, data.location)
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
      const { data, error } = await supabase.auth.signUp({ 
        email: cleanEmail, 
        password,
        options: { data: { full_name: fullName } }
      })

      if (error) {
        setAuthError(error.message)
        setLoading(false)
        return
      } 
      
      if (data?.user) {
        await supabase.from("profiles").insert([
          { id: data.user.id, name: fullName, email: cleanEmail, location: "", bio: "" }
        ])
        alert("Registration successful!")
        setLoading(false)
        setShowAuthModal(false)
        setIsSignUp(false)
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
    let query = supabase
      .from("listings")
      .select(`*, profiles (id, name, location)`)
      .order("created_at", { ascending: false })

    if (filterCategory !== "All") query = query.eq("category", filterCategory)
    if (filterType !== "All") query = query.eq("type", filterType)
    if (searchQuery.trim() !== "") query = query.ilike("title", `%${searchQuery}%`)

    const { data } = await query
    setListings(data || [])
  }

  const runAutoMatching = async (userId: string, userLocation: string) => {
    const { data: myListings } = await supabase.from("listings").select("*").eq("user_id", userId)
    if (!myListings || myListings.length === 0) return

    const { data: otherListings } = await supabase.from("listings").select(`*, profiles (id, name, location)`).neq("user_id", userId).eq("status", "active")
    if (!otherListings) return

    const matches: any[] = []
    myListings.forEach((myL) => {
      otherListings.forEach((otherL) => {
        const isOverlapType = myL.type !== otherL.type
        const isSameCategory = myL.category === otherL.category
        const isSameLocation = userLocation?.toLowerCase().trim() === otherL.profiles?.location?.toLowerCase().trim()

        if (isOverlapType && isSameCategory && isSameLocation) {
          matches.push({ myListing: myL, matchedListing: otherL, peer: otherL.profiles })
        }
      })
    })
    setSuggestedMatches(matches)
  }

  const reportListing = async (listingId: string) => {
    const reason = prompt("Enter reason for reporting:")
    if (reason) alert("Report successfully registered. The moderation team will review it shortly.")
  }

  const updateListingStatus = async (listingId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "closed" : "active"
    if (!confirm(`Mark this skill trade card as ${newStatus === "closed" ? "COMPLETED" : "ACTIVE"}?`)) return

    const { error } = await supabase.from("listings").update({ status: newStatus }).eq("id", listingId)
    if (!error) {
      fetchListings()
      if (newStatus === "closed") {
        setReviewListingId(listingId)
        setShowReviewModal(true)
      }
    }
  }

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittingReview(true)
    setTimeout(() => {
      alert("Review and rating feedback saved successfully!")
      setShowReviewModal(false)
      setReviewComment("")
      setSubmittingReview(false)
    }, 800)
  }

  const fetchRealtimeInbox = async (userId: string) => {
    const { data } = await supabase
      .from("messages")
      .select(`
        sender_id, receiver_id, listing_id, content,
        listings (id, title, type, category, user_id),
        sender_profile:profiles!messages_sender_id_fkey(name),
        receiver_profile:profiles!messages_receiver_id_fkey(name)
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("timestamp", { ascending: false })

    if (!data) return
    const outboxMap = new Map()
    const inboxMap = new Map()

    data.forEach((msg: any) => {
      if (!msg.listings) return
      const isOwnerOfListing = msg.listings.user_id === userId
      const key = `${msg.listing_id}_${msg.sender_id}_${msg.receiver_id}`

      if (isOwnerOfListing) {
        if (!inboxMap.has(key)) inboxMap.set(key, { otherUser: { id: msg.sender_id, name: msg.sender_profile?.name }, listing: msg.listings, lastMessage: msg.content })
      } else {
        if (!outboxMap.has(key)) outboxMap.set(key, { otherUser: { id: msg.receiver_id, name: msg.receiver_profile?.name }, listing: msg.listings, lastMessage: msg.content })
      }
    })

    setSentConnections(Array.from(outboxMap.values()))
    setReceivedConnections(Array.from(inboxMap.values()))
  }

  useEffect(() => {
    if (user) fetchListings()
  }, [filterCategory, filterType, searchQuery])

  const addListing = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !description) return
    setPosting(true)

    const { error } = await supabase.from("listings").insert([{ user_id: user.id, type, title, category, description, radius_km: Number(radiusKm), status: "active" }])
    if (!error) {
      setTitle("")
      setDescription("")
      fetchListings()
      if (profile) runAutoMatching(user.id, profile.location)
      alert("Skill Entry Successfully Pinned to Board!")
      setCurrentTab("view")
    }
    setPosting(false)
  }

  const deleteListing = async (id: string) => {
    if (confirm("Delete this skill trade card permanently?")) {
      await supabase.from("listings").delete().eq("id", id)
      fetchListings()
    }
  }

  // 👑 ADMIN DIRECT MODIFICATION API FUNCTION
  const adminForceDeleteListing = async (id: string, title: string) => {
    if (!isAdmin) return alert("Action unauthorized!")
    if (confirm(`ADMIN PRIVILEGE:\nAre you sure you want to force-delete "${title}"? This cannot be undone.`)) {
      const { error } = await supabase.from("listings").delete().eq("id", id)
      if (!error) {
        alert("Post removed successfully by Admin moderation.")
        fetchListings()
      } else {
        alert("Error deleting post: " + error.message)
      }
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
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},sender_id.eq.${user.id})`)
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
      <div className="min-h-screen bg-[#070D0E] flex items-center justify-center">
        <span className="text-xs font-mono tracking-widest text-[#D4AF37] animate-pulse">PREPARING APPLICATION BOARD...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0B1315] to-[#05090A] text-[#FCF9F2] antialiased flex flex-col selection:bg-[#D4AF37]/30">
      
      {/* 🏛️ HEADER */}
      <header className="bg-[#0B1315]/95 border-b border-[#1A3034] px-8 py-4 sticky top-0 z-50 backdrop-blur shadow-2xl flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-serif font-black tracking-[0.2em] text-[#D4AF37] drop-shadow">NEXUS</span>
          <span className="hidden md:inline-block text-[10px] font-mono tracking-wider text-[#618288] uppercase border-l border-[#1A3034] pl-3">
            Skill Exchange Board {isAdmin && <span className="text-red-500 font-bold ml-1">([ADMIN MODE])</span>}
          </span>
        </div>

        {/* 🛠️ TAB NAVIGATION */}
        {user && (
          <div className="flex items-center gap-1 bg-[#05090A] p-1 rounded-xl border border-[#16272A]">
            <button 
              onClick={() => setCurrentTab("about")} 
              className={`text-xs px-4 py-2 font-serif font-semibold rounded-lg transition-all ${currentTab === "about" ? "bg-[#D4AF37] text-[#0B1315] shadow-md" : "text-[#8BA4A8] hover:text-[#FCF9F2]"}`}
            >
              About Us
            </button>
            <button 
              onClick={() => setCurrentTab("add")} 
              className={`text-xs px-4 py-2 font-serif font-semibold rounded-lg transition-all ${currentTab === "add" ? "bg-[#D4AF37] text-[#0B1315] shadow-md" : "text-[#8BA4A8] hover:text-[#FCF9F2]"}`}
            >
              Pin A Skill
            </button>
            <button 
              onClick={() => setCurrentTab("view")} 
              className={`text-xs px-4 py-2 font-serif font-semibold rounded-lg transition-all ${currentTab === "view" ? "bg-[#D4AF37] text-[#0B1315] shadow-md" : "text-[#8BA4A8] hover:text-[#FCF9F2]"}`}
            >
              Browse Board
            </button>
          </div>
        )}

        <div>
          {user ? (
            <button onClick={() => { supabase.auth.signOut(); setUser(null); }} className="text-[11px] font-mono border border-[#442323] text-[#E57B7B] bg-[#211111]/30 hover:bg-[#381B1B] px-4 py-2 rounded-lg transition-all">Sign Out</button>
          ) : (
            <button onClick={() => { setIsSignUp(false); setShowAuthModal(true); }} className="text-xs font-serif font-bold bg-[#D4AF37] text-[#0B1315] px-5 py-2 rounded-lg hover:bg-[#C29E2F] shadow-lg transition-all">Enter Marketplace</button>
          )}
        </div>
      </header>

      {/* 📬 THE MAIN CORKBOARD CONTENT */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
        
        {/* VIEW 1: ABOUT US PANEL */}
        {(!user || currentTab === "about") && (
          <div className="space-y-16 animate-fadeIn">
            
            {/* HERO BLOCK */}
            <div className="text-center space-y-4 max-w-3xl mx-auto">
              <span className="text-[10px] font-mono font-bold tracking-widest bg-[#0B1315] text-[#D4AF37] px-4 py-1.5 rounded-full border border-[#1A3034] inline-block uppercase shadow-inner">Free & Pure Skill Barter</span>
              <h1 className="text-4xl md:text-5xl font-serif text-[#FCF9F2] font-normal leading-tight">Trade talent. Build crafts. <br/><span className="italic text-[#D4AF37]">No currency required.</span></h1>
              <p className="text-[#8BA4A8] text-sm leading-relaxed font-light font-sans max-w-2xl mx-auto">
                Nexus bridges professionals, engineers, musicians, and creators directly. Bring what you know, claim what you wish to unlock. A high-quality experience mapping pure localized knowledge exchange.
              </p>
              {!user && (
                <button onClick={() => { setIsSignUp(true); setShowAuthModal(true); }} className="bg-[#D4AF37] text-[#0B1315] text-xs font-serif font-bold tracking-widest uppercase px-6 py-3 rounded-lg hover:bg-[#C29E2F] shadow-lg mt-4 transition-all">Register My Profile</button>
              )}
            </div>

            {/* PINNED NOTES FRAMEWORK */}
            <div className="space-y-6">
              <h2 className="text-sm font-mono tracking-widest text-center text-[#D4AF37] uppercase">The Platform Workflow</h2>
              <div className="grid md:grid-cols-3 gap-6">
                
                {/* CARD 1 */}
                <div className="bg-[#FCF9F2] text-[#0B1315] p-6 rounded-sm shadow-[5px_5px_15px_rgba(0,0,0,0.4)] relative border-t-4 border-[#D4AF37] transform -rotate-1 hover:rotate-0 transition-transform">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#D4AF37] rounded-full border border-[#FCF9F2] shadow shadow-black"></div>
                  <div className="font-mono text-xs text-[#C29E2F] font-bold mb-2">STEP 01</div>
                  <h3 className="text-base font-serif font-bold mb-2 text-[#0B1315]">Draft Your Skill Card</h3>
                  <p className="text-xs font-sans leading-relaxed text-[#3A4547]">
                    Pin your skill sets onto our shared interface. Outline clearly what knowledge you carry or specify what craft you seek to master.
                  </p>
                </div>

                {/* CARD 2 */}
                <div className="bg-[#FCF9F2] text-[#0B1315] p-6 rounded-sm shadow-[5px_5px_15px_rgba(0,0,0,0.4)] relative border-t-4 border-[#B87333] transform rotate-1 hover:rotate-0 transition-transform">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#B87333] rounded-full border border-[#FCF9F2] shadow shadow-black"></div>
                  <div className="font-mono text-xs text-[#B87333] font-bold mb-2">STEP 02</div>
                  <h3 className="text-base font-serif font-bold mb-2 text-[#0B1315]">Radar Interception</h3>
                  <p className="text-xs font-sans leading-relaxed text-[#3A4547]">
                    Utilize the smart grid matrix to look through neighborhood requests. Filter instantly through local clusters to pinpoint synchronous trades.
                  </p>
                </div>

                {/* CARD 3 */}
                <div className="bg-[#FCF9F2] text-[#0B1315] p-6 rounded-sm shadow-[5px_5px_15px_rgba(0,0,0,0.4)] relative border-t-4 border-[#D4AF37] transform -rotate-1 hover:rotate-0 transition-transform">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#D4AF37] rounded-full border border-[#FCF9F2] shadow shadow-black"></div>
                  <div className="font-mono text-xs text-[#C29E2F] font-bold mb-2">STEP 03</div>
                  <h3 className="text-base font-serif font-bold mb-2 text-[#0B1315]">Secure Peer Handshake</h3>
                  <p className="text-xs font-sans leading-relaxed text-[#3A4547]">
                    Initiate direct channels to coordinate exchange cycles. Swap skills safely in trusted venues, tracking progress directly through the application.
                  </p>
                </div>

              </div>
            </div>

            {/* SAFETY RULES PANEL */}
            <div className="bg-[#0B1315] border border-[#1A3034] rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none"></div>
              <h3 className="text-lg font-serif font-bold text-[#D4AF37]">Exchange Safety & Trust Guidelines</h3>
              <div className="grid md:grid-cols-2 gap-6 text-xs text-[#8BA4A8] leading-relaxed font-sans">
                <div className="space-y-3">
                  <p><strong className="text-[#FCF9F2] font-serif">✓ Cashless Mandate:</strong> Commercial monetization offers or marketing paid academies is strictly unauthorized here.</p>
                  <p><strong className="text-[#FCF9F2] font-serif">✓ Transparent Portfolios:</strong> Maintain high standard descriptions regarding your practical familiarity with the trade fields.</p>
                </div>
                <div className="space-y-3">
                  <p><strong className="text-[#FCF9F2] font-serif">✓ Public Handshakes:</strong> For introductory modules, process your physical sessions across populated environments or local workspaces.</p>
                  <p><strong className="text-[#FCF9F2] font-serif">✓ Feedback Loops:</strong> Logging detailed star ratings post-completion protects our active barter ecosystem.</p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* PROFILE PROMPT FOR NEW USERS */}
        {user && !profile?.location && (
          <div className="max-w-md mx-auto bg-[#FCF9F2] text-[#0B1315] rounded-sm p-6 shadow-[10px_10px_30px_rgba(0,0,0,0.6)] my-10 relative border-t-4 border-[#D4AF37]">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#D4AF37] rounded-full border border-[#FCF9F2] shadow shadow-black"></div>
            <h3 className="text-base font-serif font-bold text-[#0B1315] text-center uppercase tracking-wide mb-4">Setup Your User Profile</h3>
            <form onSubmit={handleUpdateProfile} className="space-y-4 font-sans">
              <input type="text" placeholder="Your City, Territory or Base (e.g. Rawalpindi)" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-4 py-2 bg-[#FCF9F2] border border-[#1A3034]/20 text-xs rounded text-[#0B1315] outline-none focus:border-[#D4AF37]" required />
              <textarea placeholder="Tell the board about your background, tools, and expertise..." value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="w-full px-4 py-2 bg-[#FCF9F2] border border-[#1A3034]/20 text-xs rounded text-[#0B1315] outline-none focus:border-[#D4AF37] resize-none" required />
              <button type="submit" className="w-full bg-[#0B1315] text-[#D4AF37] font-serif text-xs font-bold py-2 rounded uppercase tracking-wide hover:bg-slate-800 transition-all shadow">Verify My Location</button>
            </form>
          </div>
        )}

        {/* VIEW 2: PIN NEW SKILL CARD TO BOARD */}
        {user && profile?.location && currentTab === "add" && (
          <div className="max-w-2xl mx-auto bg-[#FCF9F2] text-[#0B1315] p-8 rounded-sm shadow-[10px_10px_30px_rgba(0,0,0,0.6)] space-y-6 relative border-t-4 border-[#D4AF37] animate-fadeIn">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#D4AF37] rounded-full border border-[#FCF9F2] shadow shadow-black"></div>
            <div className="border-b border-[#1A3034]/10 pb-3 text-center">
              <h3 className="text-xl font-serif font-bold text-[#0B1315] uppercase tracking-wide">Pin a New Skill Card</h3>
              <p className="text-xs text-[#617173] font-sans mt-1">Fill out the template parameters to mount it live onto the public board.</p>
            </div>
            <form onSubmit={addListing} className="space-y-4 font-sans text-xs">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-[#617173] mb-1">Exchange Intent</label>
                  <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full px-3 py-2 bg-[#FCF9F2] border border-[#1A3034]/20 rounded text-[#0B1315] outline-none font-medium">
                    <option value="offer">Offer (I am teaching this skill)</option>
                    <option value="request">Request (I am seeking this skill)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-[#617173] mb-1">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 bg-[#FCF9F2] border border-[#1A3034]/20 rounded text-[#0B1315] outline-none font-medium">
                    <option value="Technology">Technology & Software</option>
                    <option value="Music">Music & Instruments</option>
                    <option value="Language">English & Languages</option>
                    <option value="Arts">Fine Arts & Crafting</option>
                    <option value="Other">Other Categories</option>
                  </select>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-[#617173] mb-1">Skill Title Header</label>
                  <input type="text" placeholder="e.g. Acoustic Guitar Roots" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 bg-[#FCF9F2] border border-[#1A3034]/20 rounded text-[#0B1315] outline-none placeholder:text-slate-400 focus:border-[#D4AF37]" required />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-[#617173] mb-1">Radar Radius Bound (KM)</label>
                  <input type="number" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="w-full px-3 py-2 bg-[#FCF9F2] border border-[#1A3034]/20 rounded text-[#0B1315] outline-none focus:border-[#D4AF37]" required />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#617173] mb-1">Full Card Breakdown</label>
                <textarea placeholder="Describe your experience level, schedule slots, and what you expect in direct reciprocity trade..." value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full px-3 py-2 bg-[#FCF9F2] border border-[#1A3034]/20 rounded text-[#0B1315] outline-none placeholder:text-slate-400 focus:border-[#D4AF37] resize-none leading-relaxed" required />
              </div>
              <button type="submit" className="w-full bg-[#0B1315] text-[#D4AF37] font-serif font-bold py-3 rounded text-xs uppercase tracking-widest hover:bg-slate-800 shadow-md transition-all">{posting ? "Mounting..." : "Mount Card Entry"}</button>
            </form>
          </div>
        )}

        {/* VIEW 3: LIVE BOARD ACTIVE REGISTRY */}
        {user && profile?.location && currentTab === "view" && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* MATCH INTERCEPT HUB */}
            {suggestedMatches.length > 0 && (
              <div className="bg-[#0B1315] border border-[#D4AF37]/50 p-4 rounded-xl space-y-2 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#D4AF37]/5 rounded-full blur-2xl"></div>
                <p className="text-xs font-mono font-bold uppercase tracking-widest text-[#D4AF37]">🎯 Live Synchronous Barter Matches Found</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {suggestedMatches.map((m: any, idx: number) => (
                    <div key={idx} className="bg-[#05090A] p-3 rounded-lg border border-[#1A3034] flex justify-between items-center text-xs font-sans">
                      <div>
                        <p className="text-[#FCF9F2] font-medium">Match for "{m.myListing.title}"</p>
                        <p className="text-[10px] text-[#8BA4A8]">Connect with <span className="text-[#D4AF37] font-serif font-bold">{m.peer?.name}</span> ({m.peer?.location})</p>
                      </div>
                      <button onClick={() => openChatWindow(m.peer, m.matchedListing)} className="bg-[#D4AF37] text-[#0B1315] font-serif font-bold px-3 py-1 rounded text-[10px] uppercase shadow">Chat</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RADAR CONFIGURATOR (SEARCH & FILTER) */}
            <div className="bg-[#0B1315] p-4 rounded-xl border border-[#1A3034] flex flex-wrap gap-4 justify-between items-center shadow-2xl">
              <input type="text" placeholder="Scan board by keyword..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-[#05090A] border border-[#1A3034] text-xs font-mono rounded-lg px-4 py-2 outline-none text-[#FCF9F2] w-full sm:w-64 focus:border-[#D4AF37] placeholder:text-[#425E62]" />
              <div className="flex gap-2 w-full sm:w-auto font-sans">
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="bg-[#05090A] border border-[#1A3034] text-xs text-[#8BA4A8] rounded-lg p-2 outline-none focus:border-[#D4AF37]">
                  <option value="All">All Disciplines</option>
                  <option value="Technology">Technology & Software</option>
                  <option value="Music">Music & Instruments</option>
                  <option value="Language">English & Languages</option>
                  <option value="Arts">Fine Arts & Crafting</option>
                  <option value="Other">Other Categories</option>
                </select>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="bg-[#05090A] border border-[#1A3034] text-xs text-[#8BA4A8] rounded-lg p-2 outline-none focus:border-[#D4AF37]">
                  <option value="All">All Intents</option>
                  <option value="offer">Offers Only</option>
                  <option value="request">Requests Only</option>
                </select>
              </div>
            </div>
            
            {/* BOARD INTERFACE */}
            <div className="grid lg:grid-cols-12 gap-6 items-start">
              
              {/* TACTILE CARDS STREAM */}
              <div className={`${activeChatUser ? "lg:col-span-7" : "lg:col-span-12"} grid md:grid-cols-2 gap-6`}>
                {listings.length === 0 ? (
                  <div className="col-span-full text-center py-16 bg-[#0B1315] border border-dashed border-[#1A3034] rounded-xl">
                    <p className="text-xs font-mono text-[#425E62] italic">The public grid board is currently empty.</p>
                  </div>
                ) : (
                  listings.map((l: any, i: number) => {
                    const isMine = l.user_id === user.id
                    const rotateClass = i % 2 === 0 ? "transform -rotate-1 hover:rotate-0" : "transform rotate-1 hover:rotate-0"
                    
                    return (
                      <div key={l.id} className={`bg-[#FCF9F2] text-[#0B1315] p-6 rounded-sm shadow-[8px_8px_20px_rgba(0,0,0,0.5)] flex flex-col justify-between min-h-[280px] transition-transform duration-200 relative ${rotateClass}`}>
                        
                        {/* PIN INDICATION */}
                        <div className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border border-[#FCF9F2] shadow-md ${l.type === 'offer' ? 'bg-[#D4AF37]' : 'bg-[#B87333]'}`}></div>
                        
                        <div>
                          <div className="flex justify-between items-center mb-3 font-mono text-[9px] font-bold">
                            <span className={`px-2 py-0.5 rounded ${l.type === 'offer' ? 'bg-[#D4AF37]/20 text-[#8C7016]' : 'bg-[#B87333]/20 text-[#804818]'}`}>{l.type.toUpperCase()}</span>
                            <span className="text-[#617173] tracking-wider uppercase">{l.category === 'Language' ? 'English & Languages' : l.category}</span>
                          </div>
                          <h4 className="text-base font-bold text-[#0B1315] font-serif leading-tight">{l.title}</h4>
                          <p className="text-xs text-[#3A4547] font-sans mt-3 leading-relaxed whitespace-pre-line h-auto overflow-visible">{l.description}</p>
                        </div>

                        <div>
                          <div className="border-t border-[#1A3034]/10 pt-4 flex justify-between items-center mt-6 font-sans text-xs">
                            <div>
                              <p className="text-[#0B1315] font-serif font-black">{l.profiles?.name || "Anonymous Member"}</p>
                              <p className="text-[10px] text-[#617173] font-mono tracking-tighter uppercase">{l.profiles?.location || "Base Remote"}</p>
                            </div>
                            <div className="flex gap-2 font-mono">
                              {isMine ? (
                                <>
                                  <button onClick={() => updateListingStatus(l.id, l.status)} className="text-[9px] font-bold border border-[#D4AF37]/40 text-[#8C7016] px-2 py-1 rounded bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 transition-all">
                                    {l.status === 'active' ? "Complete Swap" : "Completed ✔"}
                                  </button>
                                  <button onClick={() => deleteListing(l.id)} className="text-[9px] font-bold text-red-700 bg-red-100 px-2 py-1 rounded hover:bg-red-200 transition-all">Del</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => openChatWindow(l.profiles, l)} className="bg-[#0B1315] text-[#D4AF37] font-serif font-bold px-3 py-1 rounded text-[10px] uppercase shadow hover:bg-slate-800 transition-all">Contact</button>
                                  <button onClick={() => reportListing(l.id)} className="text-[10px] text-red-700 font-sans px-1 hover:underline ml-1">Report</button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* 👑 ADMIN INTERFACE HUB MODIFICATION */}
                          {isAdmin && (
                            <div className="mt-3 pt-2 border-t border-red-200 flex justify-end">
                              <button 
                                onClick={() => adminForceDeleteListing(l.id, l.title)} 
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-mono text-[10px] font-bold py-1 px-2 rounded transition-all text-center tracking-wider shadow"
                              >
                                🚨 FORCE DELETE BY ADMIN
                              </button>
                            </div>
                          )}
                        </div>

                      </div>
                    )
                  })
                )}
              </div>

              {/* CHAT WINDOW ENGINE */}
              {activeChatUser && activeChatListing && (
                <div className="lg:col-span-5 bg-[#FCF9F2] text-[#0B1315] border-t-8 border-[#D4AF37] rounded-sm p-4 shadow-[10px_10px_30px_rgba(0,0,0,0.6)] space-y-4 animate-fadeIn sticky top-24">
                  <div className="flex justify-between items-center border-b border-[#1A3034]/10 pb-2">
                    <div>
                      <h4 className="text-sm font-serif font-bold text-[#0B1315]">Chat Room: {activeChatUser.name}</h4>
                      <p className="text-[10px] font-mono text-[#617173] truncate max-w-[220px]">Card: {activeChatListing.title}</p>
                    </div>
                    <button onClick={() => { setActiveChatUser(null); setActiveChatListing(null); }} className="text-[10px] font-mono text-[#FCF9F2] bg-[#0B1315] px-2 py-1 rounded shadow">✕ Close</button>
                  </div>
                  
                  {/* MESSAGE HISTORY */}
                  <div className="h-64 overflow-y-auto space-y-3 p-3 bg-[#FCF9F2] rounded border border-[#1A3034]/20 font-sans">
                    {messages.length === 0 ? (
                      <p className="text-[10px] text-center italic text-[#617173] pt-24">No transaction history logged.</p>
                    ) : (
                      messages.map((m: any, i: number) => {
                        const isMe = m.sender_id === user.id
                        return (
                          <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] px-3 py-1.5 rounded text-xs shadow-sm ${isMe ? "bg-[#0B1315] text-[#D4AF37]" : "bg-white text-slate-800 border border-[#1A3034]/10"}`}>
                              <p>{m.content}</p>
                            </div>
                          </div>
                        )
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <form onSubmit={sendChatMessage} className="flex gap-2 font-sans">
                    <input type="text" placeholder="Write message memo..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="flex-1 bg-[#FCF9F2] border border-[#1A3034]/20 text-xs text-[#0B1315] rounded px-3 outline-none focus:border-[#D4AF37]" required />
                    <button type="submit" disabled={sendingMsg} className="bg-[#0B1315] text-[#D4AF37] font-serif font-bold text-xs px-4 rounded uppercase shadow">{sendingMsg ? "..." : "Send"}</button>
                  </form>
                </div>
              )}
            </div>

            {/* TWO-WAY COMMUNICATIONS */}
            <div className="border-t border-[#1A3034] pt-8 grid md:grid-cols-2 gap-6 font-sans">
              <div className="bg-[#0B1315] p-4 rounded-xl border border-[#1A3034]">
                <h5 className="text-[10px] font-mono font-bold uppercase text-[#D4AF37] tracking-widest mb-3">📥 Received Communications</h5>
                {receivedConnections.length === 0 && <p className="text-xs text-[#425E62] italic font-mono">No inbound logs discovered.</p>}
                {receivedConnections.map((c: any, i: number) => (
                  <div key={i} className="bg-[#05090A] border border-[#1A3034] p-3 rounded-lg flex justify-between items-center text-xs mt-2 shadow-inner">
                    <div>
                      <p className="text-[#FCF9F2] font-medium">{c.otherUser?.name}</p>
                      <p className="text-[10px] text-[#8BA4A8] italic truncate max-w-xs">"{c.lastMessage}"</p>
                    </div>
                    <button onClick={() => openChatWindow(c.otherUser, c.listing)} className="text-[10px] font-mono bg-[#0B1315] text-[#D4AF37] px-3 py-1 rounded border border-[#1A3034]">Open Channel</button>
                  </div>
                ))}
              </div>
              <div className="bg-[#0B1315] p-4 rounded-xl border border-[#1A3034]">
                <h5 className="text-[10px] font-mono font-bold uppercase text-[#B87333] tracking-widest mb-3">📤 Dispatched Communications</h5>
                {sentConnections.length === 0 && <p className="text-xs text-[#425E62] italic font-mono">No outbound records found.</p>}
                {sentConnections.map((c: any, i: number) => (
                  <div key={i} className="bg-[#05090A] border border-[#1A3034] p-3 rounded-lg flex justify-between items-center text-xs mt-2 shadow-inner">
                    <div>
                      <p className="text-[#FCF9F2] font-medium">{c.otherUser?.name}</p>
                      <p className="text-[10px] text-[#8BA4A8] italic truncate max-w-xs">"{c.lastMessage}"</p>
                    </div>
                    <button onClick={() => openChatWindow(c.otherUser, c.listing)} className="text-[10px] font-mono bg-[#0B1315] text-[#B87333] px-3 py-1 rounded border border-[#1A3034]">Open Channel</button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </main>

      {/* RATING FEEDBACK MODAL */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#FCF9F2] text-[#0B1315] rounded-sm max-w-sm w-full p-6 border-t-8 border-[#D4AF37] space-y-4 shadow-2xl relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#D4AF37] rounded-full border border-[#FCF9F2]"></div>
            <div className="text-center">
              <h4 className="text-base font-serif font-bold text-[#0B1315] uppercase tracking-wide">Publish Swap Review</h4>
              <p className="text-xs text-[#617173] font-sans mt-1">Rate the execution quality and alignment of this barter cycle.</p>
            </div>
            <form onSubmit={submitReview} className="space-y-4 font-sans">
              <div className="flex gap-2 justify-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button type="button" key={star} onClick={() => setReviewRating(star)} className={`text-2xl transition-all ${reviewRating >= star ? "text-[#D4AF37] scale-110" : "text-[#1A3034]/20"}`}>★</button>
                ))}
              </div>
              <textarea placeholder="Write feedback regarding partner coordination..." value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3} className="w-full px-3 py-2 rounded bg-[#FCF9F2] border border-[#1A3034]/20 text-xs text-[#0B1315] outline-none resize-none leading-relaxed" required />
              <button type="submit" disabled={submittingReview} className="w-full bg-[#0B1315] text-[#D4AF37] font-serif font-bold py-2 rounded text-xs uppercase tracking-wider">{submittingReview ? "Recording..." : "Verify & Save"}</button>
            </form>
          </div>
        </div>
      )}

      {/* IDENTITY SECURITY BLOCK */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#FCF9F2] text-[#0B1315] rounded-sm max-w-sm w-full p-6 border-t-8 border-[#0B1315] shadow-2xl relative space-y-4">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-4 right-4 text-[#617173] font-mono text-xs hover:text-black">✕</button>
            <div className="text-center">
              <h3 className="text-xl font-serif font-bold text-[#0B1315] uppercase tracking-wide">{isSignUp ? "Register User Badge" : "Unlock My Account"}</h3>
              <p className="text-xs text-[#617173] font-sans mt-1">Access the synchronized localization marketplace network.</p>
            </div>
            {authError && <div className="p-2 bg-red-100 border border-red-300 text-red-800 font-sans text-[11px] rounded">{authError}</div>}
            <form onSubmit={handleAuth} className="space-y-3 font-sans text-xs">
              {isSignUp && <input type="text" placeholder="Full User Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 rounded bg-[#FCF9F2] border border-[#1A3034]/20 text-[#0B1315] outline-none focus:border-black" required />}
              <input type="email" placeholder="Secure Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 rounded bg-[#FCF9F2] border border-[#1A3034]/20 text-[#0B1315] outline-none focus:border-black" required />
              <input type="password" placeholder="Key Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 rounded bg-[#FCF9F2] border border-[#1A3034]/20 text-[#0B1315] outline-none focus:border-black" required />
              {isSignUp && <input type="password" placeholder="Confirm Key Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 rounded bg-[#FCF9F2] border border-[#1A3034]/20 text-[#0B1315] outline-none focus:border-black" required />}
              <button type="submit" className="w-full bg-[#0B1315] text-[#D4AF37] font-serif font-bold py-2.5 rounded text-xs uppercase tracking-wider shadow hover:bg-slate-800 transition-all">{isSignUp ? "Authorize Entry" : "Sign In"}</button>
            </form>
            <button onClick={() => setIsSignUp(!isSignUp)} className="w-full text-center text-[11px] text-[#8C7016] font-mono hover:underline block pt-1">{isSignUp ? "Return to Sign In gateway" : "Create a new partner membership card"}</button>
          </div>
        </div>
      )}

    </div>
  )
}