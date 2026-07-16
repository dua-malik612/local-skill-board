Sahi baat hai, aik hi dafa aisa clean setup de dete hain ke usey baar baar poochne ki zaroorat hi na paray. Next.js ke mutabiq APIs banane ke liye hum **Route Handlers** (`route.ts`) use karte hain.

Maine aapki har route (listings, profile, messages) ke liye front-end ke sath-sath backend API ka code bhi add kar diya hai, taake database integration ka poora skeleton tayyar ho jaye.

Aap bas apne naye folders mein niche diye gaye tareeqay se files update kar lein:

---

### 1. Listings Folder Setup

#### **`src/app/listings/page.tsx` (Front-end HTML)**

```tsx
"use client";
import { useEffect, useState } from "react";

export default function ListingsPage() {
  const [listings, setListings] = useState([]);

  useEffect(() => {
    fetch("/api/listings")
      .then((res) => res.json())
      .then((data) => setListings(data.data || []))
      .catch((err) => console.error("Error fetching listings:", err));
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Listings Dashboard</h1>
      <p>Manage and view all local skill postings below.</p>
      <div style={{ marginTop: "20px" }}>
        {listings.length === 0 ? (
          <p>Loading listings from database...</p>
        ) : (
          listings.map((item: any) => (
            <div key={item.id} style={{ border: "1px solid #ccc", padding: "10px", margin: "10px 0" }}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

```

#### **`src/app/api/listings/route.ts` (Backend API)**

*`listings` ke andar ek naya folder banayein `api` naam ka, phir uske andar `listings`, aur phir `route.ts` file.*

```typescript
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase.from("listings").select("*");
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data, error } = await supabase.from("listings").insert([body]).select();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

```

---

### 2. Profile Folder Setup

#### **`src/app/profile/page.tsx` (Front-end HTML)**

```tsx
"use client";
import { useEffect, useState } from "react";

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => setProfile(data.data))
      .catch((err) => console.error("Error fetching profile:", err));
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>User Profile Management</h1>
      {profile ? (
        <div style={{ marginTop: "20px" }}>
          <p><strong>Name:</strong> {profile.full_name}</p>
          <p><strong>Email:</strong> {profile.email}</p>
          <p><strong>Bio:</strong> {profile.bio}</p>
        </div>
      ) : (
        <p>Fetching user profile data...</p>
      )}
    </div>
  );
}

```

#### **`src/app/api/profile/route.ts` (Backend API)**

```typescript
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase.from("profiles").update(body).eq("id", user.id).select();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

```

---

### 3. Messages Folder Setup

#### **`src/app/messages/page.tsx` (Front-end HTML)**

```tsx
"use client";
import { useEffect, useState } from "react";

export default function MessagesPage() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    fetch("/api/messages")
      .then((res) => res.json())
      .then((data) => setMessages(data.data || []))
      .catch((err) => console.error("Error fetching messages:", err));
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Inbox & Chat History</h1>
      <div style={{ marginTop: "20px" }}>
        {messages.length === 0 ? (
          <p>No conversations found.</p>
        ) : (
          messages.map((msg: any) => (
            <div key={msg.id} style={{ padding: "10px", borderBottom: "1px solid #eee" }}>
              <p><strong>{msg.sender_id}:</strong> {msg.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

```

#### **`src/app/api/messages/route.ts` (Backend API)**

```typescript
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase.from("messages").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data, error } = await supabase.from("messages").insert([body]).select();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

```

---

### 4. Git Push Commands

Yeh saara code files mein save karne ke baad, terminal mein ye commands run kar dein taake sab kuch live chala jaye aur partner khud hi database sync kar sake:

```bash
git add .
git commit -m "Added complete front-end fetching logic and backend API endpoints for listings, profile, and messages"
git push

```

Ab woh aapse aik sawal bhi nahi pooch sakega kyunki front-end state management aur backend Supabase queries dono ka structure tayyar hai.